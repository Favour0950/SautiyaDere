# Sauti ya Dere — Architecture & Execution Guide

## 1. System Overview & The Data Science Pipeline
Sauti ya Dere converts unstructured, noisy driver narratives into structured, audit-ready dispute dossiers.

### The Pipeline Flow:
1. **Intake (Frontend PWA):** Driver enters narrative via text or voice.
2. **PII Redaction (Backend Presidio):** Strips Kenyan phone numbers (+254/07...), number plates, and M-Pesa transaction codes to guarantee driver privacy.
3. **Entity Extraction (spaCy EntityRuler):** Extracts temporal facts (dates, times), locations (Nairobi stages/routes), and financial values (KSh).
4. **Dispute Classification:** Classifies the incident into one of 4 core categories:
   - PASSENGER_SAFETY_COMPLAINT
   - FARE_PAYMENT_DISPUTE
   - RATING_CANCELLATION_DISPUTE
   - ACCOUNT_FRAUD_FLAG
5. **Evidence Gap Auditing:** Compares extracted facts and attached files against `checklists.json` and platform policies.
6. **Dossier Compilation:** Generates a structured appeal statement and on-device 1-page PDF dossier (`pdf-lib`).

---

## 2. Machine Learning & Benchmarking Strategy (Colab)
We do not use Reinforcement Learning. Instead, we run a 4-way empirical classifier benchmark on our synthetic dataset (~150 cases) and real evaluation set (17 cases):
- **Model 1:** Regex & Keyword Rules Baseline
- **Model 2:** Zero-Shot NLI (Hugging Face DeBERTa-v3)
- **Model 3:** Few-Shot Fine-Tuned Embedding Model (SetFit / BAAI)
- **Model 4:** Structured LLM Extraction (Google Gemini / Claude API)

Evaluation metrics: Precision, Recall, Macro-F1, and Confusion Matrix (`models/evaluate.py`).

---

## 3. Team Division of Responsibilities
- **Violet (Frontend Lead & Privacy):** PWA setup (React/Vite), UI screens, Dexie.js on-device storage, Presidio PII recognizers, and PDF export.
- **George (Backend & AI Lead):** FastAPI service endpoints, synthetic data generator, spaCy extraction rules, model benchmarking in Colab.
- **Mercy (Domain Knowledge & Testing Lead):** Policy knowledge base (`policies.json`), evidence checklists (`checklists.json`), test set labeling, and TAWU driver testing sessions.

---

## 4. Responsible Computing Safeguards
- **Inversion Test (Mitigating Black-Box Errors):** The UI displays the predicted case category and confidence score, giving the driver an explicit manual override selector and editable entity chips.
- **Dignity & Anti-Retaliation:** Zero centralized database persistence. Cases and screenshots are stored solely in the driver's browser IndexedDB.