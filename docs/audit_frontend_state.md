# Frontend State & Contract Audit Report

**Date**: 2026-11-04  
**Target Module**: `web/src/components/wizard/SautiWizard.tsx` (and related modules `web/src/config.js`, `web/src/utils/pdfGenerator.js`)  
**Scope**: Static inspection of mock strings, API endpoints, backend response contracts, regex extraction logic, and phone input validation.  
**Action**: Static inspection only; no code files modified.

---

## 1. Executive Summary

A comprehensive static analysis of `web/src/components/wizard/SautiWizard.tsx` and related frontend modules was performed to assess data flow integrity, API contracts, entity extraction behavior, and user input validation.

Key findings:
1. **Mock Strings & Fallbacks**: Hardcoded sample strings ("14 May", "KSh 1,250", "Westlands to JKIA", "Mwangi", "0712 345 678") exist in three distinct roles: (a) UI input placeholders, (b) simulated speech-to-text in the mic button handler, and (c) default fallback values for null profile fields in appeal preview and PDF generation.
2. **API Endpoint Resolution**: `handleAnalyze()` resolves endpoints sequentially starting with `getApiUrl('/api/analyze')` (defaulting to Render `https://sautiyaderebackend.onrender.com/api/analyze`), followed by `/api/analyze` and `http://localhost:8000/api/analyze`.
3. **API Contract Mismatch & Control Flow Short-Circuit**: The backend `/api/analyze` endpoint currently returns a 200 OK stub with `entities: []`. Because `resData` is truthy, the client binds `entities = resData.entities` (`[]`) and skips the `else` branch containing `extractFallbackFacts()`.
4. **Regex Limitations in `extractFallbackFacts`**: When offline, the regex parser fails on lowercase routes ("from westlands to jkia"), numeric dates ("14/05/2026"), and plain currency amounts ("fare of 1200").
5. **Unguarded Phone Input**: Screen 1 (`Profile`) provides zero validation for phone numbers; the "Save & Continue" button is enabled for empty, short, or invalid inputs.

---

## 2. Hardcoded Strings & Mock Fallbacks Scan

The static scan identified the following occurrences across `SautiWizard.tsx` and `pdfGenerator.js`:

| Line(s) | Category | Code Snippet | Purpose / Risk |
| :--- | :--- | :--- | :--- |
| **690–698** | **Mock Audio Injection** | `const sampleStatement = noticeText.includes('safety') ? 'On 14 May around 4:30pm from Westlands to JKIA...' : 'On 14 May around 4:30pm from Westlands to JKIA, the passenger said the fare of KSh 1,250...'` | `handleMicClick()` simulates voice transcription by injecting hardcoded trip text containing static dates, times, routes, and fares into `driverInput`. |
| **121, 133, 144, 156** | **UI Placeholders** | `placeholder: 'e.g., On 14 May around 4:30pm from Westlands to JKIA...'` | Context-aware guidance examples in `getContextProbing()`. Benign UI hints, but reinforces test scenario bias. |
| **1071** | **UI Placeholder** | `placeholder="Fact detail (e.g., 14 May, 4:30 PM, KSh 1,250)..."` | Screen 4 manual entity addition placeholder. Benign UI hint. |
| **513, 522** | **Profile Placeholders** | `placeholder="e.g. Mwangi"`, `placeholder="e.g. 0712 345 678..."` | Screen 1 driver profile setup placeholders. |
| **1258, 2042** | **Data Fallback** | `driverName: profile.name \|\| 'Mwangi'` | Screen 6 appeal body formatting and IndexedDB case persistence default to `'Mwangi'` if the driver profile name is blank. |
| **1584, 1597** | **Data Fallback** | `<b>{profile.name \|\| 'Mwangi'}</b>`, `<p>{profile.phone \|\| '0712 345 678'}</p>` | Drawer component user summary displays `'Mwangi'` and `'0712 345 678'` if profile fields are empty. |
| **1545, 1646** | **Hardcoded Hotline** | `Call TAWU Dispute Hotline (+254 700 000 000)` | Static contact phone number for Transport & Allied Workers Union. |
| **pdfGenerator.js: 122** | **PDF Default** | `driverName = 'Mwangi'` | Default parameter in `formatFormalAppealBody()` when invoked without a name. |

