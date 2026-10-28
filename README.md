# Sauti-ya-Dere-innovation-project
A project to help drivers who are facing account suspensions develop appeal reports as a way of recourse.

## Folders

| Folder | What goes in it |
|---|---|
| `app/` | PWA front end (Vite + React), deployed to Cloudflare Pages |
| `api/` | FastAPI backend, deployed to Google Cloud Run |
| `data/` | Case record schema, evidence checklists, policy knowledge base, synthetic case generator |
| `models/` | Classifier experiments and evaluation results |

## Running the backend locally

Needs Python 3.14. Everything installs inside a virtual environment (`api/.venv`).

```bash
cd api
python3.14 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt

cp ../.env.example .env        # then fill in values
uvicorn app.main:app --reload --no-access-log --env-file .env
```

Then open http://localhost:8000/health or the interactive docs at http://localhost:8000/docs.

Run the tests:

```bash
cd api
pytest
```

### Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Returns `{"status": "ok"}` |
| POST | `/analyze` | Stub for now. Takes `narrative`, optional `notice_text`, `platform`, `evidence_held`; returns a placeholder result |

### Privacy

Request bodies are never logged or stored. Always run Uvicorn with `--no-access-log`. Validation errors do not echo the submitted text back.

### Check the AI key (T05)

Put `ANTHROPIC_API_KEY` in `api/.env`, then:

```bash
cd api && source .venv/bin/activate
python scripts/check_ai_key.py
```

### Deploy to Cloud Run (T10)

Needs the gcloud CLI and a GCP project with billing on.

```bash
cd api
gcloud run deploy sauti-api --source . --region europe-west1 \
  --memory 2Gi --allow-unauthenticated \
  --set-env-vars CORS_ORIGINS=https://<pages-domain> \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest
```

Keep the key in Secret Manager (`anthropic-api-key`), never in `--set-env-vars`. Privacy rules for the backend are in [docs/privacy-and-redaction.md](docs/privacy-and-redaction.md).

### Docker

```bash
cd api
docker build -t sauti-api .
docker run -p 8080:8080 --env-file .env sauti-api
```
