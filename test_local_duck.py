import duckdb
import pandas as pd
import time

def test_local_duck():
    print("Testing local DuckDB...")
    try:
        conn = duckdb.connect(":memory:")
        df = conn.execute("SELECT 1 as val").fetchdf()
        print(f"Local Success: {df['val'].iloc[0]}")
    except Exception as e:
        print(f"Local Error: {e}")

if __name__ == "__main__":
    test_local_duck()
