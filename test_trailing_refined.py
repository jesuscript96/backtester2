
import numpy as np
import pandas as pd
from backend.services.portfolio_sim import simulate
from backend.services.backtest_service import _compute_r_multiple

def test_trailing_and_r_multiple():
    # Test R-Multiple calculation for trailing
    strategy_def = {
        "risk_management": {
            "use_hard_stop": False,
            "trailing_stop": {
                "active": True,
                "type": "Percentage",
                "buffer_pct": 10.0
            }
        }
    }
    
    # Entry 100, Peak 110, Exit 99 (Stop is 10% of 110 = 11, so 110-11 = 99)
    # Risk is 10% of 100 = 10. 
    # PnL is 99 - 100 = -1. 
    # R = -1 / 10 = -0.1
    r = _compute_r_multiple(100.0, 99.0, "longonly", strategy_def)
    print(f"R-Multiple (Long, 10% Trailing): {r}")
    assert r == -0.1, f"Expected -0.1, got {r}"

    # Test Simulation with Trailing 10%
    n = 20
    prices = np.array([100.0, 105.0, 110.0, 108.0, 105.0, 100.0, 98.0, 95.0, 90.0] + [90.0]*11)
    close = prices
    high = prices + 0.1
    low = prices - 0.1
    open_ = prices
    
    entries = np.zeros(len(prices), dtype=bool)
    entries[0] = True # Enter at 100
    exits = np.zeros(len(prices), dtype=bool)
    
    res = simulate(
        close=close, high=high, low=low, open_=open_,
        entries=entries, exits=exits,
        sl_stop=0.10, sl_trail=True,
        init_cash=10000.0, patch_mask=np.zeros(len(prices), dtype=bool)
    )
    
    trades = res['trades']
    if trades:
        t = trades[0]
        print(f"Trade: Entry {t['entry_price']}, Exit {t['exit_price']}, Reason {t['exit_reason']}")
        # Peak was at bar 2: 110.1 (high). 10% of 110.1 = 11.01. Stop = 110.1 - 11.01 = 99.09.
        # Bar 5 low is 99.9 (Not hit). Bar 6 low is 97.9 (HIT).
        # Exit should be sl_level (99.09) or low (97.9). Max(99.09, 97.9) = 99.09.
        print(f"Expected exit near 99.09")
        assert abs(t['exit_price'] - 99.09) < 0.01, f"Expected 99.09, got {t['exit_price']}"
    
    print("\nAll Trailing scripts passed!")

if __name__ == "__main__":
    test_trailing_and_r_multiple()
