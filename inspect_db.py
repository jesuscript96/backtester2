import sys
sys.path.insert(0, r"c:\Users\Famil\OneDrive\Escritorio\Jaume\MyStrategyBuilder Backtest\backtester2")

from backend.db.connection import get_db_connection

def inspect():
    db = get_db_connection()
    df_metrics = db.execute("SELECT date, ticker, rth_open, rth_close FROM daily_metrics LIMIT 5").df()
    print("DAILY METRICS SAMPLE:")
    print(df_metrics)
    
    if not df_metrics.empty:
        ticker = df_metrics['ticker'].iloc[0]
        date_str = df_metrics['date'].iloc[0]
        
        # Get candles around 09:30 for that day
        intra = db.execute(f"SELECT timestamp, open, high, low, close FROM intraday_data WHERE ticker = '{ticker}' AND date(timestamp) = date('{date_str}') AND cast(timestamp as string) LIKE '%09:3%-%' LIMIT 10").df()
        if intra.empty:
             intra = db.execute(f"SELECT timestamp, open, high, low, close FROM intraday_data WHERE ticker = '{ticker}' AND date(timestamp) = date('{date_str}') AND cast(timestamp as string) LIKE '%09:3%' ORDER BY timestamp LIMIT 20").df()
        
        print("\nINTRADAY CANDLES AROUND 09:30:")
        print(intra.to_string())

if __name__ == "__main__":
    inspect()
