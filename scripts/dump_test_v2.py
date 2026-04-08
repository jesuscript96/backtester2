import sys
import os
import json

sys.path.append(os.getcwd())
try:
    from backend.db.connection import query_df
except Exception as e:
    print(f"Import error: {e}")
    sys.exit(1)

def main():
    df = query_df("SELECT name, definition FROM my_db.main.strategies")
    for _, row in df.iterrows():
        name = row['name']
        if 'v2' in name.lower():
            print(f"--- STRATEGY: {name} ---")
            defn = row['definition']
            if isinstance(defn, str):
                defn = json.loads(defn)
            print(json.dumps(defn, indent=2))

if __name__ == "__main__":
    main()
