import numpy as np
from backend.services.portfolio_sim import simulate

def test_diverse_tp():
    n = 10
    # Price dropping from 1.0 to 0.4 in one bar
    close = np.array([1.0, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4])
    open_ = np.array([1.0, 0.95, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4]) # Gapped to 0.95
    high = np.array([1.0, 1.0, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4])
    low = np.array([1.0, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4])
    
    entries = np.zeros(n, dtype=bool)
    entries[0] = True # Short at 1.0
    
    exits = np.zeros(n, dtype=bool)
    
    partial_take_profits = [
        {"distance_pct": 0.1, "capital_pct": 0.33}, # Target 0.9
        {"distance_pct": 0.2, "capital_pct": 0.33}, # Target 0.8
        {"distance_pct": 0.4, "capital_pct": 0.34}, # Target 0.6
    ]
    
    res = simulate(
        close=close, open_=open_, high=high, low=low,
        entries=entries, exits=exits,
        direction="shortonly", init_cash=10000, risk_r=100,
        partial_take_profits=partial_take_profits,
        slippage=0.0
    )
    
    print("--- SHORT TP TEST (Gap at 0.95) ---")
    for t in res["trades"]:
        print(f"Target Hit: Exit Price: {t['exit_price']}, Size: {t['size']}")

if __name__ == "__main__":
    test_diverse_tp()
