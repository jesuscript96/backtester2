import numpy as np
import pandas as pd
from backend.services.backtest_service import run_backtest

def verify_r_logic():
    ticker = "TEST"
    date = "2024-01-01"
    n = 10
    intraday = pd.DataFrame({
        "ticker": [ticker]*n,
        "date": [date]*n,
        "timestamp": pd.date_range("2024-01-01 09:30", periods=n, freq="min"),
        "open": [10.0]*n,
        "high": [10.0, 10.0, 12.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0],
        "low": [10.0]*n, 
        "close": [10.0]*n,
        "volume": [1000]*n
    })
    qualifying = pd.DataFrame([{
        "ticker": ticker, "date": date, "rth_open": 10.0, "prev_close": 10.0
    }])
    
    strategy_defn = {
            "name": "Test R",
            "definition": {
                "entry_logic": {"root_condition": {"conditions": []}},
                "exit_logic": {"root_condition": {"conditions": []}},
                "risk_management": {
                    "use_hard_stop": True,
                    "hard_stop": {"type": "Percentage", "value": 2.0},
                    "use_take_profit": True,
                    "take_profit_mode": "Partial",
                    "partial_take_profits": [
                        {"distance_pct": 0.01, "capital_pct": 0.50},
                    ]
                }
            }
    }
    
    import backend.services.backtest_service as bs
    old_translate = bs.translate_strategy
    bs.translate_strategy = lambda df, defn, stats: {
        "entries": pd.Series([True] + [False]*(len(df)-1)),
        "exits": pd.Series([False]*len(df)),
        "direction": "longonly",
        "sl_stop": 0.02, "sl_trail": False, "tp_stop": 0.04, "trail_pct": None,
        "partial_take_profits": defn["risk_management"]["partial_take_profits"]
    }

    try:
        # Risk $10. Entry 10.0. Size = 1 share.
        # Spike to 12.0. Exit Price 10.1 (Target).
        # Profit per share = 0.10. 
        # Size closed = 0.5. 
        # PnL = 0.5 * 0.1 = 0.05.
        # R = 0.05 / 10 = 0.005. Still rounds to 0.00!
        
        # Let's use bigger dist. Target 20% (12.0).
        # TP Dist = 0.20.
        # Profit per share = 2.0.
        # Size closed = 0.5. PnL = 1.0. 
        # R = 1.0 / 10 = 0.1R. Perfect.

        strategy_defn["definition"]["risk_management"]["partial_take_profits"][0]["distance_pct"] = 0.20
        
        res = run_backtest(intraday, qualifying, strategy_defn["definition"], init_cash=10000, risk_r=10, risk_type="FIXED")
        print("--- PARTIAL TP TEST ($10 Risk, 20% Target) ---")
        for t in res["trades"]:
            print(f"Reason: {t['exit_reason']}, Pnl: {t['pnl']}, R: {t['r_multiple']}")

    finally:
        bs.translate_strategy = old_translate

if __name__ == "__main__":
    verify_r_logic()
