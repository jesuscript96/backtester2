#!/usr/bin/env python3
"""
Recorre todos los meses con datos raw en gs://.../intraday_1m/year=*/month=*/
y ejecuta la optimización (ORDER BY ticker → intraday_1m_optimized), empezando
por el mes más reciente. Puede tardar horas; interrumpir con Ctrl+C es seguro
(el mes en curso puede quedar a medias; relanzar es idempotente con OVERWRITE).

Uso (desde el directorio backtester/; **usa el venv del proyecto**, no python3 del sistema):

  ./venv/bin/python scripts/optimize_all_intraday_recent_first.py

Requiere en .env: GCS_ACCESS_KEY_ID, GCS_SECRET_ACCESS_KEY, GCS_BUCKET
"""

from __future__ import annotations

import importlib.util
import re
import sys
import time
from datetime import date
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
_ROOT = _SCRIPTS.parent

try:
    import duckdb  # noqa: F401 — comprobar antes de cargar optimize_gcs_db
except ModuleNotFoundError:
    vpy = _ROOT / "venv" / "bin" / "python"
    hint = f"  {vpy} {_SCRIPTS / 'optimize_all_intraday_recent_first.py'}" if vpy.is_file() else "  pip install duckdb"
    print(
        "Error: no está instalado el paquete 'duckdb' en este intérprete.\n"
        "Ejecuta el script con el Python del entorno virtual del backtester, por ejemplo:\n"
        f"{hint}",
        file=sys.stderr,
        flush=True,
    )
    raise SystemExit(1) from None


def _load_optimize_module():
    path = _SCRIPTS / "optimize_gcs_db.py"
    spec = importlib.util.spec_from_file_location("optimize_gcs_db", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"No se puede cargar {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _discover_months_glob(conn, gcs_bucket: str) -> set[tuple[int, int]]:
    """Un glob amplio; devuelve (año, mes) únicos. mes es entero 1-12."""
    pat = f"gs://{gcs_bucket}/cold_storage/intraday_1m/year=*/month=*/*.parquet"
    pairs: set[tuple[int, int]] = set()
    rows = conn.execute(f"SELECT file FROM glob('{pat}')").fetchall()
    for (fpath,) in rows:
        m = re.search(r"year=(\d+)/month=([^/]+)/", fpath)
        if not m:
            continue
        y = int(m.group(1))
        mo = int(m.group(2))  # 09 → 9
        pairs.add((y, mo))
    return pairs


def _discover_months_scan(conn, gcs_bucket: str) -> set[tuple[int, int]]:
    """
    Fallback: prueba year/month desde (año_actual+1) hasta 2000, mes 12→1.
    Más lento pero no depende de un glob recursivo enorme.
    """
    pairs: set[tuple[int, int]] = set()
    cy = date.today().year + 1
    for y in range(cy, 1999, -1):
        for mo in range(12, 0, -1):
            for pad in (f"{mo:02d}", str(mo)):
                g = f"gs://{gcs_bucket}/cold_storage/intraday_1m/year={y}/month={pad}/*.parquet"
                try:
                    n = conn.execute(f"SELECT count(*) FROM glob('{g}')").fetchone()[0]
                except Exception:
                    n = 0
                if n > 0:
                    pairs.add((y, mo))
                    break
    return pairs


def main() -> int:
    sys.path.insert(0, str(_ROOT))
    og = _load_optimize_module()
    optimize_month = og.optimize_month
    _connect_gcs_duckdb = og._connect_gcs_duckdb
    GCS_BUCKET = og.GCS_BUCKET

    if not og.GCS_ACCESS_KEY_ID or not og.GCS_SECRET_ACCESS_KEY:
        print("[x] Faltan GCS_ACCESS_KEY_ID / GCS_SECRET_ACCESS_KEY en .env", flush=True)
        return 1

    print(f"[*] Bucket: {GCS_BUCKET}", flush=True)
    print("[*] Descubriendo particiones intraday_1m (raw)...", flush=True)
    t0 = time.time()
    conn = _connect_gcs_duckdb()
    try:
        try:
            pairs = _discover_months_glob(conn, GCS_BUCKET)
            if not pairs:
                raise RuntimeError("glob vacío")
            print(f"    glob amplio: {len(pairs)} mes(es) distintos", flush=True)
        except Exception as e:
            print(f"    aviso: {e} — usando escaneo año/mes...", flush=True)
            pairs = _discover_months_scan(conn, GCS_BUCKET)
            print(f"    escaneo: {len(pairs)} mes(es) con datos", flush=True)
    finally:
        conn.close()

    if not pairs:
        print("[-] No se encontró ningún raw bajo intraday_1m/", flush=True)
        return 0

    # Más reciente primero: (año desc, mes desc)
    ordered = sorted(pairs, key=lambda t: (t[0], t[1]), reverse=True)
    print(
        f"[*] Orden: {ordered[0][0]}-{ordered[0][1]:02d} → "
        f"{ordered[-1][0]}-{ordered[-1][1]:02d} ({len(ordered)} meses)",
        flush=True,
    )
    print(f"[*] Descubrimiento en {round(time.time() - t0, 2)}s\n", flush=True)

    ok = skip = 0
    t_run = time.time()
    for i, (y, m) in enumerate(ordered, start=1):
        print(f"=== [{i}/{len(ordered)}] {y}-{m:02d} ===", flush=True)
        if optimize_month(y, m):
            ok += 1
        else:
            skip += 1

    print(
        f"\n=== Hecho en {round(time.time() - t_run, 2)}s: "
        f"COPY ok={ok}, sin raw/saltados={skip} ===",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
