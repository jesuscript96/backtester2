import os
import duckdb
from dotenv import load_dotenv

load_dotenv()

token = os.getenv("MOTHERDUCK_TOKEN")
db = "my_db" # The user said my_db

try:
    conn = duckdb.connect(f"md:{db}?motherduck_token={token}")
    print(f"Connected to {db}")
    
    # List tables in main schema
    tables = conn.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'").fetchdf()
    print("Tables in main:")
    print(tables)
    
    target_tables = ["saved_queries", "strategies", "daily_metrics", "intraday_1m"]
    for table in target_tables:
        if table in tables['table_name'].values:
            print(f"\n--- {table} schema ---")
            cols = conn.execute(f"PRAGMA table_info('{table}')").fetchdf()
            print(cols[['name', 'type']])
            
            sample = conn.execute(f"SELECT * FROM {table} LIMIT 1").fetchdf()
            print(f"\n{table} sample:")
            print(sample.to_dict(orient='records'))
        else:
            print(f"\n--- {table} NOT FOUND in my_db.main ---")

except Exception as e:
    print(f"Error: {e}")
