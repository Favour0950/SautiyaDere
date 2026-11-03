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

## Personal-details filter and fact extraction (T15, T16)

Both live in `app/services/` and share one spaCy model (`en_core_web_sm`, installed from `requirements.txt`; nothing downloads at runtime). They are not joined to `/analyze` yet; that is T31. In the app the filter runs first and extraction reads the filtered text.

```python
from app.services.redaction import redact, restore
from app.services.extraction import extract

result = redact(story)               # result.text has <PHONE_1>, <PERSON_1>...
facts = extract(result.text)         # [Entity(label="DATE", text="Sunday 11th"), ...]
appeal = restore(draft, result.mapping)   # appeal.text, appeal.missing, appeal.unknown
```

`result.mapping` holds the real values. Keep it in the request handler only: never log it, return it, or send it to the AI service.

**The filter** (`redaction.py`, Presidio) hides PHONE, PLATE, MPESA_CODE, PERSON and EMAIL. Details and results are in [privacy-and-redaction.md](privacy-and-redaction.md).

**Fact extraction** (`extraction.py`, spaCy) returns DATE, TIME, LOCATION, MONEY and TRIP_ID, in order and without repeats. An `EntityRuler` placed before spaCy's own entity model holds the patterns:

| Label | Examples it finds |
|---|---|
| MONEY | `KSh 2,300`, `Ksh2850`, `KES 950`, `bob 200`, `200bob`, `1700/-`, `2k`, and plain numbers after payment words: "paid 350", "fare was 1050", "walilipa 750", "badala ya 2,500" |
| DATE | `Sunday 11th`, `Friday 9 October`, `3rd Oct`, `last Thursday`, `7/10/2026`, `jana`, `juzi`, `Jumamosi`, `tarehe 4 Oktoba` |
| TIME | `5.30pm`, `8:40pm`, `9:30 PM`, `midnight`, `7:15 in the morning`, `saa tatu usiku`, `saa kumi na moja jioni` |
| LOCATION | Places in `data/nairobi_locations.json`, any case. Places that are everyday words (Fedha, Umoja) need a capital |
| TRIP_ID | `TRX-67091` anywhere; short codes like `F5UN` only after "trip id" or "trip no" |

spaCy's own entity guesses are switched off (`KEEP_FROM_MODEL` in `extraction.py`): on the build set they only added wrong facts, such as "four years" as a date.

Not handled yet: amounts in words ("elfu mbili"), dates without a year or month name ("23/10").

**Scoring** against the labelled synthetic cases:

```bash
cd api && source .venv/bin/activate
python scripts/score_pipeline.py              # build set: filter, facts kept, extraction
python scripts/score_pipeline.py --errors     # also list what was missed or wrongly added
python scripts/score_pipeline.py ../data/synthetic/held_out_set.jsonl
```

Tune patterns on the build set only. On 4 Nov 2026 both the build and held-out sets scored 100% for every label.

To add a place or a name, edit `data/nairobi_locations.json` or `data/kenyan_names.json`; the tests in `data/tests/` check the files.

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
