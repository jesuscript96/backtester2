# gunicorn.conf.py — auto-loaded by gunicorn, overrides any CLI flags
# See: https://docs.gunicorn.org/en/stable/configure.html

workers = 1
worker_class = "uvicorn.workers.UvicornWorker"
bind = "0.0.0.0:3000"

# Backtest fetches GCS parquet + runs numpy engine — can take 60-120s
timeout = 300          # worker timeout (seconds)
graceful_timeout = 30  # time to finish current request on shutdown
keepalive = 5

# Logging
loglevel = "info"
accesslog = "-"
errorlog = "-"
