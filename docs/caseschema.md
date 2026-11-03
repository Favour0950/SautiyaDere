# Sauti ya Dere — Data Structures & API Contracts

## 1. Ground-Truth Case Record Structure (`data/schema.json`)
This structure is used by `data/generate.py` to create the ~150 synthetic benchmark cases and by evaluation scripts (`models/evaluate.py`).

```json
{
  "$schema": "[http://json-schema.org/draft-07/schema#](http://json-schema.org/draft-07/schema#)",
  "title": "CaseRecord",
  "type": "object",
  "required": ["case_id", "platform", "raw_driver_text", "ground_truth"],
  "properties": {
    "case_id": {
      "type": "string",
      "description": "Unique identifier, e.g. SYN_001 or REAL_012",
      "example": "SYN_001"
    },
    "platform": {
      "type": "string",
      "enum": ["Uber", "Bolt", "Faras"]
    },
    "raw_driver_text": {
      "type": "string",
      "description": "Unstructured narrative from driver intake; includes local transit slang, Sheng, or Swahili."
    },
    "ground_truth": {
      "type": "object",
      "required": ["case_type", "entities", "mandatory_evidence", "applicable_policy"],
      "properties": {
        "case_type": {
          "type": "string",
          "enum": [
            "PASSENGER_SAFETY_COMPLAINT",
            "FARE_PAYMENT_DISPUTE",
            "RATING_CANCELLATION_DISPUTE",
            "ACCOUNT_FRAUD_FLAG"
          ]
        },
        "entities": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["text", "label", "start", "end"],
            "properties": {
              "text": { "type": "string" },
              "label": {
                "type": "string",
                "enum": ["DATE", "TIME", "LOCATION", "MONEY", "TRIP_ID"]
              },
              "start": { "type": "integer" },
              "end": { "type": "integer" }
            }
          }
        },
        "mandatory_evidence": {
          "type": "array",
          "items": { "type": "string" },
          "example": ["MPESA_TRANSACTION_SMS", "TRIP_RECEIPT_SCREENSHOT"]
        },
        "applicable_policy": {
          "type": "string",
          "example": "Bolt Kenya Terms, Clause 4 (Fares & Payment)"
        }
      }
    }
  }
}
2. API Contract: Frontend to Backend Payload (POST /api/analyze)
Request Payload (Sent from PWA)
JSON
{
  "platform": "Bolt",
  "selected_notice_type": "Safety Violation",
  "narrative": "Picked up client around 9:30 PM Tuesday at Westlands. She refused to pay KSh 450 via M-Pesa at the gate...",
  "attached_evidence_keys": ["trip_receipt_screenshot.png"]
}
Response Payload (Returned to PWA)
JSON
{
  "redacted_narrative": "Picked up client around 9:30 PM Tuesday at Westlands. She refused to pay KSh 450 via M-Pesa at the gate...",
  "classification": {
    "predicted_case_type": "FARE_PAYMENT_DISPUTE",
    "confidence_score": 0.89,
    "fallback_threshold": 0.70,
    "requires_user_confirmation": false
  },
  "extracted_entities": {
    "date": "Tuesday",
    "time": "9:30 PM",
    "location": "Westlands",
    "disputed_amount": "KSh 450"
  },
  "evidence_gap_analysis": {
    "readiness_score": 0.50,
    "missing_critical": [
      {
        "item": "MPESA_TRANSACTION_SMS",
        "reason": "Bolt terms Clause 4 require proof of non-payment or reversed transaction."
      }
    ],
    "optional_supporting": ["DASHCAM_AUDIO", "PASSENGER_CHAT_LOG"]
  },
  "appeal_draft": {
    "headline": "Formal Appeal: Contested Fare Dispute on 14/10/2026",
    "statement_body": "To Bolt Support, I am formally appealing the account restriction applied on...",
    "cited_policy": "Bolt Kenya Terms of Service, Clause 4 (Fares and Payment Disputes)"
  }
}