# Sauti ya Dere — Labelling & Extraction Guide (T12)

This guide defines how to label **case types**, **extracted entities**, **personal details (PII)**, **missing evidence**, and **policy rules** for synthetic (`T14`) and real (`T17`) driver cases in `data/schema.json` format.

---

## 1. Case Classification Taxonomy (`labels.case_type`)

Every case record is assigned **one** of five values:

| `case_type` | Checklist Key (`data/checklists.json`) | When to Use |
| :--- | :--- | :--- |
| `fare_dispute` | `PAYMENT_EARNINGS_HOLD` | Unpaid or underpaid cash/M-Pesa fares, upfront fare recalculation errors, or wallet holds. |
| `passenger_safety` | `SAFETY_INCIDENT` | Allegations of unsafe driving, verbal/physical altercations, intoxicated riders, or crashes. |
| `rating_or_cancellation` | `CONDUCT_COMPLAINT` | Deactivation or restriction due to low star ratings, rider-requested cancellations, or wrong pickup pins. |
| `fraud_flag` | `FRAUD_ACCUSATION` | Automated/algorithmic blocks alleging fake GPS, ghost trips, promo abuse, or account sharing. |
| `out_of_scope` | N/A (`[]` required) | Queries unrelated to platform account suspensions or fare disputes (e.g., car loans, NTSA sticker renewal how-tos). |

---

## 2. Span Extraction Labels (`labels.entities` & `labels.pii`)

Every span must record exact character offsets (`start`, `end`) such that `narrative[start:end] == text`.

### Fact Entities (`labels.entities`)
- **`DATE`**: Calendar dates, days of the week, or Swahili/English relative dates (`"Sunday 11th"`, `"Wednesday 7 October"`, `"jana"`, `"juzi"`, `"last week"`).
- **`TIME`**: Clock times or Swahili/English time expressions (`"8:40pm"`, `"5.30pm"`, `"saa nne asubuhi"`, `"saa tatu usiku"`).
- **`LOCATION`**: Nairobi stages, estates, roads, or landmarks (`"Westlands"`, `"Thika Road"`, `"JKIA"`, `"CBD"`, `"Roysambu"`, `"Ngong Road"`).
- **`MONEY`**: Fare or M-Pesa amounts in KSh/KES/bob (`"KSh 1,700"`, `"KES 450"`, `"bob 200"`, `"Ksh1900"`).
- **`TRIP_ID`**: Short alphanumeric trip reference codes (`"F5UN"`, `"9X2K"`).

### Personal Details (`labels.pii` — for evaluating the T15 redaction filter)
- **`PERSON`**: Driver or rider names (`"Wanjiku"`, `"Kimani"`, `"Atieno"`).
- **`PHONE`**: Kenyan phone numbers (`"0742 784 980"`, `"+254707141633"`).
- **`PLATE`**: Kenyan vehicle registration plates (`"KDC 638T"`, `"KDF 516R"`).
- **`MPESA_CODE`**: 10-character M-Pesa transaction codes (`"SDFT43742T"`, `"SMQ9C1E5UV"`).
- **`ID_NUMBER`** / **`EMAIL`** / **`ADDRESS`**: 7–8 digit Kenyan ID numbers, email addresses, or home addresses.

---

## 3. Missing Evidence (`labels.evidence_missing`)

Compare `evidence_held` against the **`required`** items for that `case_type` in `data/checklists.json`:
- **`fare_dispute` required:** `["TRIP_RECEIPT_SCREENSHOT", "MPESA_STATEMENT"]`
- **`passenger_safety` required:** `["INCIDENT_TIMESTAMP_LOG", "POLICE_ABSTRACT"]`
- **`rating_or_cancellation` required:** `["IN_APP_CHAT_SCREENSHOT", "DRIVER_COUNTER_STATEMENT"]`
- **`fraud_flag` required:** `["DEACTIVATION_NOTICE", "CHRONOLOGICAL_TRIP_LOG"]`
- **`out_of_scope` required:** `[]`

Any required item **not** present in `evidence_held` must be listed in `labels.evidence_missing`. When the API runs (`T24`), each missing item returns its plain-English `reason` from `data/checklists.json`.

---

## 4. Worked Examples per Case Type

