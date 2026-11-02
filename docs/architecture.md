# Architecture and pipeline

Sauti ya Dere turns a driver's unstructured story into a structured, appeal-ready case file.

## 1. Pipeline

1. **Intake (PWA).** The driver types or speaks their story, picks the platform, pastes the suspension notice if they have one, and ticks the evidence they hold.
2. **Personal-details redaction (API, Presidio).** Names, Kenyan phone numbers (+254 / 07...), number plates, M-Pesa codes, ID numbers and emails are swapped for placeholders before anything else sees the text. Details in [privacy-and-redaction.md](privacy-and-redaction.md).
3. **Fact extraction (spaCy EntityRuler).** Dates, times, locations (Nairobi stages and routes), amounts in KSh and trip IDs. Labels match `DATE`, `TIME`, `LOCATION`, `MONEY`, `TRIP_ID` in `data/schema.json`.
4. **Case type.** One of five types:
   - `passenger_safety`
   - `fare_dispute`
   - `rating_or_cancellation`
   - `fraud_flag`
   - `out_of_scope` (not something the app can help with; the driver is pointed elsewhere)
5. **Evidence gap check.** Compares the evidence the driver holds against the checklist for that case type (`checklists.json`, T07) and lists what is missing.
6. **Appeal and case file.** Drafts the appeal statement, citing rule IDs from `policies.json` (T08), and builds a one-page PDF on the phone (`pdf-lib`).

The `/analyze` response that carries all of this is described in [api.md](api.md#analyze-request-and-response).

## 2. Classifier benchmark (Colab)

Four approaches are compared on the synthetic set (150 cases, see [data.md](data.md)) and checked on the real test set (T17):

- **Model 1:** Regex and keyword rules (baseline)
- **Model 2:** Zero-shot NLI (Hugging Face DeBERTa-v3)
- **Model 3:** Few-shot fine-tuned embeddings (SetFit, BAAI)
- **Model 4:** Structured LLM extraction (Claude API)

Metrics: precision, recall, macro-F1 and a confusion matrix (`models/evaluate.py`). Results go in `docs/model-results.md` (T38).

## 3. Who owns what

- **Violet (Frontend and privacy):** PWA (React + Vite), UI screens, Dexie.js storage on the phone, Presidio recognizers, PDF export.
- **George (Backend and AI):** FastAPI endpoints, synthetic data generator, spaCy extraction rules, model benchmark in Colab.
- **Mercy (Domain knowledge and testing):** policy knowledge base (`policies.json`), evidence checklists (`checklists.json`), real test set labelling, TAWU driver testing sessions.

Redaction runs inside the API service, so Presidio work touches both Violet's and George's areas. Agree changes to `api/` together.

## 4. Responsible-computing safeguards

- **Driver stays in control of the result.** The UI shows the predicted case type and confidence. Below the confidence threshold it asks the driver to confirm. The driver can always change the case type and edit extracted facts.
- **Dignity and no retaliation risk.** No central database by default. Cases and screenshots live only in the driver's browser (IndexedDB). See [privacy-and-redaction.md](privacy-and-redaction.md) for the exceptions and the consent they need.
