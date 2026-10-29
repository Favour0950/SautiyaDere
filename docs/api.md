# Backend API (`api/`)

FastAPI backend, deployed to Google Cloud Run.

## Run locally

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

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Returns `{"status": "ok"}` |
| POST | `/analyze` | Stub for now. Takes `narrative`, optional `notice_text`, `platform`, `evidence_held`; returns the shape below with empty values |

## `/analyze` request and response

Field names match the case record in [data.md](data.md): case types, entity labels, checklist item IDs and policy rule IDs are the same values. The response layout was proposed by Violet.

Request:

```json
{
  "narrative": "Picked up a client around 9:30 PM on Tuesday at Westlands. She refused to pay KSh 450 via M-Pesa at the gate...",
  "notice_text": null,
  "platform": "Bolt",
  "evidence_held": ["TRIP_RECEIPT"]
}
```

Response:

```json
{
  "stub": false,
  "redacted_narrative": "Picked up a client around 9:30 PM on Tuesday at Westlands. She refused to pay KSh 450 via M-Pesa at the gate...",
  "classification": {
    "case_type": "fare_dispute",
    "confidence": 0.89,
    "confidence_threshold": 0.70,
    "needs_confirmation": false
  },
  "entities": [
    {"label": "TIME", "text": "9:30 PM"},
    {"label": "DATE", "text": "Tuesday"},
    {"label": "LOCATION", "text": "Westlands"},
    {"label": "MONEY", "text": "KSh 450"}
  ],
  "evidence": {
    "readiness": 0.2,
    "missing": [
      {"id": "SUSPENSION_NOTICE", "reason": "Shows what the platform accused you of and when."},
      {"id": "MPESA_RECEIPT", "reason": "Shows whether the fare was paid or reversed."},
      {"id": "IN_APP_CHAT", "reason": "Shows what you and the passenger agreed."},
      {"id": "ROUTE_MAP", "reason": "Shows the trip ended where you say it did."}
    ],
    "optional": []
  },
  "appeal": {
    "headline": "Appeal against account restriction: fare dispute on Tuesday",
    "body": "To Bolt Support, I am appealing the restriction placed on my account after ...",
    "policy_rules": ["LN120_REG15_1", "LN120_REG13_1_B", "DPA_S26_S35", "BOLT_KE_CL12", "BOLT_KE_CL13", "BOLT_KE_CL16_8"]
  }
}
```

| Field | Meaning |
|---|---|
| `redacted_narrative` | The story with personal details replaced by placeholders such as `<PERSON_1>`, so the driver can see what was removed |
| `classification.needs_confirmation` | `true` when `confidence` is below `confidence_threshold`. The PWA then asks the driver to choose the case type |
| `entities` | A list, not a dict, so a story with two dates or two amounts keeps both |
| `evidence.readiness` | Required checklist items held, divided by required items for the case type. Above: 1 of 5 held |
| `evidence.missing` | Required items not held, in checklist order, each with a plain-words reason |
| `evidence.optional` | Optional checklist items not held. Never counted against readiness |
| `appeal.policy_rules` | Rule IDs from `policies.json` (T08). The PWA looks up the clause wording to show the driver. The API never writes clause numbers as free text |

Until T31 joins the pipeline, the stub returns `"stub": true` with nulls and empty lists.

## Privacy

Request bodies are never logged or stored. Always run Uvicorn with `--no-access-log`. Validation errors do not echo the submitted text back.

## Check the AI key (T05)

Put `ANTHROPIC_API_KEY` in `api/.env`, then:

```bash
cd api && source .venv/bin/activate
python scripts/check_ai_key.py
```

## Deploy to Cloud Run (T10)

Needs the gcloud CLI and a GCP project with billing on.

```bash
cd api
gcloud run deploy sauti-api --source . --region europe-west1 \
  --memory 2Gi --allow-unauthenticated \
  --set-env-vars CORS_ORIGINS=https://<pages-domain> \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest
```

Keep the key in Secret Manager (`anthropic-api-key`), never in `--set-env-vars`. Privacy rules for the backend are in [docs/privacy-and-redaction.md](privacy-and-redaction.md).

## Docker

```bash
cd api
docker build -t sauti-api .
docker run -p 8080:8080 --env-file .env sauti-api
```
