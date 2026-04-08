from backend.db.connection import query_df
import pandas as pd

# Note: Fetching based on strategy_id for Test V21
# The strategy ID was found in the previous step
strategy_id = 'c3b6a8b6-f82b-4075-ae29-97a78cd6f54b'
df = query_df(f"SELECT ticker, date, direction, entry_idx, exit_idx, pnl, exit_reason FROM trades WHERE strategy_id = '{strategy_id}' ORDER BY entry_idx DESC LIMIT 20")

if df is not None and not df.empty:
    print(df)
else:
    print("No trades found for Test V21")
