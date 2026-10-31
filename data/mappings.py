"""
Data alignment mappings bridging PR #2 generator/API keys with PR #3 authoritative NTSA/TAWU schemas.
"""

CATEGORY_MAPPINGS = {
    "fare_dispute": "PAYMENT_EARNINGS_HOLD",
    "fraud_flag": "FRAUD_ACCUSATION",
    "passenger_safety": "SAFETY_INCIDENT",
    "rating_or_cancellation": "CONDUCT_COMPLAINT",
    "account_verification": "ACCOUNT_INTEGRITY",
    "out_of_scope": "OUT_OF_SCOPE"
}

RULE_ID_MAPPINGS = {
    "LN120_REG15_1": "POL-NTSA-15",
    "LN120_REG18_1": "POL-NTSA-18",
    "LN120_REG18": "POL-NTSA-18",
    "LN120_REG21": "POL-NTSA-21",
    "LN120_REG13_1_B": "POL-NTSA-13",
    "BOLT_KE_CL12": "POL-BOLT-12",
    "BOLT_KE_CL13": "POL-BOLT-13",
    "BOLT_KE_CL16_8": "POL-BOLT-16",
    "UBER_KE_DEACTIVATION_REVIEW": "POL-UBER-01",
    "UBER_KE_FRAUD": "POL-UBER-01",
    "FARAS_PROVIDER_TERMS": "POL-FARAS-01",
    "DPA_S26_S35": "POL-DPA-26",
    "TAWU_GRIEVANCE_04": "POL-TAWU-01"
}

EVIDENCE_ID_MAPPINGS = {
    "SUSPENSION_NOTICE": "DEACTIVATION_NOTICE",
    "MPESA_RECEIPT": "MPESA_STATEMENT",
    "TRIP_RECEIPT": "TRIP_RECEIPT_SCREENSHOT",
    "DASHCAM_FOOTAGE": "DASHCAM_FOOTAGE",
    "POLICE_ABSTRACT": "POLICE_ABSTRACT",
    "ROUTE_MAP": "GPS_ROUTE_LOG",
    "IN_APP_CHAT": "IN_APP_CHAT_SCREENSHOT",
    "RATING_SCREENSHOT": "DRIVER_RATING_HISTORY",
    "CANCELLED_TRIPS_LIST": "CHRONOLOGICAL_TRIP_LOG",
    "CANCEL_REQUEST_SCREENSHOT": "IN_APP_CHAT_SCREENSHOT",
    "TRIP_HISTORY": "CHRONOLOGICAL_TRIP_LOG",
    "SOLE_USE_PROOF": "NATIONAL_ID_DRIVER_LICENSE",
    "DEVICE_GPS_DETAILS": "LOCATION_HISTORY_EXPORT",
    "WITNESS_NAMES": "WITNESS_STATEMENT"
}

def normalize_category(category_str: str) -> str:
    clean_str = category_str.lower().strip()
    return CATEGORY_MAPPINGS.get(clean_str, category_str.upper())

def normalize_rule_id(rule_id_str: str) -> str:
    return RULE_ID_MAPPINGS.get(rule_id_str, rule_id_str)

def normalize_evidence_id(evidence_str: str) -> str:
    return EVIDENCE_ID_MAPPINGS.get(evidence_str, evidence_str)
