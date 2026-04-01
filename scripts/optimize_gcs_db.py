import duckdb
import time
import argparse
from backend.config import GCS_ACCESS_KEY_ID, GCS_SECRET_ACCESS_KEY, GCS_BUCKET

def optimize_month(year: int, month: int):
    """
    Descarga el mes especificado, lo ORDENA FÍSICAMENTE por ticker y fecha localmente,
    y lo resube a GCS. Esto permite que DuckDB HTTPFS salte mágicamente a los bytes
    exactos del ticker durante los backtests en vez de descargar el mes entero.
    """
    print(f"\n[+] Iniciando optimización para {year}-{month:02d}...")
    
    c = duckdb.connect()
    c.execute("INSTALL httpfs; LOAD httpfs;")
    c.execute(f"SET s3_access_key_id='{GCS_ACCESS_KEY_ID}';")
    c.execute(f"SET s3_secret_access_key='{GCS_SECRET_ACCESS_KEY}';")
    c.execute("SET s3_region='us-east-1';")
    c.execute("SET s3_endpoint='storage.googleapis.com';")
    
    # Para evitar colapsar la RAM de tu Mac, limitamos la memoria y permitimos que DuckDB use el disco local como caché si el mes es enorme
    c.execute("PRAGMA max_memory='4GB';")
    c.execute("PRAGMA temp_directory='/tmp/duckdb_spill';")
    
    source_path = f"gs://{GCS_BUCKET}/cold_storage/intraday_1m/year={year}/month={month}/*.parquet"
    dest_path = f"gs://{GCS_BUCKET}/cold_storage/intraday_1m_optimized/year={year}/month={month}/"
    
    query = f"""
    COPY (
        SELECT * 
        FROM read_parquet('{source_path}', hive_partitioning=true)
        ORDER BY ticker, date, "timestamp"
    ) TO '{dest_path}' 
    (FORMAT PARQUET, OVERWRITE_OR_IGNORE=true);
    """
    
    t0 = time.time()
    try:
        # Pre-contamos para ver si existe
        check = c.execute(f"SELECT count(*) FROM glob('{source_path}')").fetchall()[0][0]
        if check == 0:
            print(f"[-] No existen archivos raw para {year}-{month:02d}. Saltando.")
            return

        print(f"[*] Descargando, clusterizando por ticker, y subiendo a {dest_path} ... (Esto puede tardar un poco dependiento tu WiFi)")
        c.execute(query)
        print(f"[✓] Mes {year}-{month:02d} Optimizado con éxito en {round(time.time()-t0, 2)}s!")
    except Exception as e:
        print(f"[x] Error en {year}-{month:02d}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clusterize GCS Parquet files for Backtester HTTPFS speeds.")
    parser.add_argument("--year", type=int, required=True, help="Año a optimizar (ej. 2025)")
    parser.add_argument("--month", type=int, required=True, help="Mes a optimizar (ej. 11)")
    args = parser.parse_args()
    
    optimize_month(args.year, args.month)
