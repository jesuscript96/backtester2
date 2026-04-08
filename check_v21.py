import json
from backend.db.connection import get_connection

conn = get_connection()
cursor = conn.execute("SELECT name, definition FROM strategies WHERE name = 'Test V21'")
row = cursor.fetchone()
if row:
    name, definition = row
    print(f"Strategy Name: {name}")
    try:
        data = json.loads(definition)
        print(f"Full Strategy Definition:\n{json.dumps(data, indent=2)}")
    except Exception as e:
        print(f"Error parsing JSON: {e}")
        print(f"Raw: {definition}")
else:
    print("Strategy 'Test V21' not found")
