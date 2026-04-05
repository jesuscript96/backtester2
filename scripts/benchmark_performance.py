"""
Benchmark script: measures baseline performance of indicators + portfolio simulator.
Run from project root:  python -m scripts.benchmark_performance
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import pandas as pd
from backend.services.indicators import (
    _ema, _sma, _rsi, _atr, _macd, _stochastic,
    _heikin_ashi, _linear_regression, _consecutive_count, _obv,
    _bollinger_bands, _cci,
)
from backend.services.portfolio_sim import simulate


def bench_indicators(n=100_000, repeats=3):
    np.random.seed(42)
    close = (100 + np.cumsum(np.random.randn(n) * 0.1)).astype(np.float64)
    high  = close + np.abs(np.random.randn(n) * 0.05)
    low   = close - np.abs(np.random.randn(n) * 0.05)
    volume = np.random.randint(100, 10000, n).astype(np.float64)
    signal = (np.random.rand(n) > 0.5)

    funcs = {
        "SMA(20)":     lambda: _sma(close, 20),
        "EMA(20)":     lambda: _ema(close, 20),
        "RSI(14)":     lambda: _rsi(close, 14),
        "ATR(14)":     lambda: _atr(high, low, close, 14),
        "MACD":        lambda: _macd(close, 12, 26, 9),
        "Stochastic":  lambda: _stochastic(high, low, close, 14, 3),
        "HeikinAshi":  lambda: _heikin_ashi(close, high, low, close),
        "LinReg(14)":  lambda: _linear_regression(close, 14),
        "ConsecCount": lambda: _consecutive_count(signal),
        "OBV":         lambda: _obv(close, volume),
        "Bollinger":   lambda: _bollinger_bands(close, 20, 2.0),
        "CCI(20)":     lambda: _cci(high, low, close, 20),
    }

    print(f"\n{'='*55}")
    print(f"  INDICATOR BENCHMARK  ({n:,} bars, best of {repeats})")
    print(f"{'='*55}")
    total = 0.0
    for name, fn in funcs.items():
        best = float("inf")
        for _ in range(repeats):
            t0 = time.perf_counter()
            fn()
            best = min(best, time.perf_counter() - t0)
        total += best
        print(f"  {name:<16s}  {best*1000:8.2f} ms")
    print(f"  {'TOTAL':<16s}  {total*1000:8.2f} ms")
    return total


def bench_simulator(n=100_000, repeats=3):
    np.random.seed(42)
    close = (100 + np.cumsum(np.random.randn(n) * 0.1)).astype(np.float64)
    open_ = close + np.random.randn(n) * 0.02
    high  = np.maximum(close, open_) + np.abs(np.random.randn(n) * 0.05)
    low   = np.minimum(close, open_) - np.abs(np.random.randn(n) * 0.05)
    entries = np.zeros(n, dtype=bool)
    entries[::50] = True
    exits = np.zeros(n, dtype=bool)

    print(f"\n{'='*55}")
    print(f"  SIMULATOR BENCHMARK  ({n:,} bars, best of {repeats})")
    print(f"{'='*55}")

    best = float("inf")
    for _ in range(repeats):
        t0 = time.perf_counter()
        simulate(
            close=close, open_=open_, high=high, low=low,
            entries=entries, exits=exits,
            direction="longonly",
            sl_stop=0.02, tp_stop=0.05,
            sl_trail=True, trail_pct=0.01,
            partial_take_profits=[{"distance_pct": 0.02, "capital_pct": 0.5}],
        )
        best = min(best, time.perf_counter() - t0)

    print(f"  Simulation           {best*1000:8.2f} ms")
    return best


if __name__ == "__main__":
    t_ind = bench_indicators()
    t_sim = bench_simulator()
    print(f"\n{'='*55}")
    print(f"  TOTAL ENGINE TIME:   {(t_ind+t_sim)*1000:8.2f} ms")
    print(f"{'='*55}\n")
