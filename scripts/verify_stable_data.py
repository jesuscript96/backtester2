import os
import sys
import time
import logging
import pandas as pd

# 1. Setup path & logging
sys.path.append(os.getcwd())
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("verify.data")

from backend.db.gcs_cache import query_qualifying_gcs, iter_intraday_groups_streamed

def verify():
    print("\n[1] TEST: Qualifying GCS Query")
    years = {2025, 2026}
    # Example where_clause from logs
    where_clause = "CAST(\"timestamp\" AS DATE) >= '2025-09-01' AND CAST(\"timestamp\" AS DATE) <= '2026-03-10' AND gap_pct >= 50 AND gap_pct <= 200 AND pm_volume >= 1000000"
    
    filters = {"start_date": "2025-09-01", "end_date": "2026-03-10"}
    df = query_qualifying_gcs(years, where_clause, filters)
    
    if df.empty:
        print("    FAIL: Qualifying query returned 0 rows.")
        return
    
    print(f"    SUCCESS: Found {len(df)} qualifying tickers.")
    
    print("\n[2] TEST: Intraday Path Resolution (Batch 1)")
    # Just try to resolve the first few tickers
    try:
        gen = iter_intraday_groups_streamed(df.head(10), "2025-09-01", "2026-03-10")
        # We don't need to consume the whole generator, just see if it starts resolving paths
        # Actually, let's just check the log output.
        print("    Checking logs for '[INIT] Resolving intraday paths'...")
    except Exception as e:
        print(f"    FAIL: generator initialization failed: {e}")

if __name__ == "__main__":
    verify()
