"""
GCS data cache layer.

Provides three tiers of data access:
  1. HOT  — strategies / saved_queries: tiny tables cached in-process as DataFrames
  2. WARM — daily_metrics qualifying data: queried from GCS with filter pushdown
  3. COLD — intraday_1m: streamed from GCS in ticker-batches per month
"""

import gc
import logging
import time

import duckdb
import pandas as pd

from backend.config import (
    GCS_ACCESS_KEY_ID,
    GCS_SECRET_ACCESS_KEY,
    GCS_BUCKET,
    INTRADAY_BATCH_SIZE,
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

CACHE_TTL_HOURS = 24


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


# ---- WARM: qualifying query (runs directly on GCS) -----------------------

def query_qualifying_gcs(years: set[int], where_clause: str) -> pd.DataFrame:
    """
    Run the qualifying query directly on GCS with filter pushdown.

    DuckDB pushes the WHERE clause into the parquet scan, so only
    matching row-groups are downloaded. Result is small (~3000 rows).
    """
    t0 = time.time()
    logger.info(f"  qualifying: querying GCS for years={sorted(years)}...")

    dm_paths = "[" + ", ".join([
        f"'gs://{GCS_BUCKET}/cold_storage/daily_metrics/year={y}/month=*/*.parquet'"
        for y in sorted(years)
    ]) + "]"

    sql = f"""
    WITH filtered_dm AS (
        SELECT dm.*, CAST(dm."timestamp" AS DATE) AS date
        FROM read_parquet({dm_paths}, hive_partitioning=true) dm
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

    conn = _create_gcs_reader()
    try:
        df = conn.execute(sql).fetchdf()
        elapsed = round(time.time() - t0, 2)
        logger.info(f"  qualifying: {len(df)} rows ({elapsed}s)")
        return df
    except Exception as e:
        logger.error(f"  qualifying query FAILED: {e}")
        return pd.DataFrame()
    finally:
        conn.close()
        gc.collect()


# ---- COLD: intraday streaming with ticker sub-batching --------------------

def fetch_intraday_batch(
    year: int,
    month: int,
    tickers: list[str],
    date_from: str,
    date_to: str,
) -> pd.DataFrame:
    """Fetch intraday data for a BATCH of tickers (not all) from GCS."""
    t0 = time.time()
    conn = _create_gcs_reader()

    src = f"gs://{GCS_BUCKET}/cold_storage/intraday_1m/year={year}/month={month}/*.parquet"

    ticker_filter = "i.ticker IN ('" + "', '".join(tickers) + "')"
    date_filter = (
        f"CAST(i.date AS VARCHAR) >= '{date_from}' AND "
        f"CAST(i.date AS VARCHAR) <= '{date_to}'"
    )

    sql = f"""
    SELECT i.ticker, i.date, i."timestamp",
           i.open, i.high, i.low, i."close", i.volume
    FROM read_parquet('{src}', hive_partitioning=true) i
    WHERE {ticker_filter} AND {date_filter}
    """

    try:
        df = conn.execute(sql).fetchdf()
        logger.info(
            f"    batch {year}-{month:02d} [{len(tickers)} tickers]: "
            f"{len(df)} rows ({round(time.time() - t0, 2)}s)"
        )
        # Downcast for memory savings
        for col in ("open", "high", "low", "close"):
            if col in df.columns:
                df[col] = df[col].astype("float32")
        if "volume" in df.columns:
            df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0).astype("int32")
        if "ticker" in df.columns:
            df["ticker"] = df["ticker"].astype("category")
        if "date" in df.columns:
            df["date"] = df["date"].astype("category")
        return df
    except Exception as e:
        logger.error(f"    batch {year}-{month:02d} FAILED: {e}")
        return pd.DataFrame()
    finally:
        conn.close()


def iter_intraday_groups_streamed(
    qualifying_df: pd.DataFrame,
    date_from: str,
    date_to: str,
):
    """
    Generator yielding ((date, ticker), day_df) groups.

    Streams month-by-month AND sub-batches tickers within each month.
    Peak memory ≈ one ticker-batch of intraday (~15-60 MB).
    Preserves chronological order for correct daily compounding.
    """
    if qualifying_df.empty:
        return

    batch_size = INTRADAY_BATCH_SIZE  # default 50 tickers per GCS query

    # Determine (year, month) pairs in chronological order
    dates = pd.to_datetime(qualifying_df["date"])
    ym_pairs = sorted(set(zip(dates.dt.year, dates.dt.month)))

    total_groups = 0

    for year, month in ym_pairs:
        # Tickers qualifying in this month
        mask = (dates.dt.year == year) & (dates.dt.month == month)
        month_qualifying = qualifying_df[mask]
        month_tickers = month_qualifying["ticker"].unique().tolist()

        if not month_tickers:
            continue

        # Valid (ticker, date) pairs for filtering
        valid_pairs = month_qualifying[["ticker", "date"]].drop_duplicates().copy()
        valid_pairs["date"] = valid_pairs["date"].astype(str)

        logger.info(
            f"  month {year}-{month:02d}: {len(month_tickers)} tickers, "
            f"batch_size={batch_size}"
        )

        # ---- Sub-batch tickers within this month ----
        for i in range(0, len(month_tickers), batch_size):
            batch_tickers = month_tickers[i : i + batch_size]

            intraday = fetch_intraday_batch(
                year, month, batch_tickers, date_from, date_to
            )
            if intraday.empty:
                continue

            # Filter to exact (ticker, date) pairs
            intraday["date"] = intraday["date"].astype(str)
            batch_valid = valid_pairs[valid_pairs["ticker"].isin(batch_tickers)]
            intraday = intraday.merge(batch_valid, on=["ticker", "date"], how="inner")

            if intraday.empty:
                del intraday
                gc.collect()
                continue

            # Sort by date then ticker (chronological order for compounding)
            intraday = intraday.sort_values(["date", "ticker", "timestamp"])

            grouped = intraday.groupby(["date", "ticker"])
            for key, day_df in grouped:
                total_groups += 1
                yield key, day_df

            del intraday, grouped
            gc.collect()

    logger.info(f"  streaming complete: {total_groups} total groups yielded")
