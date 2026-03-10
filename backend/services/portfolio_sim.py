"""
Lightweight numpy portfolio simulator.
Replaces vbt.Portfolio.from_signals() with ~0 memory overhead per day.

Supports: long/short, stop-loss (fixed & trailing), take-profit, fees, slippage.
Equity model: init_cash + sum(realized_pnl) + unrealized_pnl
"""

import numpy as np


def simulate(
    close: np.ndarray,
    open_: np.ndarray,
    high: np.ndarray,
    low: np.ndarray,
    entries: np.ndarray,
    exits: np.ndarray,
    direction: str = "longonly",
    init_cash: float = 10000.0,
    risk_r: float = 100.0,
    risk_type: str = "FIXED",
    size_by_sl: bool = False,
    prev_stats: dict | None = None,
    fees: float = 0.0,
    slippage: float = 0.0,
    sl_stop: float | None = None,
    sl_trail: bool = False,
    tp_stop: float | None = None,
    accumulate: bool = False,
    locates_cost: float = 0.0,
    look_ahead_prevention: bool = True,
) -> dict:
    n = len(close)
    is_long = direction == "longonly"

    equity = np.empty(n, dtype=np.float64)
    trades: list[dict] = []

    realized_pnl = 0.0
    in_position = False
    entry_price = 0.0
    entry_idx = 0
    entry_fee_amount = 0.0
    size = 0.0
    trail_extreme = 0.0
    mae = 0.0  # Maximum Adverse Excursion
    mfe = 0.0  # Maximum Favorable Excursion

    # Pre-calculate Kelly multiplier if needed
    kelly_f = 0.0
    if risk_type == "KELLY" and prev_stats:
        win_rate = prev_stats.get("win_rate", 0.5)
        avg_win = prev_stats.get("avg_win", 0.0)
        avg_loss = abs(prev_stats.get("avg_loss", 1.0))
        if avg_loss > 0:
            b = avg_win / avg_loss
            if b > 0:
                # Kelly Formula: f = (p * (b + 1) - 1) / b
                # We use risk_r as the "Kelly Fraction" (e.g. 0.5 for half-kelly)
                optimal_f = (win_rate * (b + 1) - 1) / b
                kelly_f = max(0, optimal_f * risk_r)

    for i in range(n):
        # ... existing logic ...
        # --- check exits before entries ---
        if in_position:
            exit_triggered = False
            exit_price = close[i]
            exit_reason = "Signal"
            eff_exit_idx = i

            # Track MAE and MFE as positive percentages based on absolute price excursions
            if is_long:
                mae_pct = ((entry_price - low[i]) / entry_price) * 100
                mfe_pct = ((high[i] - entry_price) / entry_price) * 100
            else:
                mae_pct = ((high[i] - entry_price) / entry_price) * 100
                mfe_pct = ((entry_price - low[i]) / entry_price) * 100
                
            if mae_pct > mae:
                mae = mae_pct
            if mfe_pct > mfe:
                mfe = mfe_pct

            if is_long:
                price_for_sl = low[i]
                price_for_tp = high[i]
            else:
                price_for_sl = high[i]
                price_for_tp = low[i]

            # stop-loss / trailing stop
            if sl_stop is not None:
                if sl_trail:
                    if is_long:
                        trail_extreme = max(trail_extreme, high[i])
                        sl_level = trail_extreme * (1 - sl_stop)
                        if price_for_sl <= sl_level:
                            exit_triggered = True
                            exit_price = max(sl_level, low[i])
                            exit_reason = "Trailing"
                    else:
                        trail_extreme = min(trail_extreme, low[i])
                        sl_level = trail_extreme * (1 + sl_stop)
                        if price_for_sl >= sl_level:
                            exit_triggered = True
                            exit_price = min(sl_level, high[i])
                            exit_reason = "Trailing"
                else:
                    if is_long:
                        sl_level = entry_price * (1 - sl_stop)
                        if price_for_sl <= sl_level:
                            exit_triggered = True
                            exit_price = max(sl_level, low[i])
                            exit_reason = "SL"
                    else:
                        sl_level = entry_price * (1 + sl_stop)
                        if price_for_sl >= sl_level:
                            exit_triggered = True
                            exit_price = min(sl_level, high[i]) 
                            exit_reason = "SL"

            # take-profit
            if not exit_triggered and tp_stop is not None:
                if is_long:
                    tp_level = entry_price * (1 + tp_stop)
                    if price_for_tp >= tp_level:
                        exit_triggered = True
                        exit_price = min(tp_level, high[i])
                        exit_reason = "TP"
                else:
                    tp_level = entry_price * (1 - tp_stop)
                    if price_for_tp <= tp_level:
                        exit_triggered = True
                        exit_price = max(tp_level, low[i])
                        exit_reason = "TP"

            # signal exit
            if not exit_triggered and exits[i]:
                exit_triggered = True
                if look_ahead_prevention and i < n - 1:
                    exit_price = open_[i + 1]
                    eff_exit_idx = i + 1
                else:
                    exit_price = close[i]
                exit_reason = "Signal"

            # end-of-day forced close
            if not exit_triggered and i == n - 1:
                exit_triggered = True
                exit_price = close[i]
                exit_reason = "EOD"

            if exit_triggered:
                slip = exit_price * slippage
                net_exit = (exit_price - slip) if is_long else (exit_price + slip)
                exit_fee = abs(net_exit * size) * fees

                if is_long:
                    pnl = (net_exit - entry_price) * size - exit_fee - entry_fee_amount
                else:
                    pnl = (entry_price - net_exit) * size - exit_fee - entry_fee_amount

                realized_pnl += pnl
                capital_at_risk = entry_price * size + entry_fee_amount
                ret_pct = (pnl / capital_at_risk) * 100 if capital_at_risk > 0 else 0.0

                trades.append({
                    "entry_idx": entry_idx,
                    "exit_idx": eff_exit_idx,
                    "entry_price": round(entry_price, 6),
                    "exit_price": round(net_exit, 6),
                    "pnl": round(pnl, 4),
                    "return_pct": round(ret_pct, 4),
                    "direction": "Long" if is_long else "Short",
                    "status": "Closed",
                    "size": round(size, 6),
                    "exit_reason": exit_reason,
                    "mae": round(mae, 4),
                    "mfe": round(mfe, 4),
                })
                in_position = False
                size = 0.0
                entry_fee_amount = 0.0

        # --- check entries ---
        if not in_position and entries[i] and i < n - 1:
            available_cash = init_cash + realized_pnl
            if available_cash <= 0:
                equity[i] = init_cash + realized_pnl
                continue

            if look_ahead_prevention:
                # Standard: enter on next open after signal
                ep = open_[i + 1]
            else:
                # Aggressive/Look-ahead: enter on current close
                ep = close[i]

            slip = ep * slippage
            entry_price = (ep + slip) if is_long else (ep - slip)
            if entry_price <= 0:
                equity[i] = init_cash + realized_pnl
                continue

            entry_fee_rate = 1 + fees
            
            entry_fee_rate = 1 + fees
            
            # Calculate Risk Amount ($)
            if risk_type == "PERCENT":
                risk_amount = available_cash * (risk_r / 100.0)
            elif risk_type == "KELLY" and kelly_f > 0:
                risk_amount = available_cash * kelly_f
            else:
                risk_amount = risk_r

            if size_by_sl and sl_stop is not None and sl_stop > 0:
                # Distance-based sizing: lose exactly risk_amount if SL is hit
                # Distance = price * sl_pct
                dist = entry_price * sl_stop
                if dist > 0:
                    size = risk_amount / dist
                else:
                    size = risk_amount / (entry_price * entry_fee_rate)
            else:
                # Traditional sizing: deploy risk_amount into the position
                size = risk_amount / (entry_price * entry_fee_rate)

            # Cap size by available cash
            max_size = available_cash / (entry_price * entry_fee_rate)
            size = min(size, max_size)

            if size <= 0:
                equity[i] = available_cash
                continue

            entry_fee_amount = abs(entry_price * size) * fees
            # Apply locates cost (per 100 shares)
            if locates_cost > 0:
                entry_fee_amount += (size / 100.0) * locates_cost

            realized_pnl -= entry_fee_amount
            in_position = True
            entry_idx = i + 1
            trail_extreme = entry_price
            mae = 0.0
            mfe = 0.0

        # --- equity ---
        current_equity = init_cash + realized_pnl
        if in_position:
            if is_long:
                unrealized = (close[i] - entry_price) * size
            else:
                unrealized = (entry_price - close[i]) * size
            equity[i] = current_equity + unrealized
        else:
            equity[i] = current_equity

    # If we are using Kelly, we might want to return the updated stats for the NEXT day
    # But since simulate() is called per Ticker/Date, we handle global stats in backtest_service.py
    return {"equity": equity, "trades": trades}
