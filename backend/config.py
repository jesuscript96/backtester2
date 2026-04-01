import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

MOTHERDUCK_TOKEN = os.getenv("MOTHERDUCK_TOKEN", "")
MOTHERDUCK_DB = os.getenv("MOTHERDUCK_DB", "my_db")

# GCS / DuckDB configuration
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