---

## 3. Backend API Contract & Endpoint Resolution

### 3.1 Endpoint Query Sequence in `handleAnalyze()`
In `web/src/components/wizard/SautiWizard.tsx` (lines 1912–1933):
```typescript
const configuredEndpoint = getApiUrl('/api/analyze')
const endpoints = Array.from(new Set([
  configuredEndpoint,
  '/api/analyze',
  'http://localhost:8000/api/analyze'
]))
```
1. **`getApiUrl('/api/analyze')`**: Read from `web/src/config.js`. If `import.meta.env.VITE_API_BASE_URL` is undefined, it defaults to:
   `https://sautiyaderebackend.onrender.com/api/analyze`
2. **`/api/analyze`**: Relative path against the hosting origin (useful when served behind a reverse proxy or local dev proxy).
3. **`http://localhost:8000/api/analyze`**: Direct fallback to a local FastAPI Uvicorn instance.

Requests iterate through `endpoints` using `for (const url of endpoints)`. The first endpoint returning `res.ok` (HTTP 200–299) parses JSON into `resData` and breaks out of the loop.

### 3.2 Expected vs Actual Backend Response Contract

The frontend `handleAnalyze()` expects the following response schema:
```typescript
{
  classification?: {
    case_type?: string,
    confidence?: number,
    needs_confirmation?: boolean
  },
  entities?: Array<{ label: string, text: string }>,
  evidence?: {
    readiness?: number,
    missing?: Array<{ id: string, reason: string }>,
    optional?: string[]
  },
  appeal?: {
    headline?: string,
    body?: string,
    policy_rules?: string[]
  }
}
```

#### Contract Alignment:
- **Nested vs Flat Keys**: The frontend expects nested objects (`resData.classification.case_type`, `resData.entities`, `resData.evidence.readiness`). It does **not** recognize flat aliases (e.g., `res.predicted_case_type` or `res.extracted_entities`).
- **Entity Labels**: The backend schema (`api/app/schemas.py`) defines `EntityLabel = Literal["DATE", "TIME", "LOCATION", "MONEY", "TRIP_ID"]`. The frontend accepts `label` and `text`, but the fallback regex emits `"FARE"` instead of `"MONEY"`.
- **Backend Stub State**: In `api/app/main.py` (lines 58–61), the `/analyze` route is currently an unjoined pipeline returning `AnalyzeResponse()`:
  ```python
  @api_router.post("/analyze", response_model=AnalyzeResponse)
  @app.post("/analyze", response_model=AnalyzeResponse)
  def analyze(body: AnalyzeRequest) -> AnalyzeResponse:
      return AnalyzeResponse()
  ```
  `AnalyzeResponse()` serializes to:
  ```json
  {
    "stub": true,
    "redacted_narrative": null,
    "classification": { "case_type": null, "confidence": null, "confidence_threshold": 0.7, "needs_confirmation": true },
    "entities": [],
    "evidence": { "readiness": null, "missing": [], "optional": [] },
    "appeal": { "headline": null, "body": null, "policy_rules": [] }
  }
  ```

---

## 4. Root Cause: Why Client-Side Extraction Failed to Populate Screen 4

The failure of entity extraction on Screen 4 stems from two interacting factors:

### Cause A: Control Flow Short-Circuit (Primary Failure Mode)
In `handleAnalyze()`:
```typescript
if (resData) {
  setAnalysis({
    classification: { ... },
    entities: Array.isArray(resData.entities) ? resData.entities : [],
    ...
  })
} else {
  // Client-Side Regex Fallback Extraction
  const fallbackEntities = extractFallbackFacts(textToAnalyze)
  ...
}
```
1. When either the Render backend or local backend is active, it returns HTTP 200 with `resData.entities = []`.
2. Because `resData` is non-null, the `if (resData)` condition evaluates to **true**.
3. `analysis.entities` is assigned `resData.entities` (an empty array `[]`).
4. The `else` branch—which houses `extractFallbackFacts(textToAnalyze)`—is **never executed**.
5. As a consequence, Screen 4 evaluates `analysis.entities.length === 0` and renders the empty state prompt: *"No trip facts (dates, times, locations) detected in your statement."*

