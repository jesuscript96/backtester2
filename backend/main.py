import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import data, backtest, optimization
from backend.config import ALLOWED_ORIGINS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("backtester")

app = FastAPI(title="BacktesterMVP", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router)
app.include_router(backtest.router)
app.include_router(optimization.router)


@app.on_event("startup")
def on_startup():
    logger.info("=== BacktesterMVP starting ===")
    logger.info(f"ALLOWED_ORIGINS = {ALLOWED_ORIGINS}")
    logger.info("Engine: pure numpy (no vectorbt)")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    import asyncio
    from fastapi.responses import JSONResponse
    start = time.time()
    try:
        response = await asyncio.wait_for(call_next(request), timeout=150.0)
        elapsed = round(time.time() - start, 2)
        logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({elapsed}s)")
        return response
    except asyncio.TimeoutError:
        elapsed = round(time.time() - start, 2)
        logger.error(f"{request.method} {request.url.path} -> TIMEOUT after {elapsed}s")
        return JSONResponse({"detail": "Request timed out"}, status_code=504)
    except Exception as e:
        elapsed = round(time.time() - start, 2)
        logger.error(f"{request.method} {request.url.path} -> ERROR after {elapsed}s: {e}")
        return JSONResponse({"detail": "Internal server error"}, status_code=500)


@app.get("/api/health")
def health():
    return {"status": "ok"}
