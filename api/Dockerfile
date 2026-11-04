# Build from the repo root, not from api/, so data/ can be copied in:
#   docker build -f api/Dockerfile -t sauti-api .
# The repo-root .dockerignore decides which files are sent to Docker.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/app ./app
COPY data ./data

# Cloud Run sets $PORT. --no-access-log keeps request details out of the logs.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --no-access-log"]
