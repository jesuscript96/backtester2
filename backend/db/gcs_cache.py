"""
GCS data cache layer.

Provides three tiers of data access:
  1. HOT  — strategies / saved_queries: tiny tables cached in-process as DataFrames
  2. WARM — daily_metrics: downloaded to local parquet, queried from local disk
  3. COLD — intraday_1m: streamed from GCS month-by-month during backtest
"""

import gc
import logging
import os
import time
from pathlib import Path

import duckdb
import pandas as pd

from backend.config import (
    GCS_ACCESS_KEY_ID,
    GCS_SECRET_ACCESS_KEY,
    GCS_BUCKET,
    CACHE_DIR,
    CACHE_TTL_HOURS,
    DUCKDB_MEMORY_LIMIT,
)

logger = logging.getLogger("backtester.cache")

# ---------------------------------------------------------------------------
# In-process hot cache
# ---------------------------------------------------------------------------
_hot_cache: dict = {
    "strategies": None,
    "saved_queries": None,
    "_synced_at": 0.0,
}


def _create_gcs_reader() -> duckdb.DuckDBPyConnection:
    """One-shot DuckDB connection configured for GCS reads."""
    conn = duckdb.connect(":memory:")
    conn.execute("INSTALL httpfs; LOAD httpfs;")
    conn.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
    conn.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
    conn.execute("SET s3_endpoint='storage.googleapis.com';")
    conn.execute("SET s3_region='us-east-1';")
    conn.execute(f"SET memory_limit='{DUCKDB_MEMORY_LIMIT}';")
    return conn


# ---- HOT tables -----------------------------------------------------------

def sync_hot_tables(force: bool = False):
    """Download strategies + saved_queries from GCS into memory."""
    global _hot_cache

    if not force and _hot_cache["_synced_at"] > 0:
        age_h = (time.time() - _hot_cache["_synced_at"]) / 3600
        if age_h < CACHE_TTL_HOURS:
            return

    t0 = time.time()
    conn = _create_gcs_reader()

    for table in ("strategies", "saved_queries"):
        path = f"gs://{GCS_BUCKET}/cold_storage/{table}/*.parquet"
        try:
            df = conn.execute(
                f"SELECT * FROM read_parquet('{path}', hive_partitioning=true)"
            ).fetchdf()
            _hot_cache[table] = df
            logger.info(f"  hot sync {table}: {len(df)} rows")
        except Exception as e:
            logger.error(f"  hot sync {table} FAILED: {e}")
            if _hot_cache[table] is None:
                _hot_cache[table] = pd.DataFrame()

    conn.close()
    _hot_cache["_synced_at"] = time.time()
    logger.info(f"Hot tables synced ({round(time.time() - t0, 2)}s)")


def get_strategies_df() -> pd.DataFrame:
    if _hot_cache["strategies"] is None:
        sync_hot_tables()
    return _hot_cache["strategies"]


def get_saved_queries_df() -> pd.DataFrame:
    if _hot_cache["saved_queries"] is None:
        sync_hot_tables()
    return _hot_cache["saved_queries"]


# ---- WARM: daily_metrics local cache --------------------------------------

def ensure_daily_metrics_cached(years: set[int]):
    """Download daily_metrics parquet partitions to local disk."""
    cache_dir = Path(CACHE_DIR) / "daily_metrics"
    cache_dir.mkdir(parents=True, exist_ok=True)

    years_needed: set[int] = set()
    for y in years:
        local_file = cache_dir / f"dm_{y}.parquet"
        if local_file.exists():
            age = time.time() - local_file.stat().st_mtime
            if age < CACHE_TTL_HOURS * 3600:
                continue
        years_needed.add(y)

    if not years_needed:
        return

    t0 = time.time()
    conn = _create_gcs_reader()
    for y in sorted(years_needed):
        src = f"gs://{GCS_BUCKET}/cold_storage/daily_metrics/year={y}/month=*/*.parquet"
        dest = str(cache_dir / f"dm_{y}.parquet")
        try:
            df = conn.execute(
                f"SELECT * FROM read_parquet('{src}', hive_partitioning=true)"
            ).fetchdf()
            df.to_parquet(dest)
            logger.info(f"  cached daily_metrics year={y}: {len(df)} rows")
            del df
        except Exception as e:
            logger.error(f"  cache daily_metrics year={y} FAILED: {e}")
    conn.close()
    logger.info(f"Daily-metrics cache update ({round(time.time() - t0, 2)}s)")


