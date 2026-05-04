"""
Generador de datos mock para pruebas de UI.
Genera mock_backtest.json con la estructura exacta que espera el frontend (BacktestResult en api.ts).

Para regenerar:
    python generate_mock.py
"""
import json
import random
from datetime import datetime, timedelta

random.seed(42)  # Resultados reproducibles

TICKERS = ["AAPL", "TSLA", "MSFT", "NVDA", "AMD", "META", "GOOGL", "AMZN"]
INIT_CASH = 10000.0

def epoch(dt: datetime) -> int:
    return int(dt.timestamp())

def generate():
    start_date = datetime(2024, 1, 2)
    cash = INIT_CASH
    peak = INIT_CASH

    global_equity: list = []
    global_drawdown: list = []
    trades: list = []
    day_results: list = []
    equity_curves: list = []  # DayEquity[]

    for day_i in range(120):
        current_date = start_date + timedelta(days=day_i)
        # Saltamos fines de semana
        if current_date.weekday() >= 5:
            continue

        ticker = random.choice(TICKERS)
        ts_day = epoch(current_date)

        # 0-3 trades por día
        num_trades = random.choices([0, 1, 2, 3], weights=[15, 45, 30, 10])[0]
        day_pnl = 0.0
        day_equity_pts: list = []
        day_trades_pnl: list = []
        running_cash = cash

        for t_i in range(num_trades):
            is_win = random.random() < 0.55
            entry_hour = random.randint(9, 14)
            entry_min = random.randint(30, 59) if entry_hour == 9 else random.randint(0, 59)
            entry_dt = current_date.replace(hour=entry_hour, minute=entry_min, second=0)
            exit_dt = entry_dt + timedelta(minutes=random.randint(15, 120))

            entry_price = round(random.uniform(20, 300), 2)
            pnl = round(random.uniform(60, 350) if is_win else random.uniform(-30, -180), 2)
            return_pct = round(pnl / running_cash * 100, 4)
            r_multiple = round(pnl / 100.0, 2)
            exit_price = round(entry_price * (1 + return_pct / 100), 2)
            size = max(1, int(abs(pnl) / max(abs(entry_price - exit_price), 0.01)))
            mae = round(random.uniform(0, abs(pnl) * 0.5), 2)
            mfe = round(random.uniform(abs(pnl) * 0.5, abs(pnl) * 1.5), 2)
            exit_reason = "take_profit" if is_win else random.choice(["stop_loss", "time_exit"])

            trades.append({
                "ticker": ticker,
                "date": current_date.strftime("%Y-%m-%d"),
                "entry_time": entry_dt.strftime("%Y-%m-%dT%H:%M:%S"),
                "exit_time": exit_dt.strftime("%Y-%m-%dT%H:%M:%S"),
                "entry_idx": t_i * 15,
                "exit_idx": t_i * 15 + random.randint(15, 120),
                "entry_time_epoch": epoch(entry_dt),
                "exit_time_epoch": epoch(exit_dt),
                "entry_price": entry_price,
                "exit_price": exit_price,
                "pnl": pnl,
                "return_pct": return_pct,
                "direction": "long",
                "status": "closed",
                "size": size,
                "exit_reason": exit_reason,
                "mae": mae,
                "mfe": mfe,
                "r_multiple": r_multiple,
                "entry_hour": entry_hour,
                "entry_weekday": current_date.weekday(),
            })

            running_cash += pnl
            day_pnl += pnl
            day_equity_pts.append({"time": epoch(exit_dt), "value": round(running_cash, 2)})
            day_trades_pnl.append(pnl)

        # Actualizar equity global
        cash += day_pnl
        if cash > peak:
            peak = cash
        dd_pct = round((cash - peak) / peak * 100, 4) if peak > 0 else 0.0

        global_equity.append({"time": ts_day, "value": round(cash, 2)})
        global_drawdown.append({"time": ts_day, "value": dd_pct})

        # DayEquity entry (aunque no haya trades, incluimos el día)
        if day_equity_pts:
            equity_curves.append({
                "ticker": ticker,
                "date": current_date.strftime("%Y-%m-%d"),
                "equity": day_equity_pts,
            })

        # DayResult
        w = sum(1 for p in day_trades_pnl if p > 0)
        total_t = len(day_trades_pnl)
        win_rate = round(w / total_t * 100, 2) if total_t > 0 else None
        gross_win = sum(p for p in day_trades_pnl if p > 0)
        gross_loss = abs(sum(p for p in day_trades_pnl if p < 0))
        pf = round(gross_win / gross_loss, 2) if gross_loss > 0 else None
        init_val = round(cash - day_pnl, 2)
        end_val = round(cash, 2)

        day_results.append({
            "ticker": ticker,
            "date": current_date.strftime("%Y-%m-%d"),
            "total_return_pct": round(day_pnl / init_val * 100, 4) if init_val else None,
            "max_drawdown_pct": round(random.uniform(-5, 0), 2) if total_t > 0 else None,
            "win_rate_pct": win_rate,
            "total_trades": total_t,
            "profit_factor": pf,
            "sharpe_ratio": round(random.uniform(0.5, 2.5), 2) if total_t > 0 else None,
            "sortino_ratio": round(random.uniform(0.5, 3.0), 2) if total_t > 0 else None,
            "expectancy": round(day_pnl / total_t, 2) if total_t > 0 else None,
            "best_trade_pct": round(max(day_trades_pnl) / init_val * 100, 4) if day_trades_pnl else None,
            "worst_trade_pct": round(min(day_trades_pnl) / init_val * 100, 4) if day_trades_pnl else None,
            "init_value": init_val,
            "end_value": end_val,
        })

    # ---- Aggregate metrics ----
    all_pnls = [t["pnl"] for t in trades]
    wins = [p for p in all_pnls if p > 0]
    losses = [p for p in all_pnls if p < 0]
    total_return_pct = round((cash - INIT_CASH) / INIT_CASH * 100, 4)
    max_dd = min(p["value"] for p in global_drawdown)
    calmar = round(total_return_pct / abs(max_dd), 2) if max_dd != 0 else 0
    pf_agg = round(sum(wins) / abs(sum(losses)), 2) if losses else 0
    avg_win = round(sum(wins) / len(wins), 2) if wins else 0
    avg_loss = round(sum(losses) / len(losses), 2) if losses else 0

    pnl_per_trade = all_pnls
    mean_pnl = sum(pnl_per_trade) / len(pnl_per_trade) if pnl_per_trade else 0
    variance = sum((x - mean_pnl) ** 2 for x in pnl_per_trade) / len(pnl_per_trade) if pnl_per_trade else 1
    std_pnl = variance ** 0.5
    sharpe = round(mean_pnl / std_pnl, 2) if std_pnl > 0 else 0

    aggregate_metrics = {
        "total_days": len(day_results),
        "total_trades": len(trades),
        "win_rate_pct": round(len(wins) / len(all_pnls) * 100, 2) if all_pnls else 0,
        "avg_return_per_day_pct": round(total_return_pct / len(day_results), 4) if day_results else 0,
        "total_return_pct": total_return_pct,
        "avg_sharpe": round(sharpe, 2),
        "max_drawdown_pct": round(max_dd, 2),
        "avg_profit_factor": pf_agg,
        "avg_pnl": round(mean_pnl, 2),
        "total_pnl": round(sum(all_pnls), 2),
        "sortino_ratio": round(sharpe * 1.2, 2),
        "calmar_ratio": calmar,
        "dd_return_ratio": round(total_return_pct / abs(max_dd), 2) if max_dd != 0 else 0,
        "r_squared": round(random.uniform(0.6, 0.95), 4),
        "max_mae": round(max(t["mae"] for t in trades), 2) if trades else 0,
        "max_profit_pct": round(max(t["return_pct"] for t in trades), 4) if trades else 0,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "max_consecutive_wins": random.randint(4, 12),
        "max_consecutive_losses": random.randint(2, 6),
        "expectancy": round(mean_pnl, 2),
        "payoff_ratio": round(avg_win / abs(avg_loss), 2) if avg_loss else 0,
        "avg_r_per_day": round(mean_pnl / 100.0, 2),
    }

    result = {
        "aggregate_metrics": aggregate_metrics,
        "day_results": day_results,
        "trades": trades,
        "equity_curves": equity_curves,   # DayEquity[] — array con ticker/date/equity
        "global_equity": global_equity,
        "global_drawdown": global_drawdown,
    }

    with open("mock_backtest.json", "w") as f:
        json.dump(result, f, indent=2)

    print(f"[OK] mock_backtest.json generado: {len(day_results)} dias, {len(trades)} trades")
    print(f"   Capital final: ${cash:,.2f}  |  Retorno: {total_return_pct:.2f}%  |  Max DD: {max_dd:.2f}%")

if __name__ == "__main__":
    generate()
