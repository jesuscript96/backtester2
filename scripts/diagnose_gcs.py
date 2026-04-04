import duckdb
import os
import sys
import logging
from backend.config import GCS_ACCESS_KEY_ID, GCS_SECRET_ACCESS_KEY, GCS_BUCKET

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("diagnose.gcs")

def check():
    c = duckdb.connect(':memory:')
    c.execute("INSTALL httpfs; LOAD httpfs;")
    c.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
    c.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
    c.execute("SET s3_endpoint='storage.googleapis.com';")
    c.execute("SET s3_region='us-east-1';")
    c.execute("SET s3_url_style='path';")

    print(f"--- DIAGNOSING GCS {GCS_BUCKET} ---")

    # [1] Level 1 Check
    print("\n[1] Checking level 1 (year=2025/*):")
    try:
        sql = f"SELECT file FROM glob('gs://{GCS_BUCKET}/cold_storage/daily_metrics/year=2025/*')"
        res = c.execute(sql).fetchall()
        print(f"    Found {len(res)} entries at level 1")
        if res: print(f"    Example: {res[0][0]}")
    except Exception as e:
        print(f"    FAIL level 1: {e}")

    # [2] Level 2 Check
    print("\n[2] Checking level 2 (year=2025/*/*):")
    try:
        sql = f"SELECT file FROM glob('gs://{GCS_BUCKET}/cold_storage/daily_metrics/year=2025/*/*')"
        res = c.execute(sql).fetchall()
        print(f"    Found {len(res)} entries at level 2")
        if res: print(f"    Example: {res[0][0]}")
    except Exception as e:
        print(f"    FAIL level 2: {e}")

    # [3] Recursive Check
    print("\n[3] Checking recursive (year=2025/**/*.parquet):")
    try:
        sql = f"SELECT file FROM glob('gs://{GCS_BUCKET}/cold_storage/daily_metrics/year=2025/**/*.parquet')"
        res = c.execute(sql).fetchall()
        print(f"    Found {len(res)} entries recursively")
        if res: print(f"    Example: {res[0][0]}")
    except Exception as e:
        print(f"    FAIL recursive: {e}")

if __name__ == "__main__":
    check()
