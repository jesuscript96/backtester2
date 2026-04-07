import gc
import logging
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.data_service import (
    get_strategy,
    fetch_qualifying_data,
    get_intraday_stream,
    fetch_day_candles,
    _resolve_filters,
)
from backend.services.backtest_service import run_backtest
from backend.services.montecarlo_service import run_montecarlo

logger = logging.getLogger("backtester.backtest")

router = APIRouter(prefix="/api", tags=["backtest"])

MAX_DAYS = 100000


class BacktestRequest(BaseModel):
    dataset_id: str
    strategy_id: str
    init_cash: float = 10000.0
    risk_r: float = 100.0
    risk_type: str = "FIXED"
    size_by_sl: bool = False
    fees: float = 0.0
    fee_type: str = "PERCENT"
    monthly_expenses: float = 0.0
    slippage: float = 0.0
    start_date: str | None = None
    end_date: str | None = None
    market_sessions: list[str] | None = None
    custom_start_time: str | None = None
    custom_end_time: str | None = None
    locates_cost: float = 0.0
    look_ahead_prevention: bool = False


class MonteCarloRequest(BaseModel):
    pnls: list[float]
    init_cash: float = 10000.0
    simulations: int = 1000


@router.post("/backtest")
def run_backtest_endpoint(req: BacktestRequest):
    t0 = time.time()
    logger.info(f"BACKTEST START dataset={req.dataset_id} strategy={req.strategy_id}")

    strategy = get_strategy(req.strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    # Validate SL exists when size_by_sl is requested
    if req.size_by_sl:
        rm = strategy["definition"].get("risk_management", {})
        has_hard_stop = rm.get("use_hard_stop") and rm.get("hard_stop", {}).get("value", 0) > 0
        has_trailing = rm.get("trailing_stop", {}).get("active", False)
        if not has_hard_stop and not has_trailing:
            raise HTTPException(
                status_code=400,
                detail="La estrategia no tiene configurado un Stop Loss. "
                       "Desactiva 'Size por Distancia al SL' o añade un Stop Loss a la estrategia.",
            )

    logger.info(f"  strategy loaded ({round(time.time()-t0, 2)}s)")

    try:
        # ---- PHASE 1: qualifying data (from local cache — fast) ----
        t_fetch = time.time()
        qualifying = fetch_qualifying_data(req.dataset_id, req.start_date, req.end_date)

        if qualifying.empty:
            logger.warning(f"  No qualifying data for dataset={req.dataset_id}")
            return {
                "aggregate_metrics": {},
                "day_results": [],
                "trades": [],
                "equity_curves": [],
                "global_equity": [],
                "global_drawdown": [],
            }

        # Apply date range filters on qualifying
        if req.start_date:
            qualifying = qualifying[qualifying["date"].astype(str) >= req.start_date]
        if req.end_date:
            qualifying = qualifying[qualifying["date"].astype(str) <= req.end_date]

        n_qualifying = len(qualifying)
        n_tickers = qualifying["ticker"].nunique()
        logger.info(
            f"  qualifying: {n_qualifying} rows, {n_tickers} tickers "
            f"({round(time.time()-t_fetch, 2)}s)"
        )

        # ---- PHASE 2: resolve date range for streaming ----
        filters = _resolve_filters(req.dataset_id, req.start_date, req.end_date)
        date_from = filters.get("start_date") or filters.get("date_from")
        date_to = filters.get("end_date") or filters.get("date_to")

        # ---- PHASE 3: create streaming iterator ----
        intraday_stream = get_intraday_stream(qualifying, date_from, date_to)

        # ---- PHASE 4: run backtest with streaming ----
        results = run_backtest(
            qualifying_df=qualifying,
            strategy_def=strategy["definition"],
            init_cash=req.init_cash,
            risk_r=req.risk_r,
            risk_type=req.risk_type,
            size_by_sl=req.size_by_sl,
            fees=req.fees,
            fee_type=req.fee_type,
            slippage=req.slippage,
            market_sessions=req.market_sessions,
            custom_start_time=req.custom_start_time,
            custom_end_time=req.custom_end_time,
            locates_cost=req.locates_cost,
            look_ahead_prevention=req.look_ahead_prevention,
            day_group_iter=intraday_stream,
            n_groups_hint=n_qualifying,
            monthly_expenses=req.monthly_expenses,
        )

        gc.collect()
        total_elapsed = round(time.time() - t0, 2)
        n_trades = len(results.get("trades", []))
        n_days = len(results.get("day_results", []))
        logger.info(
            f"BACKTEST DONE {n_days} days, {n_trades} trades, total={total_elapsed}s"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"  backtest FAILED after {round(time.time()-t0, 2)}s: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error en backtest: {str(e)}")

    return results


@router.get("/candles")
def get_candles(dataset_id: str, ticker: str, date: str):
    candles = fetch_day_candles(dataset_id, ticker, date)
    if not candles:
        raise HTTPException(status_code=404, detail="No candle data found")
    return {"ticker": ticker, "date": date, "candles": candles}


@router.post("/montecarlo")
def run_montecarlo_endpoint(req: MonteCarloRequest):
    if not req.pnls:
        raise HTTPException(status_code=400, detail="No trades provided")
    if req.simulations < 100 or req.simulations > 10000:
        raise HTTPException(
            status_code=400, detail="Simulations must be between 100 and 10000"
        )
    try:
        return run_montecarlo(req.pnls, req.init_cash, req.simulations)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error en Monte Carlo: {str(e)}"
        )
