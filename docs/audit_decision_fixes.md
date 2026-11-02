# Sauti ya Dere — Architectural Decision Fixes & Verification Report

This report documents the architectural fixes applied to the workspace to resolve the discrepancies identified during the read-only architectural audit.

---

## 1. Summary of Changes

| Area | Modified File(s) | Summary of Resolution | Status |
| :--- | :--- | :--- | :--- |
| **1. API Route Prefix** | [`api/app/main.py`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/api/app/main.py) | Mounted `APIRouter(prefix="/api")` with `POST /analyze` so `POST /api/analyze` works; retained `@app.post("/analyze")` aliased to the same handler to prevent 404s on legacy callers. | ✅ Resolved & Tested |
| **2. Pydantic Field Aliases** | [`api/app/schemas.py`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/api/app/schemas.py) | Retained George's core fields (`entities`, `evidence_held`, snake_case types); added `ConfigDict(populate_by_name=True)` and `AliasChoices` for `notice_text` / `selected_notice_type` and `evidence_held` / `attached_evidence_keys`. | ✅ Resolved & Tested |
| **3. Schema Synchronization** | [`data/schema.json`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/schema.json) | Updated `policy_rules` regex pattern to `^[A-Z0-9_-]+$` to allow hyphens (`POL-NTSA-13`); synchronized `evidence_id` enum to include all 19 standard identifiers from `data/checklists.json` while maintaining backward compatibility for legacy worked examples. | ✅ Resolved & Tested |
| **4. Dockerfile Packaging** | [`api/Dockerfile`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/api/Dockerfile) | Added `COPY data ./data` to ensure `checklists.json`, `policies.json`, and `mappings.py` are packaged into the container filesystem for production deployment. | ✅ Resolved |
| **5. Test Suite Verification** | [`api/tests/test_api.py`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/api/tests/test_api.py) | Added automated test `test_api_analyze_prefix_and_field_aliases` covering `/api/analyze` route and aliases; verified all test suites in `api/` and `data/`. | ✅ 100% Passing |

---

## 2. Detailed Implementation Breakdown

### 2.1 Decision 1: API Route Prefix (`api/app/main.py`)
- **Problem**: Frontend documentation in [`docs/caseschema.md`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/docs/caseschema.md) specified `POST /api/analyze`, but FastAPI only listened on `POST /analyze`, returning HTTP 404 for frontend calls.
- **Solution**:
  - Instantiated `api_router = APIRouter(prefix="/api")`.
  - Decorated the `analyze` endpoint with `@api_router.post("/analyze", response_model=AnalyzeResponse)` and kept `@app.post("/analyze", response_model=AnalyzeResponse)`.
  - Mounted the router using `app.include_router(api_router)`.

### 2.2 Decision 2: Pydantic Field Compatibility (`api/app/schemas.py`)
- **Problem**: Frontend sent `selected_notice_type` and `attached_evidence_keys`, whereas the backend expected `notice_text` and `evidence_held`. Pydantic discarded the frontend keys silently.
- **Solution**:
  - Maintained canonical internal field names (`notice_text: str | None`, `evidence_held: list[str]`).
  - Added `model_config = ConfigDict(populate_by_name=True)`.
  - Configured `validation_alias=AliasChoices("notice_text", "selected_notice_type")` for `notice_text`.
  - Configured `validation_alias=AliasChoices("evidence_held", "attached_evidence_keys")` for `evidence_held`.
  - Enables the backend to seamlessly accept either naming convention without breaking existing tests or internal contracts.

### 2.3 Decision 3: Schema Regex & Evidence Enums (`data/schema.json`)
- **Problem**:
  1. Mercy's PR #3 introduced policy IDs containing hyphens (e.g. `POL-NTSA-13`, `POL-BOLT-12`), but `data/schema.json` enforced `^[A-Z0-9_]+$`, failing validation on all synthetic benchmark cases.
  2. Mercy updated `checklists.json` with new evidence identifiers (e.g. `LOCATION_HISTORY_EXPORT`, `DEACTIVATION_NOTICE`), but `data/schema.json` only allowed legacy IDs, causing `validate.py` failures.
- **Solution**:
  - Changed `policy_rules` pattern to `^[A-Z0-9_-]+$`.
  - Synced `evidence_id.enum` to include all 19 standard identifiers from [`data/checklists.json`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/checklists.json):
    - `CHRONOLOGICAL_TRIP_LOG`
    - `DASHCAM_FOOTAGE`
    - `DEACTIVATION_NOTICE`
    - `DRIVER_COUNTER_STATEMENT`
    - `DRIVER_RATING_HISTORY`
    - `GPS_ROUTE_LOG`
    - `INCIDENT_TIMESTAMP_LOG`
    - `IN_APP_CHAT_SCREENSHOT`
    - `LOCATION_HISTORY_EXPORT`
    - `MPESA_STATEMENT`
    - `NATIONAL_ID_DRIVER_LICENSE`
    - `PASSENGER_MPESA_RECEIPT`
    - `POLICE_ABSTRACT`
    - `PSV_BADGE_POLICE_CLEARANCE`
    - `SELFIE_PHOTO`
    - `TRIP_RECEIPT_SCREENSHOT`
    - `VEHICLE_INSPECTION_INSURANCE`
    - `VEHICLE_PHOTOS`
    - `WITNESS_STATEMENT`
  - Preserved legacy identifiers (`SUSPENSION_NOTICE`, `MPESA_RECEIPT`, `TRIP_RECEIPT`, `ROUTE_MAP`, `IN_APP_CHAT`, `RATING_SCREENSHOT`, `CANCELLED_TRIPS_LIST`, `CANCEL_REQUEST_SCREENSHOT`, `TRIP_HISTORY`, `SOLE_USE_PROOF`, `DEVICE_GPS_DETAILS`, `WITNESS_NAMES`) so worked examples in [`data/examples/`](file:///C:/Users/Violet/Desktop/github projects/SautiyaDere/data/examples/) remain 100% valid.

### 2.4 Decision 4: Dockerfile Asset Packaging (`api/Dockerfile`)
- **Problem**: In production on Cloud Run, the container copied only `app/`, omitting `data/`. Any runtime lookup for checklists or policies would fail with `FileNotFoundError`.
- **Solution**:
  - Added `COPY data ./data` immediately after `COPY app ./app`.

---

## 3. Verification & Test Execution Results

### 3.1 Backend API Tests (`api/`)
Command executed:
```bash
cd api
python -m pytest
```
Output:
```
============================= test session starts =============================
platform win32 -- Python 3.14.6, pytest-9.1.1, pluggy-1.7.0
rootdir: C:\Users\Violet\Desktop\github projects\SautiyaDere\api
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.16.0
collected 7 items

tests\test_api.py .......                                                [100%]

============================== 7 passed in 3.48s ==============================
```

### 3.2 Data Validation & Unit Tests (`data/`)
Command executed:
```bash
cd data
python -m pytest
```
Output:
```
============================= test session starts =============================
platform win32 -- Python 3.14.6, pytest-9.1.1, pluggy-1.7.0
rootdir: C:\Users\Violet\Desktop\github projects\SautiyaDere\data
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.16.0
collected 11 items

tests\test_data.py ...........                                           [100%]

============================= 11 passed in 0.52s ==============================
```

### 3.3 Synthetic Case & Example Records Validation
Command executed:
```bash
cd data
python validate.py synthetic/cases.jsonl
python validate.py examples/
```
Output:
```
150/150 records valid
3/3 records valid
```
Exit code: `0`.
