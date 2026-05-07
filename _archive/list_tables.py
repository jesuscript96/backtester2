from backend.db.connection import get_connection

conn = get_connection()
# List databases
print("--- Databases ---")
print(conn.execute("SHOW DATABASES").fetchall())

# List schemas in current db
print("--- Schemas ---")
print(conn.execute("SHOW SCHEMAS").fetchall())

# List tables in current db
print("--- Tables ---")
print(conn.execute("SHOW TABLES").fetchall())
