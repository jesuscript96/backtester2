import sys
import os
import json

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.services.data_service import list_datasets, get_dataset, fetch_dataset_data

print("Testing list_datasets()...")
try:
    datasets = list_datasets()
    print(f"Success! Found {len(datasets)} datasets.")
    if datasets:
        first = datasets[0]
        print(f"Sample dataset: {first['name']} (ID: {first['id']}) - Pairs: {first.get('pair_count', 'N/A')}")
        
        print("\nTesting get_dataset()...")
        ds = get_dataset(first['id'])
        print(f"Dataset details: {json.dumps(ds, indent=2, default=str)}")
        
        print("\nTesting fetch_dataset_data()...")
        q, i = fetch_dataset_data(first['id'])
        print(f"Success! Fetched {len(q)} qualifying pairs and {len(i)} intraday candles.")
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)
