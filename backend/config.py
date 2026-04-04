import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

MOTHERDUCK_TOKEN = os.getenv("MOTHERDUCK_TOKEN", "")
MOTHERDUCK_DB = os.getenv("MOTHERDUCK_DB", "my_db")

# GCS / DuckDB configuration
# httpfs+Parquet: predicados hive year/month en SQL ayudan al pruning; intradía raw
# sin orden por ticker sigue leyendo muchos row groups (optimize_gcs_db.py).
DB_TYPE = os.getenv("DB_TYPE", "motherduck")
GCS_ACCESS_KEY_ID = os.getenv("GCS_ACCESS_KEY_ID", "")
GCS_SECRET_ACCESS_KEY = os.getenv("GCS_SECRET_ACCESS_KEY", "")
GCS_BUCKET = os.getenv("GCS_BUCKET", "strategybuilderbbdd")

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:3001,https://backtester-psi.vercel.app,https://backtester2-teal.vercel.app",
    ).split(",")
    if o.strip()
]

# Ensure critical frontend URLs are always allowed regardless of .env misconfiguration
_required_origins = [
    "https://backtester-psi.vercel.app",
    "https://backtester2-teal.vercel.app"
]
for origin in _required_origins:
    if origin not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(origin)

# ---------------------------------------------------------------------------
# Cache & performance tuning
# ---------------------------------------------------------------------------
CACHE_DIR = os.getenv("CACHE_DIR", "/tmp/backtester_cache")
CACHE_TTL_HOURS = int(os.getenv("CACHE_TTL_HOURS", "24"))
batch_size = 500  # HARDCODED OVERRIDE FOR PERFORMANCE
INTRADAY_BATCH_SIZE = int(os.getenv("INTRADAY_BATCH_SIZE", "500"))
DUCKDB_MEMORY_LIMIT = os.getenv("DUCKDB_MEMORY_LIMIT", "2500MB")

