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
        "FROM strategies ORDER BY updated_at DESC"
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
        "SELECT id, name, description, definition FROM strategies WHERE id = ?",
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
            filters,
            created_at
        FROM saved_queries
        ORDER BY created_at DESC
    """)
    if df.empty:
        return []

    # Extract min_date/max_date from filters JSON (no expensive COUNT queries against GCS)
    min_dates = []
    max_dates = []
    for _, row in df.iterrows():
        filters_json = row["filters"]
        if isinstance(filters_json, str):
            try:
                filters = json.loads(filters_json)
            except Exception:
                filters = {}
        else:
            filters = filters_json or {}

        min_dates.append(filters.get("start_date") or filters.get("date_from"))
        max_dates.append(filters.get("end_date") or filters.get("date_to"))

    # pair_count is not computed here to avoid 25s+ GCS scans on every page load.
    # It can be fetched on demand via GET /api/datasets/{id} if needed.
    df["pair_count"] = 0
    df["min_date"] = min_dates
    df["max_date"] = max_dates
    df = df.drop(columns=["filters"])


    # Convert to object type to allow strings and None values without coercion to NaN
    df = df.astype(object)
    if "created_at" in df.columns:
        df["created_at"] = df["created_at"].apply(lambda x: str(x) if pd.notnull(x) else None)
    # Replace NaN with None for JSON compliance
    df = df.where(pd.notnull(df), None)
    return df.to_dict(orient="records")


def get_dataset(dataset_id: str) -> dict | None:
    # Returns info about a saved_query
    ds = query_df("SELECT id, name, created_at, filters FROM saved_queries WHERE id = ?", [dataset_id])
    if ds.empty:
        return None
    row = ds.iloc[0]
    
    filters_json = row["filters"]
    if isinstance(filters_json, str):
        filters = json.loads(filters_json)
    else:
        filters = filters_json or {}
    
    where_clause = _build_where_clause(filters)
    count_df = query_df(f"SELECT COUNT(*) as count FROM daily_metrics WHERE {where_clause}")
    pair_count = int(count_df.iloc[0]["count"]) if not count_df.empty else 0
        
    return {
        "id": row["id"],
        "name": row["name"],
        "created_at": str(row["created_at"]) if pd.notnull(row["created_at"]) else None,
        "filters": filters,
        "pair_count": pair_count,
        "min_date": filters.get("start_date") or filters.get("date_from"),
        "max_date": filters.get("end_date") or filters.get("date_to"),
        "pairs": [], # No strict static pairs anymore, calculated at run time
    }


def create_dataset(name: str, pairs: list[dict]) -> dict:
    raise NotImplementedError("create_dataset is deprecated. Use saved_queries.")


def delete_dataset(dataset_id: str) -> bool:
    raise NotImplementedError("delete_dataset is deprecated.")


# ---------------------------------------------------------------------------
# Data fetching for backtest
# ---------------------------------------------------------------------------

def _build_where_clause(filters: dict) -> str:
    start_date = filters.get("start_date") or filters.get("date_from")
    end_date = filters.get("end_date") or filters.get("date_to")
    rules = filters.get("rules", [])
    
    min_gap_pct = filters.get("min_gap_pct")
    max_gap_pct = filters.get("max_gap_pct")
    min_pm_volume = filters.get("min_pm_volume")
    
    where_parts = []
    if start_date:
        where_parts.append(f"CAST('timestamp' AS DATE) >= '{start_date}'".replace("'timestamp'", '"timestamp"'))
    if end_date:
        where_parts.append(f"CAST('timestamp' AS DATE) <= '{end_date}'".replace("'timestamp'", '"timestamp"'))
        
    if min_gap_pct is not None:
        where_parts.append(f"gap_pct >= {min_gap_pct}")
    if max_gap_pct is not None:
        where_parts.append(f"gap_pct <= {max_gap_pct}")
    if min_pm_volume is not None:
        where_parts.append(f"pm_volume >= {min_pm_volume}")
        
    for rule in rules:
        field = rule.get("field") or rule.get("metric")
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
            sql_op = {
                "GREATER_THAN": ">",
                "LESS_THAN": "<",
                "GREATER_THAN_OR_EQUAL": ">=",
                "LESS_THAN_OR_EQUAL": "<=",
                "EQUAL": "=",
                "CONTAINS": "LIKE"
            }.get(op, op)
            
            if isinstance(val, str):
                if sql_op == "LIKE":
                    val = f"'%{val}%'"
                else:
                    try:
                        float(val)
                    except ValueError:
                        val = f"'{val}'"
            where_parts.append(f"{field} {sql_op} {val}")
            
    return " AND ".join(where_parts) if where_parts else "1=1"


def fetch_dataset_data(dataset_id: str, req_start_date: str | None = None, req_end_date: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Fetches data using dynamic filters from saved_queries.
    """
    t0 = time.time()
    
    # 1. Look up the saved_query filters
    ds = query_df("SELECT filters FROM saved_queries WHERE id = ?", [dataset_id])
    if ds.empty:
        logger.error(f"Dataset {dataset_id} not found in saved_queries")
        return pd.DataFrame(), pd.DataFrame()
        
    ds_filters = ds.iloc[0]["filters"]
    if ds_filters and not isinstance(ds_filters, dict):
        ds_filters = json.loads(ds_filters)
    if not ds_filters:
        ds_filters = {}
        
    if req_start_date: ds_filters["start_date"] = req_start_date
    if req_end_date: ds_filters["end_date"] = req_end_date
        
    df_from = ds_filters.get("start_date") or ds_filters.get("date_from")
    df_to = ds_filters.get("end_date") or ds_filters.get("date_to")
    
    years_to_fetch = set()
    if df_from and df_to:
        try:
            sy, ey = int(df_from[:4]), int(df_to[:4])
            for y in range(sy, ey + 1):
                years_to_fetch.add(y)
        except Exception:
            pass
            
    from backend.config import GCS_BUCKET
    if years_to_fetch:
        dm_paths = "[" + ", ".join([f"'gs://{GCS_BUCKET}/cold_storage/daily_metrics/year={y}/month=*/*.parquet'" for y in sorted(years_to_fetch)]) + "]"
        im_paths = "[" + ", ".join([f"'gs://{GCS_BUCKET}/cold_storage/intraday_1m/year={y}/month=*/*.parquet'" for y in sorted(years_to_fetch)]) + "]"
    else:
        dm_paths = f"'gs://{GCS_BUCKET}/cold_storage/daily_metrics/*/*/*.parquet'"
        im_paths = f"'gs://{GCS_BUCKET}/cold_storage/intraday_1m/*/*/*.parquet'"
        
    dm_source = f"read_parquet({dm_paths}, hive_partitioning=true)"
    im_source = f"read_parquet({im_paths}, hive_partitioning=true)"

    where_clause = _build_where_clause(ds_filters)
    
    # 3. Fetch qualifying data from daily_metrics
    qualifying_sql = f"""
    WITH filtered_dm AS (
        SELECT dm.*, CAST(dm."timestamp" AS DATE) AS date
        FROM {dm_source} dm
        WHERE {where_clause}
    ),
    enriched AS (
        SELECT f.*,
               LAG(f.rth_high) OVER (PARTITION BY f.ticker ORDER BY f."timestamp") AS yesterday_high,
               LAG(f.rth_low)  OVER (PARTITION BY f.ticker ORDER BY f."timestamp") AS yesterday_low,
               f.prev_close AS previous_close
        FROM filtered_dm f
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
    # 4. Fetch intraday candles using simple range + ticker filter.
    # Exact (ticker, date) pair matching is done in pandas AFTER the download.
    # This avoids massive SQL VALUES/IN clauses that hang DuckDB with 1000+ pairs.
    unique_tickers = qualifying["ticker"].unique().tolist()

    if len(unique_tickers) > 5000:
        ticker_filter = "1=1"
    else:
        ticker_filter = "i.ticker IN ('" + "', '".join(unique_tickers) + "')"

    # Use date range instead of IN clause — much simpler SQL, DuckDB handles better
    if df_from and df_to:
        date_range_filter = f"i.date >= '{df_from}' AND i.date <= '{df_to}'"
    elif df_from:
        date_range_filter = f"i.date >= '{df_from}'"
    elif df_to:
        date_range_filter = f"i.date <= '{df_to}'"
    else:
        date_range_filter = "1=1"

    # Add hive partition pushdown for year (avoids scanning irrelevant parquet files)
    year_filter = "1=1"
    try:
        if df_from and df_to:
            year_filter = f"i.year >= {int(df_from[:4])} AND i.year <= {int(df_to[:4])}"
        elif df_from:
            year_filter = f"i.year >= {int(df_from[:4])}"
        elif df_to:
            year_filter = f"i.year <= {int(df_to[:4])}"
    except Exception:
        pass

    intraday_sql = f"""
    SELECT i.ticker, i.date, i."timestamp", i.open, i.high, i.low,
           i."close", i.volume
    FROM {im_source} i
    WHERE ( {ticker_filter} ) AND ( {date_range_filter} ) AND ( {year_filter} )
    """

    logger.info(f"intraday SQL: {len(unique_tickers)} tickers, range {df_from} -> {df_to}")
    intraday = query_df(intraday_sql)
    t_i = time.time()
    logger.info(f"intraday raw query: {len(intraday)} rows ({round(t_i - t_q, 2)}s)")

    # Filter to exact (ticker, date) pairs from qualifying using pandas merge
    if not intraday.empty and not qualifying.empty:
        valid_pairs = qualifying[["ticker", "date"]].drop_duplicates().copy()
        valid_pairs["date"] = valid_pairs["date"].astype(str)
        intraday["date"] = intraday["date"].astype(str)
        intraday = intraday.merge(valid_pairs, on=["ticker", "date"], how="inner")
        logger.info(f"intraday after pair filter: {len(intraday)} rows")

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
    try:
        dt_year = int(date[:4])
        dt_month = int(date[5:7])
        part_filter = f" AND i.year = {dt_year} AND i.month = {dt_month}"
        from backend.config import GCS_BUCKET
        im_source = f"read_parquet('gs://{GCS_BUCKET}/cold_storage/intraday_1m/year={dt_year}/month={dt_month}/*.parquet', hive_partitioning=true)"
    except Exception:
        part_filter = ""
        im_source = "intraday_1m"
        
    sql = f"""
    SELECT i."timestamp", i.open, i.high, i.low, i."close", i.volume
    FROM {im_source} i
    WHERE i.ticker = ? AND i.date = CAST(? AS DATE) {part_filter}
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
