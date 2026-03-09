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
        definition = r["definition"] if isinstance(r["definition"], dict) else json.loads(r["definition"])
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
    definition = r["definition"] if isinstance(r["definition"], dict) else json.loads(r["definition"])
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
    # We now map list_datasets to my_db.main.saved_queries
    df = query_df("""
        SELECT id, name, created_at
        FROM my_db.main.saved_queries
        ORDER BY created_at DESC
    """)
    if not df.empty and "created_at" in df.columns:
        df["created_at"] = df["created_at"].astype(str)
        # Add a dummy pair_count for compatibility with frontend
        df["pair_count"] = 0
    return df.to_dict(orient="records")


def get_dataset(dataset_id: str) -> dict | None:
    ds = query_df("SELECT id, name, filters, created_at FROM my_db.main.saved_queries WHERE id = ?", [dataset_id])
    if ds.empty:
        return None
        
    row = ds.iloc[0]
    return {
        "id": row["id"],
        "name": row["name"],
        "created_at": str(row["created_at"]) if pd.notnull(row["created_at"]) else None,
        "filters": row["filters"] if isinstance(row["filters"], dict) else json.loads(row["filters"] or "{}"),
        "pair_count": 0,
        "pairs": [], # No strict static pairs anymore, calculated at run time
    }


def create_dataset(name: str, pairs: list[dict]) -> dict:
    ds_id = str(uuid.uuid4())
    execute_sql("INSERT INTO datasets (id, name) VALUES (?, ?)", [ds_id, name])
    for p in pairs:
        execute_sql(
            "INSERT INTO dataset_pairs (dataset_id, ticker, date) VALUES (?, ?, ?)",
            [ds_id, p["ticker"], p["date"]],
        )
    return {"id": ds_id, "name": name, "pair_count": len(pairs)}


def delete_dataset(dataset_id: str) -> bool:
    execute_sql("DELETE FROM dataset_pairs WHERE dataset_id = ?", [dataset_id])
    execute_sql("DELETE FROM datasets WHERE id = ?", [dataset_id])
    return True


# ---------------------------------------------------------------------------
# Data fetching for backtest
# ---------------------------------------------------------------------------

