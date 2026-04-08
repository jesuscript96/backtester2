from backend.db.connection import query_df
import json

strategy_id = 'c3b6a8b6-f82b-4075-ae29-97a78cd6f54b'
# We use json_extract or similar to search in strategy_ids
# But since it's DuckDB, we can use id if we just order by time
df = query_df("SELECT results_json, executed_at FROM backtest_results ORDER BY executed_at DESC LIMIT 1")

if not df.empty:
    results = json.loads(df.iloc[0]['results_json'])
    # Results might be a list or dict
    if isinstance(results, dict):
        trades = results.get("trades", [])
        print(f"Number of trades: {len(trades)}")
        if trades:
            print("First 5 trades:")
            for t in trades[:5]:
                print(json.dumps(t, indent=2))
else:
    print("No backtest results found")
