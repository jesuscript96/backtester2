from backend.db.connection import get_connection

conn = get_connection()
print("--- Tables via information_schema ---")
res = conn.execute("SELECT table_name FROM information_schema.tables").fetchall()
for r in res:
    print(r[0])

print("\n--- Current Schema ---")
print(conn.execute("SELECT current_schema()").fetchone()[0])
