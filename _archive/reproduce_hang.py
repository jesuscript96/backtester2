import sys
import os
import time
import logging

# Add root to sys.path
sys.path.append(os.getcwd())

from backend.services.data_service import get_strategy, fetch_dataset_data
from backend.services.backtest_service import run_backtest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_bt")

STRAT_ID = "3bac965e-d918-43d1-9c33-c66decd0827f"
DSET_ID = "c63e716a-b18c-4dd1-ac5e-033e0ce9e868"

def main():
    t0 = time.time()
    logger.info("Loading strategy...")
    strat = get_strategy(STRAT_ID)
    if not strat:
        logger.error("Strategy not found")
        return
    
    logger.info("Fetching data...")
    qualifying, intraday = fetch_dataset_data(DSET_ID)
    logger.info(f"Data fetched: {len(qualifying)} qual, {len(intraday)} intra")
    
    if intraday.empty:
        logger.error("Intraday data empty")
        return
        
    logger.info("Running backtest...")
    results = run_backtest(
        intraday_df=intraday,
        qualifying_df=qualifying,
        strategy_def=strat["definition"],
        init_cash=10000,
        risk_r=100
    )
    
    logger.info(f"Backtest complete in {time.time() - t0:.2f}s")
    logger.info(f"Trades: {len(results['trades'])}")

if __name__ == "__main__":
    main()
