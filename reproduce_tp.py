import numpy as np
from backend.services.portfolio_sim import simulate

def test_partial_tp():
    n = 10
    close = np.array([1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1])
    open_ = close.copy()
    high = close.copy()
    low = close.copy()
    
    entries = np.zeros(n, dtype=bool)
    entries[0] = True # Short entry at 1.0 (actually 1.0 - slip)
    
    exits = np.zeros(n, dtype=bool)
    
    partial_take_profits = [
        {"distance_pct": 0.1, "capital_pct": 0.5}, # Target 0.9
        {"distance_pct": 0.2, "capital_pct": 0.5}, # Target 0.8
    ]
    
    res = simulate(
        close=close,
        open_=open_,
        high=high,
        low=low,
        entries=entries,
        exits=exits,
        direction="shortonly",
        init_cash=10000,
        risk_r=100,
        risk_type="FIXED",
        partial_take_profits=partial_take_profits,
        slippage=0.0
    )
    
    for t in res["trades"]:
        print(f"Entry: {t['entry_price']}, Exit: {t['exit_price']}, Size: {t['size']}, Reason: {t['exit_reason']}")

if __name__ == "__main__":
    test_partial_tp()
