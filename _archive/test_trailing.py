
import numpy as np
import pandas as pd
from backend.services.portfolio_sim import simulate

def test_trailing_stop_logic():
    n = 100
    # Price goes from 100 to 120 then down to 105
    prices = np.array([100.0 + i for i in range(21)] + [120.0 - (i-20) for i in range(21, 40)])
    n = len(prices)
    close = prices
    open_ = prices - 0.5
    high = prices + 0.5
    low = prices - 0.5
    
    # Entry at bar 0
    entries = np.zeros(n, dtype=bool)
    entries[0] = True
    exits = np.zeros(n, dtype=bool)
    
    # Trailing Stop = 5%
    sl_stop = 0.05
    
    print(f"Testing Long Trailing Stop (5%)")
    res = simulate(
        close=close, open_=open_, high=high, low=low,
        entries=entries, exits=exits,
        sl_stop=sl_stop, sl_trail=True,
        direction="longonly",
        init_cash=10000.0,
        patch_mask=np.zeros(n, dtype=bool)
    )
    
    trades = res['trades']
    if trades:
        t = trades[0]
        print(f"  Entry: {t['entry_idx']} at {t['entry_price']}")
        print(f"  Exit: {t['exit_idx']} at {t['exit_price']} (Reason: {t['exit_reason']})")
        # Peak was at bar 20: 120.5 (high), so stop should be 120.5 * 0.95 = 114.475
        print(f"  Expect exit near 114.475")
    else:
        print("  No trades found")

    # Test Short
    print(f"\nTesting Short Trailing Stop (5%)")
    # Price goes from 100 down to 80 then up to 95
    prices_short = np.array([100.0 - i for i in range(21)] + [80.0 + (i-20) for i in range(21, 40)])
    close_s = prices_short
    open_s = prices_short + 0.5
    high_s = prices_short + 0.5
    low_s = prices_short - 0.5
    
    res_s = simulate(
        close=close_s, open_=open_s, high=high_s, low=low_s,
        entries=entries, exits=exits,
        sl_stop=sl_stop, sl_trail=True,
        direction="shortonly",
        init_cash=10000.0,
        patch_mask=np.zeros(n, dtype=bool)
    )
    
    trades_s = res_s['trades']
    if trades_s:
        t = trades_s[0]
        print(f"  Entry: {t['entry_idx']} at {t['entry_price']}")
        print(f"  Exit: {t['exit_idx']} at {t['exit_price']} (Reason: {t['exit_reason']})")
        # Bottom was at bar 20: 79.5 (low), so stop should be 79.5 * 1.05 = 83.475
        print(f"  Expect exit near 83.475")
    else:
        print("  No trades found")

if __name__ == "__main__":
    test_trailing_stop_logic()
