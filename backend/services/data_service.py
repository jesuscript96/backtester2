"""
Fetches data from MotherDuck for backtesting.
Datasets define (ticker, date) pairs via two normalized tables;
daily stats come from daily_metrics; intraday candles come from intraday_1m.
"""

import ctypes
import gc
import json
import logging
import sys
import time
import uuid
import pandas as pd
from backend.db.connection import query_df, execute_sql

logger = logging.getLogger("backtester.data")


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

def list_strategies() -> list[dict]:
    df = query_df(
        "SELECT id, name, description, definition, created_at, updated_at "
        "FROM my_db.main.strategies ORDER BY updated_at DESC"
    )
    rows = []
    for _, r in df.iterrows():
        try:
            definition = r["definition"] if isinstance(r["definition"], dict) else json.loads(r["definition"] or "{}")
        except Exception:
            definition = {}
        rows.append({
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "definition": definition,
            "created_at": str(r["created_at"]) if pd.notnull(r["created_at"]) else None,
            "updated_at": str(r["updated_at"]) if pd.notnull(r["updated_at"]) else None,
        })
    return rows


def get_strategy(strategy_id: str) -> dict | None:
    df = query_df(
        "SELECT id, name, description, definition FROM my_db.main.strategies WHERE id = ?",
        [strategy_id],
    )
    if df.empty:
        return None
    r = df.iloc[0]
    try:
        definition = r["definition"] if isinstance(r["definition"], dict) else json.loads(r["definition"] or "{}")
    except Exception:
        definition = {}
    return {
        "id": r["id"],
        "name": r["name"],
        "description": r["description"],
        "definition": definition,
    }


# ---------------------------------------------------------------------------
# Datasets CRUD
# ---------------------------------------------------------------------------

def list_datasets() -> list[dict]:
    # Returns saved_queries as datasets
    df = query_df("""
        SELECT 
            id, 
            name, 
            NULL as pair_count, 
            created_at,
            NULL as min_date,
            NULL as max_date
        FROM my_db.main.saved_queries
        ORDER BY created_at DESC
    """)
    if not df.empty:
        # Convert to object type to allow strings and None values without coercion to NaN
        df = df.astype(object)
        if "created_at" in df.columns:
            df["created_at"] = df["created_at"].apply(lambda x: str(x) if pd.notnull(x) else None)
        # Replace NaN with None for JSON compliance
        df = df.where(pd.notnull(df), None)
    return df.to_dict(orient="records")


def get_dataset(dataset_id: str) -> dict | None:
    # Returns info about a saved_query
    ds = query_df("SELECT id, name, created_at, filters FROM my_db.main.saved_queries WHERE id = ?", [dataset_id])
    if ds.empty:
        return None
    row = ds.iloc[0]
    return {
        "id": row["id"],
        "name": row["name"],
        "created_at": str(row["created_at"]) if pd.notnull(row["created_at"]) else None,
        "filters": row["filters"] if isinstance(row["filters"], dict) else json.loads(row["filters"] or "{}"),
        "pair_count": 0,
        "min_date": None,
        "max_date": None,
        "pairs": [], # No strict static pairs anymore, calculated at run time
    }


def create_dataset(name: str, pairs: list[dict]) -> dict:
    raise NotImplementedError("create_dataset is deprecated. Use saved_queries.")


def delete_dataset(dataset_id: str) -> bool:
    raise NotImplementedError("delete_dataset is deprecated.")


# ---------------------------------------------------------------------------
# Data fetching for backtest
# ---------------------------------------------------------------------------

