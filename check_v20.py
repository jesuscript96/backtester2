import json
from backend.db.connection import get_connection

conn = get_connection()
cursor = conn.execute("SELECT name, definition FROM strategies WHERE name = 'Test V20'")
row = cursor.fetchone()
if row:
    name, definition = row
    print(f"Strategy Name: {name}")
    try:
        data = json.loads(definition)
        # Find the distance condition
        entry_logic = data.get("entry_logic", {})
        root = entry_logic.get("root_condition", {})
        conds = root.get("conditions", [])
        for c in conds:
            if c.get("comparator", "").startswith("DISTANCE_"):
                print(f"Comparator found: {c.get('comparator')}")
                print(f"Value: {c.get('value_pct')}")
                print(f"Position: {c.get('position')}")
                print(f"Full Condition: {json.dumps(c, indent=2)}")
    except Exception as e:
        print(f"Error parsing JSON: {e}")
        print(f"Raw: {definition}")
else:
    print("Strategy 'Test V20' not found")
