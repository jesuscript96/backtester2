import os
import duckdb
from dotenv import load_dotenv

load_dotenv()
token = os.getenv("MOTHERDUCK_TOKEN")
db = os.getenv("MOTHERDUCK_DB")

print(f"Connecting to md:{db}...")
try:
    conn = duckdb.connect(f"md:{db}?motherduck_token={token}")
    print("Connected successfully!")
    print(conn.execute("SELECT 1").fetchall())
except Exception as e:
    print(f"Connection failed: {e}")