def fetch_dataset_data(dataset_id: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Fetches data using dynamic filters from saved_queries.
    """
    t0 = time.time()
    
    # 1. Get filters
    ds = query_df("SELECT filters FROM my_db.main.saved_queries WHERE id = ?", [dataset_id])
    if ds.empty:
        logger.error(f"Dataset {dataset_id} not found in saved_queries")
        return pd.DataFrame(), pd.DataFrame()
    
    filters_json = ds.iloc[0]["filters"]
    if isinstance(filters_json, str):
        filters = json.loads(filters_json)
    else:
        filters = filters_json or {}
    
    start_date = filters.get("start_date") or filters.get("date_from")
    end_date = filters.get("end_date") or filters.get("date_to")
    rules = filters.get("rules", [])
    
    # 2. Build dynamic WHERE clause
    where_parts = []
    if start_date:
        where_parts.append(f"CAST(\"timestamp\" AS DATE) >= '{start_date}'")
    if end_date:
        where_parts.append(f"CAST(\"timestamp\" AS DATE) <= '{end_date}'")
        
    for rule in rules:
        field = rule.get("field") or rule.get("metric")
        # Map metric names if needed (from BTT style to DB style)
        field_map = {
            "Open Price": "rth_open",
            "Close Price": "rth_close",
            "High Price": "rth_high",
            "Low Price": "rth_low",
            "EOD Volume": "rth_volume",
            "Premarket Volume": "pm_volume",
            "Open Gap %": "gap_pct",
            "PMH Gap %": "pmh_gap_pct",
            "RTH Run %": "rth_run_pct",
            "High Spike %": "high_spike_pct",
            "Low Spike %": "low_spike_pct",
            "M15 Return %": "m15_return_pct",
            "M30 Return %": "m30_return_pct",
            "M60 Return %": "m60_return_pct",
            "Day Return %": "day_return_pct",
            "Previous Close": "prev_close",
            "RTH Range %": "rth_range_pct"
        }
        field = field_map.get(field, field)
        
        op = rule.get("operator")
        val = rule.get("value")
        if field and op and val is not None:
            # Map operators to SQL
            sql_op = {
                "GREATER_THAN": ">",
                "LESS_THAN": "<",
                "GREATER_THAN_OR_EQUAL": ">=",
                "LESS_THAN_OR_EQUAL": "<=",
                "EQUAL": "=",
                "CONTAINS": "LIKE"
            }.get(op, op) # Default to op if it's already SQL style (like colleague's version)
            
            # Simple sanitization/formatting
            if isinstance(val, str):
                if sql_op == "LIKE":
                    val = f"'%{val}%'"
                else:
                    # Check if it's numeric even if passed as string
                    try:
                        float(val)
                        val = val
                    except ValueError:
                        val = f"'{val}'"
            
            where_parts.append(f"{field} {sql_op} {val}")
            
    where_clause = " AND ".join(where_parts) if where_parts else "1=1"
    
    # 3. Fetch qualifying data from daily_metrics
    qualifying_sql = f"""
    WITH enriched AS (
        SELECT *,
               CAST("timestamp" AS DATE) AS date,
               LAG(rth_high) OVER (PARTITION BY ticker ORDER BY "timestamp") AS yesterday_high,
               LAG(rth_low)  OVER (PARTITION BY ticker ORDER BY "timestamp") AS yesterday_low,
               prev_close AS previous_close
        FROM my_db.main.daily_metrics
    )
    SELECT * FROM enriched
    WHERE {where_clause}
    """
    qualifying = query_df(qualifying_sql)
    t_q = time.time()
    logger.info(f"qualifying query: {len(qualifying)} rows ({round(t_q - t0, 2)}s)")
    
    if qualifying.empty:
        return qualifying, pd.DataFrame()
        
    # 4. Fetch intraday candles for matching (ticker, date)
    # We'll build a query with the valid pairs
    pairs_list = qualifying[["ticker", "date"]].values.tolist()
    if not pairs_list:
        return qualifying, pd.DataFrame()
        
    pairs_sql_values = ", ".join([f"('{t}', '{d}')" for t, d in pairs_list])

    intraday_sql = f"""
    WITH valid_pairs(ticker, date) AS (
        VALUES {pairs_sql_values}
    )
    SELECT i.ticker, i.date, i."timestamp", i.open, i.high, i.low,
           i."close", i.volume
    FROM my_db.main.intraday_1m i
    INNER JOIN valid_pairs vp ON i.ticker = vp.ticker AND i.date = vp.date
    """
    intraday = query_df(intraday_sql)
    t_i = time.time()
    logger.info(f"intraday query: {len(intraday)} rows ({round(t_i - t_q, 2)}s)")

    for col in ("open", "high", "low", "close"):
        if col in intraday.columns:
            intraday[col] = intraday[col].astype("float32")
    if "volume" in intraday.columns:
        intraday["volume"] = intraday["volume"].astype("int32")
    if "ticker" in intraday.columns:
        intraday["ticker"] = intraday["ticker"].astype("category")
    if "date" in intraday.columns:
        intraday["date"] = intraday["date"].astype("category")

    gc.collect()
    return qualifying, intraday


def fetch_day_candles(dataset_id: str, ticker: str, date: str) -> list[dict]:
    # Need to verify if the day belongs to the saved_query (optional but good)
    sql = """
    SELECT i."timestamp", i.open, i.high, i.low, i."close", i.volume
    FROM my_db.main.intraday_1m i
    WHERE i.ticker = ? AND i.date = CAST(? AS DATE)
    ORDER BY i."timestamp"
    """
    df = query_df(sql, [ticker, date])
    if df.empty:
        return []

    timestamps = pd.to_datetime(df["timestamp"])
    ts_epoch = timestamps.values.astype("datetime64[s]").astype("int64")

    # Compute VWAP from start of day: Cumulative(TP*V) / Cumulative(V)
    import numpy as np
    highs = df["high"].values.astype(float)
    lows = df["low"].values.astype(float)
    closes = df["close"].values.astype(float)
    volumes = df["volume"].values.astype(float)

    typical = (highs + lows + closes) / 3.0
    cum_tp_vol = np.cumsum(typical * volumes)
    cum_vol = np.cumsum(volumes)
    with np.errstate(divide="ignore", invalid="ignore"):
        vwap_arr = np.where(cum_vol > 0, cum_tp_vol / cum_vol, np.nan)
    vwap_values = [round(float(v), 6) if not np.isnan(v) else None for v in vwap_arr]

    return [
        {
            "time": int(ts_epoch[j]),
            "open": float(df.iloc[j]["open"]),
            "high": float(highs[j]),
            "low": float(lows[j]),
            "close": float(closes[j]),
            "volume": int(volumes[j]),
            "vwap": vwap_values[j],
        }
        for j in range(len(df))
    ]
