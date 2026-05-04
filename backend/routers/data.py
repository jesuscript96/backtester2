from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.services.data_service import (
    list_strategies,
    get_strategy,
    list_datasets,
    get_dataset,
)

router = APIRouter(prefix="/api", tags=["data"])


# --- Strategies ---

@router.get("/strategies")
def get_strategies():
    strategies = list_strategies()
    # Mock data for UI testing
    strategies.append({
        "id": "mock_strat_1",
        "name": "Mock Strategy (Temporal)",
        "description": "Estrategia de prueba por falta de DB",
        "definition": {}
    })
    return strategies


@router.get("/strategies/{strategy_id}")
def get_strategy_endpoint(strategy_id: str):
    if strategy_id == "mock_strat_1":
        return {
            "id": "mock_strat_1",
            "name": "Mock Strategy (Temporal)",
            "description": "Estrategia de prueba por falta de DB",
            "definition": {}
        }
    s = get_strategy(strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return s


# --- Datasets ---

class PairItem(BaseModel):
    ticker: str
    date: str


class CreateDatasetRequest(BaseModel):
    name: str
    pairs: list[PairItem]


@router.get("/datasets")
def get_datasets():
    datasets = list_datasets()
    # Mock data for UI testing
    datasets.append({
        "id": "mock_dataset_1",
        "name": "Mock Dataset (Temporal)",
        "pair_count": 100,
        "min_date": "2024-01-01",
        "max_date": "2024-12-31",
        "created_at": "2024-01-01T00:00:00Z"
    })
    return datasets


@router.get("/datasets/{dataset_id}")
def get_dataset_endpoint(dataset_id: str):
    if dataset_id == "mock_dataset_1":
        return {
            "id": "mock_dataset_1",
            "name": "Mock Dataset (Temporal)",
            "filters": {},
            "pair_count": 100,
            "min_date": "2024-01-01",
            "max_date": "2024-12-31",
            "pairs": []
        }
    ds = get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds


@router.post("/datasets")
def create_dataset_endpoint(req: CreateDatasetRequest):
    # This endpoint is deprecated in the new my_db system
    raise HTTPException(status_code=501, detail="Dataset creation is managed via saved_queries in the database.")


@router.delete("/datasets/{dataset_id}")
def delete_dataset_endpoint(dataset_id: str):
    # This endpoint is deprecated in the new my_db system
    raise HTTPException(status_code=501, detail="Dataset deletion is managed via the database.")


@router.post("/cache/refresh")
def refresh_cache():
    """Force re-sync of hot tables (strategies, saved_queries) from GCS."""
    from backend.db.gcs_cache import sync_hot_tables
    sync_hot_tables(force=True)
    return {"status": "ok", "message": "Cache refreshed"}