def query_daily_metrics_local(years: set[int], where_clause: str) -> pd.DataFrame:
    """Query daily_metrics from local parquet cache."""
    ensure_daily_metrics_cached(years)

    cache_dir = Path(CACHE_DIR) / "daily_metrics"
    paths = [
        str(cache_dir / f"dm_{y}.parquet")
        for y in sorted(years)
        if (cache_dir / f"dm_{y}.parquet").exists()
    ]
    if not paths:
        logger.warning("No daily_metrics cache files found")
        return pd.DataFrame()

    paths_sql = "[" + ", ".join(f"'{p}'" for p in paths) + "]"
    conn = duckdb.connect(":memory:")
    try:
        return conn.execute(
            f"SELECT * FROM read_parquet({paths_sql}) WHERE {where_clause}"
        ).fetchdf()
    finally:
        conn.close()


# ---- COLD: intraday streaming ----------------------------------------------

def fetch_intraday_for_month(
    year: int,
    month: int,
    tickers: list[str],
    date_from: str,
    date_to: str,
) -> pd.DataFrame:
    """Fetch one month of intraday data from GCS for the given tickers."""
    t0 = time.time()
    conn = _create_gcs_reader()

    src = f"gs://{GCS_BUCKET}/cold_storage/intraday_1m/year={year}/month={month}/*.parquet"

    if len(tickers) > 5000:
        ticker_filter = "1=1"
    else:
        ticker_filter = "i.ticker IN ('" + "', '".join(tickers) + "')"

    date_filter = f"CAST(i.date AS VARCHAR) >= '{date_from}' AND CAST(i.date AS VARCHAR) <= '{date_to}'"

    sql = f"""
    SELECT i.ticker, i.date, i."timestamp",
           i.open, i.high, i.low, i."close", i.volume
    FROM read_parquet('{src}', hive_partitioning=true) i
    WHERE {ticker_filter} AND {date_filter}
    """

    try:
        df = conn.execute(sql).fetchdf()
        logger.info(
            f"  intraday {year}-{month:02d}: {len(df)} rows, "
            f"{df['ticker'].nunique() if not df.empty else 0} tickers "
            f"({round(time.time() - t0, 2)}s)"
        )
        # Downcast for memory savings
        for col in ("open", "high", "low", "close"):
            if col in df.columns:
                df[col] = df[col].astype("float32")
        if "volume" in df.columns:
            df["volume"] = df["volume"].astype("int32")
        if "ticker" in df.columns:
            df["ticker"] = df["ticker"].astype("category")
        if "date" in df.columns:
            df["date"] = df["date"].astype("category")
        return df
    except Exception as e:
        logger.error(f"  intraday {year}-{month:02d} FAILED: {e}")
        return pd.DataFrame()
    finally:
        conn.close()


def iter_intraday_groups_streamed(
    qualifying_df: pd.DataFrame,
    date_from: str,
    date_to: str,
):
    """
    Generator yielding ((date, ticker), day_df) groups month-by-month.

    Preserves chronological order so that daily compounding is correct.
    Peak memory ≈ one month of intraday data (~400-800 MB for ~1400 tickers).
    """
    if qualifying_df.empty:
        return

    # Determine (year, month) pairs in chronological order
    dates = pd.to_datetime(qualifying_df["date"])
    ym_pairs = sorted(set(zip(dates.dt.year, dates.dt.month)))

    for year, month in ym_pairs:
        # Tickers that qualify in this month
        mask = (dates.dt.year == year) & (dates.dt.month == month)
        month_qualifying = qualifying_df[mask]
        month_tickers = month_qualifying["ticker"].unique().tolist()

        if not month_tickers:
            continue

        intraday = fetch_intraday_for_month(
            year, month, month_tickers, date_from, date_to
        )
        if intraday.empty:
            continue

        # Filter to exact (ticker, date) pairs
        valid_pairs = month_qualifying[["ticker", "date"]].drop_duplicates().copy()
        valid_pairs["date"] = valid_pairs["date"].astype(str)
        intraday["date"] = intraday["date"].astype(str)
        intraday = intraday.merge(valid_pairs, on=["ticker", "date"], how="inner")

        if intraday.empty:
            continue

        # GroupBy in chronological order — same as run_backtest expects
        grouped = intraday.groupby(["date", "ticker"])
        for key, day_df in grouped:
            yield key, day_df

        del intraday, grouped
        gc.collect()
