import duckdb
import os
import sys
import logging
from backend.config import GCS_ACCESS_KEY_ID, GCS_SECRET_ACCESS_KEY, GCS_BUCKET

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("internal.qa")

def verify():
    # 1. Setup connection
    c = duckdb.connect(':memory:')
    c.execute("INSTALL httpfs; LOAD httpfs;")
    c.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
    c.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
    c.execute("SET s3_endpoint='storage.googleapis.com';")
    c.execute("SET s3_region='us-east-1';")
    c.execute("SET s3_url_style='path';")

    print(f"--- INTERNAL QA: {GCS_BUCKET} ---")

    # 2. Test recursive glob
    path = f"gs://{GCS_BUCKET}/cold_storage/daily_metrics/year=2025/**/*.parquet"
    print(f"\n[1] Testing Glob: {path}")
    try:
        files = c.execute(f"SELECT count(*) FROM glob('{path}')").fetchall()[0][0]
        print(f"    Found {files} files recursively.")
        if files == 0:
            print("    FAIL: Glob found 0 files. Trying one deeper level...")
            path2 = f"gs://{GCS_BUCKET}/cold_storage/daily_metrics/year=2025/*/*/*.parquet"
            files2 = c.execute(f"SELECT count(*) FROM glob('{path2}')").fetchall()[0][0]
            print(f"    Level-2 Glob: {files2} files.")
    except Exception as e:
        print(f"    FAIL Glob: {e}")

    # 3. Test Schema (Binder Error fix)
    print("\n[2] Testing Schema (Finding 'date' column):")
    try:
        # Use first partition to see columns
        sql = f"SELECT * FROM read_parquet('{path}', hive_partitioning=true) LIMIT 1"
        df = c.execute(sql).fetchdf()
        print(f"    Available columns: {list(df.columns)}")
        
        # Test the typical filter
        if "timestamp" in df.columns:
            print("    SUCCESS: FOUND 'timestamp'. Testing date cast...")
            res = c.execute(f"SELECT CAST(\"timestamp\" AS DATE) as date_val FROM read_parquet('{path}', hive_partitioning=true) LIMIT 1").fetchall()
            print(f"    DATE CAST SUCCESS: {res[0][0]}")
    except Exception as e:
        print(f"    FAIL Schema: {e}")

if __name__ == "__main__":
    verify()
