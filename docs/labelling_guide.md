# Sauti ya Dere — Annotation & Entity Extraction Labelling Guide (T12)

This document establishes the official labeling taxonomy, named entity extraction guidelines, and data standards for annotating driver grievance text within the **Sauti ya Dere** platform.

---

## 1. Primary Classification Taxonomy

Every input statement must be classified into exactly **one** of the following 5 categories:

1. **`PAYMENT_EARNINGS_HOLD`**: M-Pesa fare discrepancies, uncredited promotion balances, off-app cash disputes, or wallet withdrawal blocks.
2. **`FRAUD_ACCUSATION`**: Algorithmic deactivations flagging GPS route manipulation, fake trips, or promo abuse.
3. **`SAFETY_INCIDENT`**: Vehicle collisions, road altercations, rider injuries, or alleged driving under the influence.
4. **`CONDUCT_COMPLAINT`**: Customer verbal arguments, false low-rating reports, or alleged rider harassment.
5. **`ACCOUNT_INTEGRITY`**: Failed real-time selfie checks, expired NTSA inspection stickers, PSV badge delays, or commercial insurance audits.

---

## 2. Named Entity Extraction (NER) Taxonomy

Annotators and models must extract four core entity types from the driver's narrative:

| Entity Label | Description                            | Examples                                                 |
| :----------- | :------------------------------------- | :------------------------------------------------------- |
| `TRIP_ID`    | Platform trip or order reference codes | `UBR-883921`, `BLT-99201`, `Trip #102`                   |
| `MONEY`      | Currency values in KSh or USD          | `KSh 850`, `850/=`, `KES 1,200`, `500 shillings`         |
| `LOCATION`   | Pickup, dropoff, or incident locations | `Westlands`, `Kilimani`, `JKIA Airport`, `Thika Road`    |
| `DATE_TIME`  | Timestamps, days, or relative times    | `Yesterday at 8 PM`, `28th Oct`, `14:30`, `this morning` |

---

## 3. Reference Annotation Example

### Raw Driver Input:

> _"Yesterday around 8:30 PM I picked up a passenger in Westlands heading to Kilimani on Bolt trip BLT-48102. The fare was KSh 950 but the app gave me KSh 450. When I asked the passenger, they refused to pay the remaining KSh 500 and reported me."_

### Standardized JSON Output:

```json
{
  "category": "PAYMENT_EARNINGS_HOLD",
  "entities": {
    "TRIP_ID": "BLT-48102",
    "MONEY": ["KSh 950", "KSh 450", "KSh 500"],
    "LOCATION": ["Westlands", "Kilimani"],
    "DATE_TIME": ["Yesterday around 8:30 PM"]
  }
}
```