### Cause B: Fragility of Client-Side Regex (`extractFallbackFacts`)
When network requests fail and the `else` block executes, `extractFallbackFacts()` fails on natural driver narratives due to restrictive regex patterns:
1. **Route PascalCase Requirement**:
   `/\b(?:from|to|at|in|near)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/g`
   - Mobile users frequently type lowercase text (e.g., `"from westlands to sarit"`, `"at village market"`). Because the capture group strictly matches `[A-Z]`, lowercase destinations are omitted.
2. **Numeric Date Omission**:
   `dateRegex` only matches written month names (e.g., `"14 May"`, `"May 14"`). Standard Kenyan numeric formats (`"14/05/2026"`, `"14-05"`, `"14.5"`) are ignored.
3. **Rigid Currency Matching**:
   `fareRegex = /(?:KSh|KES)\s*\d+(?:,\d+)?|\b\d+\s*bob\b/gi`
   - Statements like `"fare was 1200"` or `"paid 800 via mpesa"` do not match because neither `"KSh"`, `"KES"`, nor `"bob"` is prefixed/suffixed.

---

## 5. Phone Number Validation Audit (Screen 1)

Inspecting Screen 1 (`Profile` component, lines 462–545):

```tsx
<label className="flex flex-col gap-2 text-sm font-bold">
  Phone number
  <input
    value={phone}
    onChange={(e) => setPhone(e.target.value)}
    className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-[#1E5E3A]"
    placeholder="e.g. 0712 345 678 (for timeline reminders)"
  />
</label>
...
<div className="mt-auto">
  <Btn onClick={handleSubmit} disabled={saving}>
    {saving ? 'Saving...' : 'Save & Continue'} {!saving && <ArrowRight />}
  </Btn>
</div>
```

### Assessment:
1. **Validation Checks**:
   - There is **no phone number validation**.
   - Input type is standard text (not `type="tel"`).
   - No pattern matching (e.g., `^(?:\+254|0)[17]\d{8}$`), length constraints (`minLength`/`maxLength`), or character filtering.
2. **Save Button Guard**:
   - The "Save & Continue" button is **NOT guarded** against short, malformed, or blank phone numbers.
   - It is only disabled while the asynchronous save is pending (`disabled={saving}`).
   - An empty string `""`, single digit `"1"`, or letters `"abc"` are accepted and persisted to IndexedDB without warning.
3. **Downstream Impact**:
   - The Africa's Talking SMS reminder service (`api/app/services/sms.py`) runs `normalize_kenyan_phone(raw)`. If an invalid phone number from the profile is used, it throws a `ValueError("Invalid Kenyan phone number format")`, causing timeline SMS notifications to fail.

---

## 6. Recommendations (For Next Implementation Phase)

1. **Fallback Hybridization in `handleAnalyze()`**:
   If the backend responds with `resData.entities` as an empty array or `resData.stub === true`, run `extractFallbackFacts(textToAnalyze)` as a client-side enhancer so that facts are always surfaced on Screen 4.
2. **Regex Robustness**:
   - Update `routeRegex` with case-insensitivity (`/i`) while filtering out common stopwords.
   - Add numeric date patterns (`\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b`).
   - Add label alignment: align `"FARE"` with backend `"MONEY"` or support both.
3. **Voice Input Mock Decoupling**:
   Replace static "14 May" mock audio text in `handleMicClick` with Web Speech API speech recognition (or prompt the user for input if unsupported).
4. **Phone Input Validation Guard**:
   In Screen 1 (`Profile`), add Kenyan phone number format validation (`/^(?:\+?254|0)?[17]\d{8}$/`), format hints, and guard the "Save & Continue" button (`disabled={saving || !isValidPhone(phone)}`).
