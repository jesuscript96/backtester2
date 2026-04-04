import duckdb
import time
from backend.config import GCS_ACCESS_KEY_ID, GCS_SECRET_ACCESS_KEY, GCS_BUCKET

def analyze():
    c = duckdb.connect(':memory:')
    c.execute("INSTALL httpfs; LOAD httpfs;")
    c.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
    c.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
    c.execute("SET s3_endpoint='storage.googleapis.com';")
    c.execute("SET s3_region='us-east-1';")
    c.execute("SET s3_url_style='path';")
    
    print(f"--- ANALYZING GCS BUCKET: {GCS_BUCKET} ---")
    
    # 1. Check raw intraday
    print("\n[1] Checking raw intraday folders (month format):")
    try:
        sql = f"SELECT file FROM glob('gs://{GCS_BUCKET}/cold_storage/intraday_1m/year=2025/*')"
        results = c.execute(sql).fetchall()
        for r in results[:10]:
            print(f"  {r[0]}")
    except Exception as e:
        print(f"  ERROR listing raw: {e}")

    # 2. Check optimized intraday
    print("\n[2] Checking optimized intraday folders:")
    try:
        sql = f"SELECT file FROM glob('gs://{GCS_BUCKET}/cold_storage/intraday_1m_optimized/year=2025/*')"
        results = c.execute(sql).fetchall()
        if not results:
            print("  No folders found in intraday_1m_optimized/year=2025/")
        else:
            for r in results[:10]:
                print(f"  {r[0]}")
    except Exception as e:
        print(f"  ERROR listing optimized: {e}")

if __name__ == "__main__":
    analyze()
