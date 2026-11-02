# Sauti ya Dere — Sprint 1 Labelling & Extraction Guide (T12)

## 1. Case Classification Taxonomy
- fare_dispute: Discrepancies in trip fare, upfront pricing glitches, unreflected M-Pesa payments.
- passenger_safety: Reports involving verbal abuse, physical altercations, rider intoxication.
- rating_or_cancellation: Account flags/suspensions from low ratings or high cancellation rates.
- fraud_flag: Algorithmic account locks alleging GPS manipulation or account sharing.
- out_of_scope: Queries unrelated to ride-hailing driver disputes.

## 2. Entity Extraction Labels
- DATE: Calendar dates or days of the week (e.g., Tuesday, 14th Oct).
- TIME: Specific time of day or time ranges (e.g., 10:30 PM, morning peak hours).
- LOCATION: Named landmarks, streets, or suburbs in Kenya (e.g., Westlands, Nairobi CBD).
- MONEY: Currency amounts, fares, or M-Pesa transfers (e.g., Ksh 450).
- TRIP_ID: Unique trip identifier codes (e.g., TRIP-88219).

## 3. Evidence Gap Evaluation Rules
- Required Items: Mandatory proof needed for appeal generation.
- Optional Items: Secondary recommended proof.
- Reason Requirement (T07): Every missing required item returns a plain-English explanation.
