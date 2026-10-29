# Data (`data/`)

| File | What it is | Task |
|---|---|---|
| `schema.json` | Case record format (JSON Schema 2020-12) | T06 |
| `examples/` | Worked examples that validate against the schema | T06 |
| `validate.py` | Checks records against the schema, plus span offsets, overlaps and held/missing evidence | T06 |
| `case_rules.py` | Draft checklists and policy rule IDs, replaced by `checklists.json` (T07) and `policies.json` (T08) | T07, T08 |
| `generate.py` | Synthetic case generator, writes `synthetic/cases.jsonl` | T11 |
| `tests/` | Tests for all of the above | |
| `knowledge/` | Evidence checklists and policy knowledge base (`checklists.json`, `policies.json`) | T07, T08 |
| `real/` | Optional local copy of real cases for testing. Gitignored, never committed | |

Real driver cases are never committed. The source copy stays in the private team Drive folder.

## Setup

```bash
cd data
python3.14 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest
```

## Generate and check cases

```bash
python generate.py                    # 150 cases -> synthetic/cases.jsonl (seed 42)
python validate.py synthetic/cases.jsonl
python validate.py examples/

# Optional: rewrite stories with Gemini so they read less like templates.
# Synthetic data only. Confirm the model ID in Google AI Studio first.
GEMINI_API_KEY=... python generate.py --rewrite gemini --model <model-id>
```

The mix is 35 cases for each of the four case types, plus 10 out-of-scope cases. Of these, 10 per case type and 5 out-of-scope are held out. About 40% of stories contain invented names, phone numbers, plates or M-Pesa codes, labelled under `labels.pii`, so the personal-details filter can be scored.

## Record format in short

```jsonc
{
  "schema_version": "1.0",
  "case_id": "SYN-042",            // SYN-### or REAL-###
  "source": "synthetic",           // real records also need "consent"
  "split": "build",                // or "held_out"
  "platform": "Bolt",
  "notice_text": null,
  "narrative": "Nilikuwa nachukua mteja stage ya Westlands around 9:30 PM ...",
  "evidence_held": [],
  "style": ["upset"],
  "language": "mixed",
  "labels": {                      // answers for scoring; the system never sees these
    "case_type": "fare_dispute",
    "entities": [{"text": "stage ya Westlands", "label": "LOCATION", "start": 24, "end": 42}],
    "pii": [],
    "evidence_missing": ["SUSPENSION_NOTICE", "TRIP_RECEIPT", "MPESA_RECEIPT", "IN_APP_CHAT", "ROUTE_MAP"],
    "policy_rules": ["LN120_REG15_1", "LN120_REG13_1_B", "DPA_S26_S35", "BOLT_KE_CL12", "BOLT_KE_CL13", "BOLT_KE_CL16_8"]
  }
}
```

Offsets work like Python slices: `narrative[start:end] == text`. Let code compute them, because offsets counted by hand are almost always wrong.
