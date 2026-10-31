"""
Data alignment mappings bridging legacy PR #2 keys with PR #3 authoritative NTSA/TAWU schemas.
"""

# Map legacy/backend category keys to standardized PR #3 uppercase enums
CATEGORY_MAPPINGS = {
    "fare_dispute": "PAYMENT_EARNINGS_HOLD",
    "fraud_flag": "FRAUD_ACCUSATION",
    "passenger_safety": "SAFETY_INCIDENT",
    "rating_or_cancellation": "CONDUCT_COMPLAINT",
    "account_verification": "ACCOUNT_INTEGRITY",
    "out_of_scope": "OUT_OF_SCOPE"
}

# Map backend rule ID stubs to PR #3 POL-* policy namespace
RULE_ID_MAPPINGS = {
    "LN120_REG15_1": "POL-NTSA-15",
    "LN120_REG18": "POL-NTSA-18",
    "LN120_REG21": "POL-NTSA-21",
    "BOLT_KE_CL12": "POL-BOLT-12",
    "UBER_KE_FRAUD": "POL-UBER-01",
    "TAWU_GRIEVANCE_04": "POL-TAWU-01"
}

def normalize_category(category_str: str) -> str:
    """Returns the standardized PR #3 category enum."""
    return CATEGORY_MAPPINGS.get(category_str.lower(), category_str.upper())

def normalize_rule_id(rule_id_str: str) -> str:
    """Returns the standardized POL-* rule ID."""
    return RULE_ID_MAPPINGS.get(rule_id_str, rule_id_str)