def fetch_dataset_data(dataset_id: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Returns:
        qualifying: daily stats from daily_metrics enriched with yesterday_high/low
        intraday: raw 1m candles from intraday_1m (memory-optimised dtypes)
    """
    t0 = time.time()
    
    # 1. Look up the saved_query filters
    ds = query_df("SELECT filters FROM my_db.main.saved_queries WHERE id = ?", [dataset_id])
    ds_filters = ds.iloc[0]["filters"] if not ds.empty else None
    if ds_filters and not isinstance(ds_filters, dict):
        ds_filters = json.loads(ds_filters)
    
    # Metric map from BTT for dynamic rules
    METRIC_MAP = {
        "Open Price": "rth_open",
        "Close Price": "rth_close",
        "High Price": "rth_high",
        "Low Price": "rth_low",
        "EOD Volume": "rth_volume",
        "Premarket Volume": "pm_volume",
        "Open Gap %": "gap_at_open_pct", # in daily_metrics it's gap_pct usually, let's map correctly
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
        
    where_clauses = ["1=1"]
    params = []
    
    if ds_filters:
        if ds_filters.get("ticker"):
            where_clauses.append("ticker = ?")
            params.append(ds_filters["ticker"].upper())
        if ds_filters.get("min_gap_pct") is not None:
            where_clauses.append("gap_pct >= ?")
            params.append(ds_filters["min_gap_pct"])
        if ds_filters.get("max_gap_pct") is not None:
            where_clauses.append("gap_pct <= ?")
            params.append(ds_filters["max_gap_pct"])
        if ds_filters.get("min_rth_volume") is not None:
            where_clauses.append("rth_volume >= ?")
            params.append(ds_filters["min_rth_volume"])
        if ds_filters.get("date_from"):
            where_clauses.append("CAST(\"timestamp\" AS VARCHAR)[:10] >= ?")
            params.append(ds_filters["date_from"])
        if ds_filters.get("date_to"):
            where_clauses.append("CAST(\"timestamp\" AS VARCHAR)[:10] <= ?")
            params.append(ds_filters["date_to"])
        
        # Extended
        if ds_filters.get("min_m15_ret_pct") is not None:
            where_clauses.append("m15_return_pct >= ?")
            params.append(ds_filters["min_m15_ret_pct"])
        if ds_filters.get("max_m15_ret_pct") is not None:
            where_clauses.append("m15_return_pct <= ?")
            params.append(ds_filters["max_m15_ret_pct"])
        if ds_filters.get("min_rth_run_pct") is not None:
            where_clauses.append("rth_run_pct >= ?")
            params.append(ds_filters["min_rth_run_pct"])
        if ds_filters.get("max_rth_run_pct") is not None:
            where_clauses.append("rth_run_pct <= ?")
            params.append(ds_filters["max_rth_run_pct"])
        if ds_filters.get("hod_after"):
            where_clauses.append("hod_time >= ?")
            params.append(ds_filters["hod_after"])
        if ds_filters.get("lod_before"):
            where_clauses.append("lod_time <= ?")
            params.append(ds_filters["lod_before"])
            
        # Dynamic rules
        rules = ds_filters.get("rules", [])
        for rule in rules:
            col = METRIC_MAP.get(rule.get("metric"))
            op = rule.get("operator")
            vtype = rule.get("valueType")
            val = rule.get("value")
            
            if col and op in ["=", "!=", ">", ">=", "<", "<="]:
                if vtype == "static":
                    try:
                        v = float(val)
                        where_clauses.append(f"{col} {op} ?")
                        params.append(v)
                    except ValueError:
                        if val:
                            where_clauses.append(f"{col} {op} ?")
                            params.append(val)
                elif vtype == "variable":
                    target_col = METRIC_MAP.get(val)
                    if target_col:
                        where_clauses.append(f"{col} {op} {target_col}")

    where_sql = " AND ".join(where_clauses)
    
    qualifying_sql = f"""
    WITH filtered_dm AS (
        SELECT dm.*, CAST(dm."timestamp" AS DATE) AS date
        FROM my_db.main.daily_metrics dm
        WHERE {where_sql}
    ),
    enriched AS (
        SELECT f.*,
               LAG(f.rth_high) OVER (PARTITION BY f.ticker ORDER BY f."timestamp") AS yesterday_high,
               LAG(f.rth_low)  OVER (PARTITION BY f.ticker ORDER BY f."timestamp") AS yesterday_low,
               f.prev_close AS previous_close
        FROM filtered_dm f
    )
    SELECT e.*
    FROM enriched e
    """
    qualifying = query_df(qualifying_sql, params)
    t_q = time.time()
    logger.info(f"qualifying query: {len(qualifying)} rows ({round(t_q - t0, 2)}s)")

    if qualifying.empty:
        return qualifying, pd.DataFrame()

    # Create temporary table or just use values clause for tickers/dates
    # For large dfs, python drivers handle parameter arrays fine, or we inner join locally.
    # DuckDB handles IN clauses well if we use strings.
    # Instead of pulling ALL intraday, let's explicitly select based on the qualified subset
    # Since we can't easily join a dataframe inside SQL without registering it (which needs connection mgmt), 
    # we'll build a query with the valid pairs if it's small, or we can just pull intraday for the relevant tickers and dates.
    
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
    if sys.platform == "linux":
        try:
            ctypes.CDLL("libc.so.6").malloc_trim(0)
        except Exception:
            pass

    return qualifying, intraday


def fetch_day_candles(dataset_id: str, ticker: str, date: str) -> list[dict]:
    sql = """
    SELECT i."timestamp", i.open, i.high, i.low, i."close", i.volume
    FROM my_db.main.intraday_1m i
    WHERE i.ticker = ? AND i.date = CAST(? AS DATE)
    ORDER BY i."timestamp"
    """
    df = query_df(sql, [ticker, date])
    if df.empty:
        return []
    ts = pd.to_datetime(df["timestamp"]).values.astype("datetime64[s]").astype("int64")
    return [
        {
            "time": int(ts[j]),
            "open": float(df.iloc[j]["open"]),
            "high": float(df.iloc[j]["high"]),
            "low": float(df.iloc[j]["low"]),
            "close": float(df.iloc[j]["close"]),
            "volume": int(df.iloc[j]["volume"]),
        }
        for j in range(len(df))
    ]
