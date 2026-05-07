import pandas as pd
import numpy as np
import sys
import os
sys.path.append(os.getcwd())
try:
    from backend.services.strategy_engine import translate_strategy
except Exception as e:
    print(f"Import Error: {e}")
    sys.exit(1)

print("Starting test_engine...")
df = pd.DataFrame({
    "timestamp": pd.to_datetime(["2023-01-01 09:30", "2023-01-01 09:31"]),
    "open": [100.0, 101.0],
    "high": [102.0, 103.0],
    "low": [99.0, 98.0],
    "close": [101.0, 102.0],
    "volume": [1000, 1100]
})

strategy = {
    "bias": "long",
    "entry_logic": {
        "timeframe": "1m",
        "root_condition": {
            "type": "price_level_distance",
            "level": {"name": "AVWAP"},
            "comparator": "DISTANCE_GT",
            "value_pct": 0.1,
            "position": "above"
        }
    },
    "exit_logic": {"timeframe": "1m", "root_condition": {}}
}

try:
    print("Translating strategy...")
    res = translate_strategy(df, strategy)
    print("Success!")
    print(f"Entries: {res['entries'].tolist()}")
except Exception as e:
    print(f"Error: {e}")
