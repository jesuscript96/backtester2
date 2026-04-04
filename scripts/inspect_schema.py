import duckdb
import os
import sys
from backend.config import GCS_ACCESS_KEY_ID, GCS_SECRET_ACCESS_KEY, GCS_BUCKET

def inspect():
    c = duckdb.connect(':memory:')
    c.execute("INSTALL httpfs; LOAD httpfs;")
    c.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
    c.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
    c.execute("SET s3_endpoint='storage.googleapis.com';")
    c.execute("SET s3_region='us-east-1';")
    c.execute("SET s3_url_style='path';")

    print("--- INSPECTING SCHEMA ---")
    # Try one specific file to see raw columns
    path = f"gs://{GCS_BUCKET}/cold_storage/daily_metrics/year=2025/month=09/*.parquet"
    try:
        # 1. Get column names
        cols = c.execute(f"SELECT * FROM read_parquet('{path}', hive_partitioning=true) LIMIT 0").description
        print("\n[1] Columns found (with Hive partitions):")
        for col in cols:
            print(f"  - {col[0]}")
            
        # 2. Get a sample row
        print("\n[2] Sample row:")
        sample = c.execute(f"SELECT * FROM read_parquet('{path}', hive_partitioning=true) LIMIT 1").fetchdf()
        print(sample.to_string())
        
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    inspect()
