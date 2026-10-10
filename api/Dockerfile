# DSBA Hub API. Build context: api/
# Debian trixie: its postgresql-client (17) can dump the PostgreSQL 17 server of compose.yaml and compose.prod.yaml
# (pg_dump refuses a server newer than itself).
FROM python:3.12-slim-trixie

# DSBA_ENV=production makes the image safe by default: the API refuses to start until every production setting is
# set (app/config.py). compose.yaml sets development for local work.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DSBA_ENV=production

# pg_dump for `python -m app.cli backup`
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app

RUN useradd --system --uid 10001 --home /app app && mkdir -p /app/var && chown -R app /app/var
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4).status == 200 else 1)"
# --no-proxy-headers: uvicorn leaves the connection's peer as it is. The API itself reads X-Forwarded-For and
# X-Forwarded-Proto, and only from DSBA_TRUSTED_PROXIES (app/core/security.py; security review, finding 1).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers", "--no-server-header"]
