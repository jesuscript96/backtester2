import duckdb
import os
import sys
from backend.config import GCS_ACCESS_KEY_ID, GCS_SECRET_ACCESS_KEY, GCS_BUCKET

def verify_intraday_wildcard():
    c = duckdb.connect(':memory:')
    c.execute("INSTALL httpfs; LOAD httpfs;")
    c.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
    c.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
    c.execute("SET s3_endpoint='storage.googleapis.com';")
    c.execute("SET s3_region='us-east-1';")
    c.execute("SET s3_url_style='path';")

    # 1. Qualifying result simulated
    ticker = 'COCH'
    date_str = '2025-10-07'
    
    # 2. Intraday Wildcard Path (The new fix)
    path = f"gs://{GCS_BUCKET}/cold_storage/intraday_1m/year=2025/month=*/*.parquet"
    
    # 3. Query (Using hive_partitioning to find the data)
    sql = f"""
    SELECT i.ticker, i.date, i."timestamp", i.close
    FROM read_parquet('{path}', hive_partitioning=true) i
    WHERE i.ticker = '{ticker}' AND CAST(i.date AS VARCHAR) = '{date_str}'
    LIMIT 1
    """
    
    print(f"\n[TESTING INTRADAY WILDCARD]:\n{sql}")
    try:
        res = c.execute(sql).fetchdf()
        if not res.empty:
            print(f"    SUCCESS: Found intraday data for {ticker} on {date_str}")
            print(res.to_string())
        else:
            print(f"    FAIL: No intraday data found for {ticker} on {date_str} with wildcard.")
    except Exception as e:
        print(f"    ERROR: {e}")

if __name__ == "__main__":
    verify_intraday_wildcard()
