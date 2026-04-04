import duckdb
import os
import sys
from backend.config import GCS_ACCESS_KEY_ID, GCS_SECRET_ACCESS_KEY, GCS_BUCKET

def verify_final():
    c = duckdb.connect(':memory:')
    c.execute("INSTALL httpfs; LOAD httpfs;")
    c.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
    c.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
    c.execute("SET s3_endpoint='storage.googleapis.com';")
    c.execute("SET s3_region='us-east-1';")
    c.execute("SET s3_url_style='path';")

    where_clause = "CAST(\"timestamp\" AS DATE) >= '2025-09-01' AND CAST(\"timestamp\" AS DATE) <= '2026-03-10' AND gap_pct >= 50 AND gap_pct <= 200 AND pm_volume >= 1000000"
    path = f"gs://{GCS_BUCKET}/cold_storage/daily_metrics/year=2025/**/*.parquet"
    
    sql = f"""
    SELECT ticker, CAST(\"timestamp\" AS DATE) AS date, gap_pct, pm_volume
    FROM read_parquet('{path}', hive_partitioning=true) i
    WHERE {where_clause}
    """
    
    print(f"\n[RUNNING INTERNAL QUERY]:\n{sql}")
    try:
        df = c.execute(sql).fetchdf()
        print(f"    SUCCESS: Found {len(df)} rows.")
        if not df.empty:
            print("    Sample data:")
            print(df.head(3).to_string())
    except Exception as e:
        print(f"    FAIL: {e}")

if __name__ == "__main__":
    verify_final()
