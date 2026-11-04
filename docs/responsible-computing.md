# Responsible Computing & Ethical AI Design (`T44`)

**Owner:** Mercy (`@ImpactByMercy`) — Domain Knowledge & Testing Lead  
**Purpose:** Content & talking points for the final presentation deck (`T44` / `T45`)  

---

## Executive Summary (Slide Headline)

> **Sauti ya Dere is built on a "Driver-First, Zero-Surveillance" architecture:** sensitive dispute evidence stays on the driver's own phone (`IndexedDB`), personal identifiers are scrubbed locally using Kenyan-tuned NLP before any AI call, low-confidence predictions defer to the driver's judgment, and every screen sets honest expectations with no false promise of account reinstatement.

---

## Four Pillars of Responsible Computing in Sauti ya Dere

### 1. On-Device Data Sovereignty (`IndexedDB` & Client-Side PDF)
- **The Risk:** Ride-hailing drivers facing deactivation are in a vulnerable economic position. Uploading their trip histories, M-Pesa statements, police abstracts, and chat screenshots to a central cloud database creates a high-value target for data breaches or retaliation, and triggers heavy data-controller obligations under the **Kenya Data Protection Act, 2019**.
- **Our Design Choice:**
  - **Local-First Storage (`T25`):** All driver cases, timeline logs, and evidence screenshots are stored strictly inside the driver's phone browser via **Dexie.js (`IndexedDB`)**.
  - **Stateless Backend (`T10` & `T37`):** The `/api/analyze` endpoint processes text in volatile memory with `--no-access-log` enabled and zero database persistence.
  - **In-Browser PDF Export (`T35`):** Using `pdf-lib`, the 1-page appeal dossier for **TAWU** or **NTSA** is compiled directly on the phone without uploading files to any server.

### 2. Kenyan-Context Personal-Details Filter (`T15`)
- **The Risk:** Off-the-shelf Western PII filters recognise US Social Security Numbers or UK postcodes, but routinely miss **Kenyan KRA number plates** (`KDA 123A`), **Safaricom/Airtel mobile numbers** (`07xx` / `01xx` / `+254`), **10-character M-Pesa transaction codes** (`SJK891234P`), and **Kenyan surnames** (*Wanjiku*, *Ochieng*, *Kamau*, *Atieno*). Sending unredacted driver stories to third-party cloud LLMs violates data minimization principles.
- **Our Design Choice:**
  - **Custom Presidio Recognisers:** Before any text can touch an external AI service, `api/app/services/redaction.py` runs Microsoft Presidio extended with Kenyan regex patterns and an ~830-name Kenyan lexicon (`data/kenyan_names.json`), including context-aware disambiguation for dual-meaning words (*Mercy*, *Baraka*, *Imani*).
  - **Typed Placeholders:** Sensitive spans are replaced with reversible local tokens (`<PHONE_1>`, `<PLATE_1>`, `<MPESA_CODE_1>`, `<PERSON_1>`), ensuring external AI services never see raw personal data.

### 3. Algorithmic Humility & Confidence Threshold Override (`T32` & `T33`)
- **The Risk:** Driver narratives often blend multiple grievances (e.g., an unpaid cash trip that led to a retaliatory 1-star rating and a temporary account hold). If an AI classifier silently forces the wrong category, the driver will collect the wrong evidence checklist and cite the wrong **NTSA LN 120** clause.
- **Our Design Choice:**
  - **Calibrated Confidence Threshold:** While our few-shot **SetFit (`bge-small`)** classifier achieves `95.0%` Macro-F1 on the build set and `97.5%` on the held-out set, we enforce a strict confidence threshold (`0.65`) alongside explicit out-of-scope detection.
  - **Human-in-the-Loop Confirmation (`T33`):** On the *Confirm Case Type* screen, the system always shows its suggested category in plain English and invites the driver to confirm or switch it. Below the confidence threshold, the system refuses to guess and prompts the driver to select their situation directly from the list.

### 4. Honest Framing: No Promise of Reinstatement & Grounded Citations (`T18` & `T44`)
- **The Risk:** Desperate drivers are frequently exploited by informal "account unblocking agents" in Nairobi who charge fees and promise guaranteed reactivation. Equally dangerous are generative AI tools that hallucinate non-existent laws or invent facts not in the driver's story.
- **Our Design Choice:**
  - **Clear Legal & Union Disclaimer:** Both the onboarding flow and the exported PDF explicitly state that *Sauti ya Dere* is a free self-advocacy and evidence-organisation tool—**not legal counsel and not a guarantee of platform reinstatement**.
  - **Zero Hallucinated Facts or Laws (`T18` & `T27`):** Appeal statements are anchored in deterministic templates (`data/templates.json`) citing verified statutory provisions—**NTSA (Transport Network Companies, Owners, Drivers and Passengers) Regulations, 2022 (LN 120 Regs 13, 15 & 18)**, the **Kenya Data Protection Act, 2019 (Sections 26 & 35)**, and **TAWU Grievance Protocols**—only slotting in facts explicitly extracted from the driver's own narrative.

---

## Slide Deck Bullet Summary (Copy-Paste Ready for `T45`)

- **On-Device Privacy (`Dexie.js` + `pdf-lib`):** Zero server storage of cases or screenshots; 1-page PDF dossier is generated 100% on the driver's phone.
- **Kenyan PII Shield (`Presidio`):** Scrubs Kenyan plates (`KDA 123A`), `07xx`/`+254` numbers, M-Pesa codes, and Kenyan names *before* any AI call.
- **Human-in-the-Loop (`SetFit` + Threshold):** Driver always confirms or overrides the predicted case type; low-confidence cases never auto-advance.
- **Grounded & Honest (`NTSA LN 120` + `DPA 2019`):** Cites real Kenyan law and TAWU protocols without inventing facts—and never promises guaranteed reinstatement.
