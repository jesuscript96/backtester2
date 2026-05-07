import json
import pandas as pd
from backend.services.data_service import list_datasets

try:
    datasets = list_datasets()
    print("Datasets list fetched successfully:")
    print(datasets)
    
    # Try to serialize to JSON
    json_str = json.dumps(datasets)
    print("\nSerialized to JSON successfully.")
except Exception as e:
    print("\nError:")
    import traceback
    traceback.print_exc()
