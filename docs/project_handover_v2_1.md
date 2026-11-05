# Sauti ya Dere — Project Handover & Architecture Status (v2.1)

**Date**: 05 Nov 2026  
**Repository**: `c:\Users\Violet\Desktop\github projects\SautiyaDere`  
**Active Branch**: `dev-violet`  
**Deployments**:
- **Frontend (`web/`)**: Deployed on Vercel
- **Backend (`api/`)**: Deployed on Render (`https://sautiyaderebackend.onrender.com`)

---

## 1. Key Components & Implementation Details

### Model Configuration
- **Model**: `gemini-3.8-flash`
- Configured in:
  - `web/src/services/dereBot.ts` (Conversational intake, dynamic extraction, appeal affidavit synthesis)
  - `web/src/services/visionOcr.ts` (Document and screenshot OCR fact extraction)

### Backend T31 Pipeline (`api/app/main.py` & `api/app/services/classifier.py`)
- Removed the empty `AnalyzeResponse()` stub.
- Live 5-stage pipeline active:
  1. **Redaction**: Client and server PII scrubbers (Kenyan phone numbers, vehicle registration numbers, national IDs).
  2. **Fact Extraction**: Regex + NER for Date, Time, Route/Locations, Fare, Allegation.
  3. **Dispute Classification**: Fine-tuned SetFit model (`sautiyadere/sauti-dispute-classifier`) with heuristic fallback and real probability calculations.
  4. **Evidence Gap Audit**: Case-specific required evidence checklist based on NTSA categories.
  5. **Appeal Structuring**: Formatted legal brief output citing NTSA Legal Notice 120 and KDPA 2019.

### Conversational Intake (Screen 3 `DereBot`)
- **Bilingual Toggle**: Explicit `[ English | Kiswahili ]` toggle (Sheng removed per design).
- **Collapsible Facts Bar**: 1-line badge `🎯 N Key Facts Captured [View Details ▼]` prevents UI overflow.
- **Continuous Conversation**: DereBot answers driver questions (privacy, evidence, police/OB numbers, platform policies) continuously even after facts are captured.
- **On-Device PII Scrubbing**: `scrubPII` strips sensitive identifiers before sending text to Gemini.
- **Legal Affidavit Synthesizer (`synthesizeAppealStatement`)**:
  - Generates a formal, first-person legal rebuttal statement.
  - Generates up to 2048 tokens to accommodate Gemini 3.8 Flash's thinking tokens.
  - Strips markdown formatting, outlines, and drafting notes (e.g., `Sentence Formulation`).
  - Fallback is guaranteed if the API response is sparse or malformed.

### Evidence Audit (Screen 5)
- Plain language title: **"Supporting Evidence & Proof"**.
- Seamless carry-forward: Uploaded documents and pasted notice text from Screen 2 are automatically included in `evidenceHeld`.
- No `[Object Object]` display bugs.

### Appeal Preview & PDF Dossier (Screen 6 & `pdfGenerator.js`)
- **Web / Email Letter**: Full formal administrative appeal brief citing NTSA LN 120 Reg. 15 and KDPA 2019 Sec. 26.
- **1-Page A4 PDF (`generateAppealPdf`)**:
  - Section 1: Driver & Platform Identity
  - Section 2: Statutory Due Process Framework
  - Section 3: Chronological Incident Facts
  - Section 4: Formal Statement of Rebuttal & Reinstatement Demand (contains full synthesized statement + statutory 30-day demand without repeating document headers)
  - Section 5: Supporting Evidence Checklist
  - Section 6: Driver Declaration & Signature
- **Direct Platform Email Button**: Formatted `mailto:` links with clean, safe URI length to prevent operating system or browser truncation.

### Case Log & Statutory Timeline (Screen 7)
- Back button `←` returns to Screen 6 without losing context.
- **"Mark as Submitted to Platform Today"** starts the 30-day statutory countdown and saves to local IndexedDB.
- **Interactive Dispute Status Selector**:
  - `Awaiting Platform Reply`: Displays real-time NTSA countdown.
  - `Platform Reinstated Account`: Archives as resolved/closed with a celebration notice.
  - `Platform Rejected Appeal`: Unlocks 1-tap trade union conciliation escalation to TAWU-Kenya (`disputes@tawu.or.ke`).
- Updates persist directly to IndexedDB via `updateCaseStatus(id, status)`.

### Desktop Scaling & Driver Rights Guide
- Responsive fluid dashboard layout (`max-w-6xl` / `max-w-7xl` on desktop).
- **"📖 Driver Rights & DereBot Guide"** modal available from the sidebar and mobile drawer. Explains:
  - How DereBot works and its dispute classifier logic.
  - The Dignity Principle (100% on-device Dexie.js storage, PII scrubbing).
  - Driver rights under NTSA LN 120 and KDPA 2019.
  - TAWU-Kenya conciliation procedures.