### Example A — `fare_dispute`
- **Platform:** `"Faras"`
- **Narrative:** `"cash trip Wednesday 7 October from CBD. fare was KES 1,750 the guy gave me 500 and ran into the gate. then he reported ME that i overcharged. trip id F5UN The passenger name was Kimani."`
- **Evidence Held:** `["TRIP_RECEIPT_SCREENSHOT"]`
```json
{
  "case_type": "fare_dispute",
  "entities": [
    {"text": "Wednesday 7 October", "label": "DATE", "start": 10, "end": 29},
    {"text": "CBD", "label": "LOCATION", "start": 35, "end": 38},
    {"text": "KES 1,750", "label": "MONEY", "start": 49, "end": 58},
    {"text": "500", "label": "MONEY", "start": 75, "end": 78},
    {"text": "F5UN", "label": "TRIP_ID", "start": 150, "end": 154}
  ],
  "pii": [
    {"text": "Kimani", "label": "PERSON", "start": 178, "end": 184}
  ],
  "evidence_missing": ["MPESA_STATEMENT"],
  "policy_rules": ["POL-NTSA-13", "POL-NTSA-15", "POL-NTSA-18", "POL-NTSA-21", "POL-DPA-26", "POL-TAWU-01", "POL-FARAS-01"]
}
```

### Example B — `passenger_safety`
- **Platform:** `"Bolt"`
- **Narrative:** `"On Sunday 11th around 5.30pm I picked a passenger at Westlands going to Thika Road. She did not like the route the app gave and started shouting. Her number is 0742 784 980 if you need to call."`
- **Evidence Held:** `["POLICE_ABSTRACT", "DASHCAM_FOOTAGE"]`
```json
{
  "case_type": "passenger_safety",
  "entities": [
    {"text": "Sunday 11th", "label": "DATE", "start": 3, "end": 14},
    {"text": "5.30pm", "label": "TIME", "start": 22, "end": 28},
    {"text": "Westlands", "label": "LOCATION", "start": 53, "end": 62},
    {"text": "Thika Road", "label": "LOCATION", "start": 72, "end": 82}
  ],
  "pii": [
    {"text": "0742 784 980", "label": "PHONE", "start": 160, "end": 172}
  ],
  "evidence_missing": ["INCIDENT_TIMESTAMP_LOG"],
  "policy_rules": ["POL-NTSA-13", "POL-NTSA-15", "POL-NTSA-18", "POL-NTSA-21", "POL-DPA-26", "POL-TAWU-01", "POL-BOLT-12", "POL-BOLT-13", "POL-BOLT-16"]
}
```

### Example C — `rating_or_cancellation`
- **Platform:** `"Little"`
- **Narrative:** `"wameniblock juu ya cancellation rate. pin za Utawala huwa wrong kila mara, unafika unapata mteja yuko Karen. jana nilicancel mbili juu ya hiyo. The M-Pesa code was SDFT43742T."`
- **Evidence Held:** `[]`
```json
{
  "case_type": "rating_or_cancellation",
  "entities": [
    {"text": "Utawala", "label": "LOCATION", "start": 45, "end": 52},
    {"text": "Karen", "label": "LOCATION", "start": 102, "end": 107},
    {"text": "jana", "label": "DATE", "start": 109, "end": 113}
  ],
  "pii": [
    {"text": "SDFT43742T", "label": "MPESA_CODE", "start": 164, "end": 174}
  ],
  "evidence_missing": ["IN_APP_CHAT_SCREENSHOT", "DRIVER_COUNTER_STATEMENT"],
  "policy_rules": ["POL-NTSA-13", "POL-NTSA-15", "POL-NTSA-18", "POL-NTSA-21", "POL-DPA-26", "POL-TAWU-01", "POL-LITTLE-01"]
}
```

### Example D — `fraud_flag`
- **Platform:** `"Bolt"`
- **Narrative:** `"eti nilikuwa na fake trips! mimi ndiye natumia account peke yangu. Sunday 11th nilifanya trips nne Ngong Road na wateja walilipa KSh 800 kwa M-Pesa. Wanadai ni fraud. Gari yangu ni KDC 638T, rider alikuwa Wanjiku."`
- **Evidence Held:** `["DEACTIVATION_NOTICE"]`
```json
{
  "case_type": "fraud_flag",
  "entities": [
    {"text": "Sunday 11th", "label": "DATE", "start": 67, "end": 78},
    {"text": "Ngong Road", "label": "LOCATION", "start": 99, "end": 109},
    {"text": "KSh 800", "label": "MONEY", "start": 129, "end": 136}
  ],
  "pii": [
    {"text": "KDC 638T", "label": "PLATE", "start": 181, "end": 189},
    {"text": "Wanjiku", "label": "PERSON", "start": 205, "end": 212}
  ],
  "evidence_missing": ["CHRONOLOGICAL_TRIP_LOG"],
  "policy_rules": ["POL-NTSA-13", "POL-NTSA-15", "POL-NTSA-18", "POL-NTSA-21", "POL-DPA-26", "POL-TAWU-01", "POL-BOLT-12", "POL-BOLT-13", "POL-BOLT-16"]
}
```
