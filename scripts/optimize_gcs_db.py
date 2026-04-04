import argparse
import os
import sys
import time

import duckdb
from dotenv import load_dotenv

# Ejecutar desde repo: python scripts/optimize_gcs_db.py (cwd = backtester/)
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ENV = os.path.join(_ROOT, ".env")
load_dotenv(_ENV)

# No importar backend.config (evita prints ruidosos y efectos secundarios del servidor).
GCS_ACCESS_KEY_ID = os.getenv("GCS_ACCESS_KEY_ID", "")
GCS_SECRET_ACCESS_KEY = os.getenv("GCS_SECRET_ACCESS_KEY", "")
GCS_BUCKET = os.getenv("GCS_BUCKET", "strategybuilderbbdd")


def _dollar_quote(s: str) -> str:
    """DuckDB: rutas gs:// con year=… rompen COPY/parse si van entre comillas simples."""
    if "$" in s:
        s = s.replace("$", "")
    return "$$" + s + "$$"


def _connect_gcs_duckdb():
    c = duckdb.connect()
    c.execute("INSTALL httpfs; LOAD httpfs;")
    c.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
    c.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
    c.execute("SET s3_region='us-east-1';")
    c.execute("SET s3_endpoint='storage.googleapis.com';")
    c.execute("SET s3_url_style='path';")
    c.execute("PRAGMA max_memory='4GB';")
    c.execute("PRAGMA temp_directory='/tmp/duckdb_spill';")
    return c


def optimize_month(year: int, month: int) -> bool:
    """
    Descarga el mes, ordena por ticker/fecha y sube a intraday_1m_optimized.
    Devuelve True si hubo datos raw y se ejecutó COPY (aunque falle después).
    """
    print(f"\n[+] Iniciando optimización para {year}-{month:02d}...", flush=True)

    if not GCS_ACCESS_KEY_ID or not GCS_SECRET_ACCESS_KEY:
        print("[x] Faltan GCS_ACCESS_KEY_ID / GCS_SECRET_ACCESS_KEY en .env", flush=True)
        return False

    c = _connect_gcs_duckdb()

    source_path = None
    dest_suffix = None
    for pad in (f"{month:02d}", str(month)):
        sp = f"gs://{GCS_BUCKET}/cold_storage/intraday_1m/year={year}/month={pad}/*.parquet"
        try:
            check = c.execute(f"SELECT count(*) FROM glob('{sp}')").fetchall()[0][0]
        except Exception as e:
            print(f"    glob falló ({pad}): {e}", flush=True)
            check = 0
        if check > 0:
            source_path = sp
            dest_suffix = pad
            print(f"    Fuente: {check} fichero(s) en .../month={pad}/", flush=True)
            break

    if not source_path:
        print(
            f"[-] No hay raw intraday para {year}-{month:02d} (month=MM y month=M). Saltando.",
            flush=True,
        )
        return False

    # Un fichero por partición (glob del backtest: .../month=XX/*.parquet).
    dest_path = (
        f"gs://{GCS_BUCKET}/cold_storage/intraday_1m_optimized/"
        f"year={year}/month={dest_suffix}/data.parquet"
    )

    rp = _dollar_quote(source_path)
    dp = _dollar_quote(dest_path)
    query = f"""
    COPY (
        SELECT *
        FROM read_parquet({rp}, hive_partitioning=true)
        ORDER BY ticker, "date", "timestamp"
    ) TO {dp} (FORMAT PARQUET, OVERWRITE_OR_IGNORE);
    """

    t0 = time.time()
    try:
        print(
            "[*] COPY en curso (lee todo el mes en GCS, ordena por ticker y sube). "
            "Puede tardar 5–30+ min por mes; aquí no hay barra de progreso.",
            flush=True,
        )
        print(f"    Destino: {dest_path}", flush=True)
        c.execute(query)
        print(f"[✓] {year}-{month:02d} optimizado en {round(time.time() - t0, 2)}s", flush=True)
        return True
    except Exception as e:
        print(f"[x] Error en {year}-{month:02d}: {e}", flush=True)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Reordena Parquet intradía en GCS por ticker (intraday_1m_optimized)."
    )
    parser.add_argument("--year", type=int, help="Año (un solo mes con --month)")
    parser.add_argument("--month", type=int, help="Mes 1-12 (con --year)")
    parser.add_argument(
        "--years",
        type=str,
        help="Lista de años separada por comas; procesa meses 1-12 de cada uno (p. ej. 2025,2026)",
    )
    args = parser.parse_args()

    if args.years:
        years = [int(y.strip()) for y in args.years.split(",") if y.strip()]
        ok = 0
        skip = 0
        for y in years:
            for m in range(1, 13):
                r = optimize_month(y, m)
                if r:
                    ok += 1
                else:
                    skip += 1
        print(f"\n=== Resumen: ejecutados con COPY={ok}, sin datos/saltados={skip} ===", flush=True)
        return

    if args.year is not None and args.month is not None:
        optimize_month(args.year, args.month)
        return

    parser.error("Usa --year Y --month M, o bien --years 2025,2026")


if __name__ == "__main__":
    main()
