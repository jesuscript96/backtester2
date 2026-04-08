from backend.db.connection import get_connection

conn = get_connection()
res = conn.execute("DESCRIBE backtest_results").fetchall()
for r in res:
    print(r)
