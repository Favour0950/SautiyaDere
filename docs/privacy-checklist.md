# Privacy & Data Protection Audit Checklist (`T37`)

**Owner:** Mercy (`@ImpactByMercy`) — Domain Knowledge & Testing Lead  
**Sprint:** Sprint 3 (Working System Verification)  
**Regulatory Baseline:** Kenya Data Protection Act, 2019 (Sections 25, 26, 35 & 41) & NTSA Legal Notice 120 (2022)  

---

## Summary Verification Table

| # | Privacy Requirement (`T37`) | Status | Code / Infrastructure Evidence |
| :---: | :--- | :---: | :--- |
| **1** | **No case data stored on the server** | **PASS** | `api/app/main.py` has zero database, disk, or session writes. All cases, notes, and screenshots live locally in the phone's browser via Dexie.js (`web/src/db/db.js`). |
| **2** | **Request bodies not logged** | **PASS** | `api/Dockerfile` runs Uvicorn with `--no-access-log`. `api/app/main.py` overrides `RequestValidationError` to strip `input` and `ctx` fields before returning `422` responses. |
| **3** | **Personal details removed before AI call** | **PASS** | `api/app/services/redaction.py` runs Microsoft Presidio + custom Kenyan recognisers (`PHONE`, `PLATE`, `MPESA_CODE`, `PERSON`, `EMAIL`) to replace PII with `<PHONE_1>`, `<PLATE_1>`, etc. before any text reaches an external LLM. |
| **4** | **AI service spend limit & key isolation active** | **PASS** | API keys are loaded strictly from backend environment variables (`api/.env`, gitignored), never bundled in `web/`, with a hard `USD 10/month` spend cap configured (`T05`). |
| **5** | **Real driver test cases excluded from Git & Docker** | **PASS** | `.gitignore` and `.dockerignore` explicitly block `data/real/`, `.env`, and `*.env.*` from version control and container images. |

---

## Detailed Audit Checks

### 1. Zero Server-Side Case Storage (Data Minimization & Local Sovereignty)
- [x] **Stateless `/api/analyze` Endpoint:** Inspected `api/app/main.py`. The FastAPI application processes incoming `AnalyzeRequest` payloads exclusively in volatile memory for the duration of the HTTP request and returns an `AnalyzeResponse`. No SQL/NoSQL database, file append, or cache persists driver narratives on the backend.
- [x] **On-Device Persistence (`IndexedDB`):** Inspected `web/src/db/db.js` and `web/tests/db.test.js`. Driver profiles, case logs, checklists, and evidence screenshots are stored locally on the driver's smartphone using **Dexie.js (`IndexedDB`)**.
- [x] **Client-Side PDF Generation:** Inspected `web/src/utils/pdfGenerator.js` (`T35`). The 1-page A4 PDF appeal dossier is assembled directly inside the user's browser using `pdf-lib`—evidence screenshots and final PDFs never transit the backend server.

### 2. Zero Request-Body & Error Payload Logging
- [x] **Access Logging Disabled in Production Container:** Inspected `api/Dockerfile` (`CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]`).
- [x] **Validation Error Scrubbing:** Inspected `api/app/main.py` (`validation_exception_handler`). Standard FastAPI/Pydantic `422 Unprocessable Entity` responses echo the user's raw `input` payload by default; our custom handler explicitly strips `input` and `ctx`, returning only `{loc, msg, type}`. Verified by `test_analyze_validation_error_does_not_echo_input` in `api/tests/test_api.py`.
- [x] **No `print()` or `logger.info()` on Narrative Text:** Confirmed across `api/app/` that neither raw `narrative` nor `notice_text` is written to `stdout`/`stderr`.

### 3. Personal-Details Filter Before External AI Calls (`T15`)
- [x] **Presidio + Kenyan Custom Recognisers (`api/app/services/redaction.py`):**
  - **Kenyan Phone Numbers (`PHONE`):** Detects `+254...`, `07...`, and `01...` formats (with or without spaces/hyphens).
  - **KRA/NTSA Number Plates (`PLATE`):** Detects Kenyan vehicle & motorcycle registration formats (`KDA 123A`, `KBM 456Z`, `KMFD 123A`).
  - **M-Pesa Transaction Codes (`MPESA_CODE`):** Detects 10-character alphanumeric Safaricom M-Pesa confirmation codes (e.g., `SJK891234P`, `RGH451290M`).
  - **Kenyan Personal Names (`PERSON`):** Combines spaCy NER with `data/kenyan_names.json` (~830 Kenyan surnames/first names + context triggers for ambiguous names like *Mercy*, *Baraka*, *Neema*, *Imani*).
  - **Email Addresses (`EMAIL`):** Standard email pattern recognition.
- [x] **Placeholder Substitution:** Every detected PII span is replaced with a typed placeholder (`<PHONE_1>`, `<PLATE_1>`, `<MPESA_CODE_1>`, `<PERSON_1>`) **before** any text is passed to the AI service for fallback extraction or appeal wording polish.
- [x] **Automated Unit & Benchmark Verification:** Verified by `api/tests/test_redaction.py` and `api/scripts/score_pipeline.py` (`100%` PII recall on synthetic build and held-out sets).

### 4. AI Service Spend Limit & Credential Hygiene (`T05`)
- [x] **Backend-Only Secrets:** AI service credentials (`ANTHROPIC_API_KEY` / `GEMINI_API_KEY`) are read only by the backend (`api/.env`) and are never exposed as `VITE_*` variables in the React PWA.
- [x] **Monthly Spend Cap:** Account billing limit is capped at `USD 10/month` (`T05`) to prevent runaway API charges.
- [x] **Graceful Offline / No-Key Fallback:** Because Case Type Classification (**SetFit `bge-small`**, `T22`), PII Redaction (**Presidio**, `T15`), Fact Extraction (**spaCy `EntityRuler`**, `T16`), Gap Checking (`T24`), and Template Filling (`T18`/`T27`) all run locally without requiring an external LLM call, the core pipeline remains functional even if the AI service quota is reached.

### 5. Repository & Container Hygiene
- [x] **`.gitignore` Verification:** `data/real/`, `.env`, and `*.env.*` are gitignored (`git status --ignored` confirmed).
- [x] **`.dockerignore` Verification:** Excludes `data/real/`, `data/synthetic/`, and environment files so container images only package public policy/checklist JSON files (`data/checklists.json`, `data/policies.json`, `data/templates.json`).
