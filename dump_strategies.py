from backend.db.connection import query_df
import json

def dump_strategies():
    df = query_df("SELECT name, definition FROM my_db.main.strategies")
    for _, row in df.iterrows():
        name = row['name']
        try:
            defn = row['definition']
            if isinstance(defn, str):
                defn = json.loads(defn)
            
            rm = defn.get('risk_management', {})
            if rm.get('partial_take_profits'):
                print(f"--- STRATEGY: {name} ---")
                print(json.dumps(rm, indent=2))
        except Exception as e:
            print(f"Error parsing {name}: {e}")

if __name__ == "__main__":
    dump_strategies()
