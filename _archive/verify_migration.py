import os
import pandas as pd
from backend.services.data_service import list_strategies, list_datasets, get_dataset, fetch_dataset_data
from dotenv import load_dotenv

load_dotenv()

def test_migration():
    print("--- Testing list_strategies ---")
    strategies = list_strategies()
    print(f"Found {len(strategies)} strategies")
    if strategies:
        print(f"First strategy: {strategies[0]['name']} (ID: {strategies[0]['id']})")
    
    print("\n--- Testing list_datasets (saved_queries) ---")
    datasets = list_datasets()
    print(f"Found {len(datasets)} datasets (saved_queries)")
    if datasets:
        ds_id = datasets[0]['id']
        print(f"First dataset: {datasets[0]['name']} (ID: {ds_id})")
        
        print(f"\n--- Testing get_dataset({ds_id}) ---")
        ds_info = get_dataset(ds_id)
        print(f"Name: {ds_info['name']}")
        print(f"Filters: {ds_info['filters']}")
        
        print(f"\n--- Testing fetch_dataset_data({ds_id}) ---")
        qualifying, intraday = fetch_dataset_data(ds_id)
        print(f"Qualifying rows: {len(qualifying)}")
        print(f"Intraday rows: {len(intraday)}")
        
        if not qualifying.empty:
            print("\nQualifying sample:")
            print(qualifying[['ticker', 'date']].head())
            
        if not intraday.empty:
            print("\nIntraday sample:")
            print(intraday[['ticker', 'date', 'timestamp']].head())
    else:
        print("No datasets found to test fetch_dataset_data")

if __name__ == "__main__":
    try:
        test_migration()
    except Exception as e:
        import traceback
        traceback.print_exc()
