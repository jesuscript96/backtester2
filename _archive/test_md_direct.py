import os
from dotenv import load_dotenv
import sys
import duckdb

load_dotenv('.env')
token = os.getenv("MOTHERDUCK_TOKEN", "")
db_name = os.getenv("MOTHERDUCK_DB", "my_db")

print(f"Token Length: {len(token)}")
if len(token) > 0:
    print(f"Connecting to md:{db_name}...")
    try:
        # Use a timeout if possible, or just try to connect
        conn = duckdb.connect(f"md:{db_name}?motherduck_token={token}")
        print("Connected! Fetching 1...")
        res = conn.execute("SELECT 1").fetchdf()
        print(f"Result: {res.iloc[0,0]}")
    except Exception as e:
        print(f"Error: {e}")
else:
    print("Token is MISSING!")
