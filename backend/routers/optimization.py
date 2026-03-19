"""
API router for optimization surface endpoints.
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.data_service import get_strategy
from backend.services.optimization_service import extract_parameters, run_optimization_grid

logger = logging.getLogger("backtester.optimization")

router = APIRouter(prefix="/api", tags=["optimization"])


class ParametersRequest(BaseModel):
    strategy_id: str


class ParamConfig(BaseModel):
    id: str
    label: str = ""
    path: str
    min: float
    max: float
    steps: int = 10
    values: list[float] | None = None


class SurfaceRequest(BaseModel):
    strategy_id: str
    dataset_id: str
    metric: str = "sharpe"
    param_configs: list[ParamConfig]
    init_cash: float = 10000.0
    risk_r: float = 100.0
    risk_type: str = "FIXED"
    size_by_sl: bool = False
    fees: float = 0.0
    fee_type: str = "PERCENT"
    slippage: float = 0.0
    start_date: str | None = None
    end_date: str | None = None
    market_sessions: list[str] | None = None
    custom_start_time: str | None = None
    custom_end_time: str | None = None
    locates_cost: float = 0.0
    look_ahead_prevention: bool = False


@router.post("/optimization/parameters")
def get_optimization_parameters(req: ParametersRequest):
    logger.info(f"Extracting parameters for strategy {req.strategy_id}")
    strategy = get_strategy(req.strategy_id)
    if not strategy:
        logger.error(f"Strategy {req.strategy_id} not found")
        raise HTTPException(status_code=404, detail="Strategy not found")

    try:
        params = extract_parameters(strategy["definition"])
        logger.info(f"Found {len(params)} parameters for strategy {strategy['name']}")
        return {"parameters": params, "strategy_name": strategy["name"]}
    except Exception as e:
        logger.error(f"Error extracting parameters: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/optimization/surface")
def run_surface(req: SurfaceRequest):
    try:
        result = run_optimization_grid(
            strategy_id=req.strategy_id,
            dataset_id=req.dataset_id,
            param_configs=[pc.model_dump() for pc in req.param_configs],
            metric=req.metric,
            backtest_params={
                "init_cash": req.init_cash,
                "risk_r": req.risk_r,
                "risk_type": req.risk_type,
                "size_by_sl": req.size_by_sl,
                "fees": req.fees,
                "fee_type": req.fee_type,
                "slippage": req.slippage,
                "start_date": req.start_date,
                "end_date": req.end_date,
                "market_sessions": req.market_sessions,
                "custom_start_time": req.custom_start_time,
                "custom_end_time": req.custom_end_time,
                "locates_cost": req.locates_cost,
                "look_ahead_prevention": req.look_ahead_prevention,
            },
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Optimization error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")
