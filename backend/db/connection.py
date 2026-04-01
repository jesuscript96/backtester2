import logging
import time

import duckdb
from backend.config import (
    MOTHERDUCK_TOKEN, 
    MOTHERDUCK_DB, 
    DB_TYPE, 
    GCS_ACCESS_KEY_ID, 
    GCS_SECRET_ACCESS_KEY, 
    GCS_BUCKET
)

logger = logging.getLogger("backtester.db")

_conn = None


def get_connection() -> duckdb.DuckDBPyConnection:
    global _conn
    if _conn is None:
        _conn = _create_connection()
    return _conn


def _create_connection() -> duckdb.DuckDBPyConnection:
    t0 = time.time()
    
    if DB_TYPE == "gcs":
        logger.info(f"Connecting to GCS-backed DuckDB (bucket={GCS_BUCKET})...")
        conn = duckdb.connect(":memory:")
        
        # Setup GCS / HTTPFS
        conn.execute("INSTALL httpfs; LOAD httpfs;")
        conn.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
        conn.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
        conn.execute("SET s3_endpoint='storage.googleapis.com';")
        conn.execute("SET s3_region='us-east-1';")
        
        # Create views for GCS parquet files
        # We discovered they are in 'cold_storage/'
        tables = {
            "strategies": f"gs://{GCS_BUCKET}/cold_storage/strategies/*.parquet",
            "saved_queries": f"gs://{GCS_BUCKET}/cold_storage/saved_queries/*.parquet",
            "dataset_pairs": f"gs://{GCS_BUCKET}/cold_storage/dataset_pairs/*.parquet",
            "daily_metrics": f"gs://{GCS_BUCKET}/cold_storage/daily_metrics/*/*/*.parquet",
            "intraday_1m": f"gs://{GCS_BUCKET}/cold_storage/intraday_1m/*/*/*.parquet"
        }
        
        for table, path in tables.items():
            conn.execute(f"CREATE OR REPLACE VIEW {table} AS SELECT * FROM read_parquet('{path}', hive_partitioning=true)")
            logger.info(f"Registered GCS view: {table} -> {path}")
            
        logger.info(f"GCS DuckDB initialized ({round(time.time()-t0, 2)}s)")
        return conn
    else:
        logger.info(f"Connecting to MotherDuck db={MOTHERDUCK_DB}...")
        conn = duckdb.connect(f"md:{MOTHERDUCK_DB}?motherduck_token={MOTHERDUCK_TOKEN}")
        logger.info(f"MotherDuck connected to {MOTHERDUCK_DB} ({round(time.time()-t0, 2)}s)")
        return conn


def _reset_connection():
    global _conn
    try:
        if _conn is not None:
            _conn.close()
    except Exception:
        pass
    _conn = None
    logger.info("Database connection reset")


def query_df(sql: str, params: list | None = None):
    """Execute SQL and return a pandas DataFrame. Auto-reconnects on failure."""
    global _conn
    for attempt in range(2):
        try:
            conn = get_connection()
            if params:
                return conn.execute(sql, params).fetchdf()
            return conn.execute(sql).fetchdf()
        except Exception as e:
            if attempt == 0:
                logger.warning(f"Query failed (attempt 1), reconnecting: {e}")
                _reset_connection()
                continue
            logger.error(f"Query failed (attempt 2): {e}")
            raise e


def execute_sql(sql: str, params: list | None = None):
    """Execute SQL statement (INSERT, UPDATE, DELETE). Auto-reconnects on failure."""
    global _conn
    for attempt in range(2):
        try:
            conn = get_connection()
            if params:
                conn.execute(sql, params)
            else:
                conn.execute(sql)
            return
        except Exception as e:
            if attempt == 0:
                logger.warning(f"Execute failed (attempt 1), reconnecting: {e}")
                _reset_connection()
                continue
            logger.error(f"Execute failed (attempt 2): {e}")
            raise e
