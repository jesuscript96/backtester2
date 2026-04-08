import sys
import os
sys.path.append(os.getcwd())
from backend.services.data_service import list_strategies

print("Fetching strategies...")
try:
    s = list_strategies()
    print(f"Success! Found {len(s)} strategies.")
    for x in s:
        print(f" - {x['name']} ({x['id']})")
except Exception as e:
    print(f"Error: {e}")
