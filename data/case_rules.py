"""Case types, evidence checklists and policy rule IDs shared by generate.py and validate.py.

DRAFT. Taken from the Data Plan starting lists. Mercy finalises the checklists in
data/checklists.json (T07) and the rule IDs in data/policies.json (T08). When those
files exist, load_checklists() / policy IDs should be read from them instead.
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent

IN_SCOPE_TYPES = ["passenger_safety", "fare_dispute", "rating_or_cancellation", "fraud_flag"]
CASE_TYPES = IN_SCOPE_TYPES + ["out_of_scope"]

# Required items drive `evidence_missing`; optional items may appear in `evidence_held`
# but are never flagged as missing.
CHECKLISTS: dict[str, dict[str, list[str]]] = {
    "passenger_safety": {
        "required": ["SUSPENSION_NOTICE", "TRIP_RECEIPT", "ROUTE_MAP", "IN_APP_CHAT"],
        "optional": ["DASHCAM_FOOTAGE", "WITNESS_NAMES", "POLICE_ABSTRACT"],
    },
    "fare_dispute": {
        "required": ["SUSPENSION_NOTICE", "TRIP_RECEIPT", "MPESA_RECEIPT", "IN_APP_CHAT", "ROUTE_MAP"],
        "optional": [],
    },
    "rating_or_cancellation": {
        "required": ["SUSPENSION_NOTICE", "RATING_SCREENSHOT", "CANCELLED_TRIPS_LIST"],
        "optional": ["CANCEL_REQUEST_SCREENSHOT", "IN_APP_CHAT"],
    },
    "fraud_flag": {
        "required": ["SUSPENSION_NOTICE", "TRIP_HISTORY", "SOLE_USE_PROOF", "MPESA_RECEIPT"],
        "optional": ["DEVICE_GPS_DETAILS"],
    },
    "out_of_scope": {"required": [], "optional": []},
}

# Rule IDs. Must match data/policies.json once T08 is done.
RULES_ALL = ["LN120_REG15_1", "LN120_REG13_1_B", "DPA_S26_S35"]
RULES_BY_TYPE = {"passenger_safety": ["LN120_REG18_1"]}
RULES_BY_PLATFORM = {
    "Uber": ["UBER_KE_DEACTIVATION_REVIEW"],
    "Bolt": ["BOLT_KE_CL12", "BOLT_KE_CL13", "BOLT_KE_CL16_8"],
    "Faras": ["FARAS_PROVIDER_TERMS"],
}


def load_checklists() -> dict[str, dict[str, list[str]]]:
    """Use data/checklists.json if Mercy's file exists and has our shape, else the draft."""
    path = DATA_DIR / "checklists.json"
    if path.exists():
        data = json.loads(path.read_text())
        if all(t in data and "required" in data[t] for t in IN_SCOPE_TYPES):
            return data
    return CHECKLISTS


def missing_evidence(case_type: str, held: list[str], checklists=None) -> list[str]:
    checklists = checklists or load_checklists()
    return [item for item in checklists[case_type]["required"] if item not in held]


def policy_rules(case_type: str, platform: str) -> list[str]:
    if case_type == "out_of_scope":
        return []
    return RULES_ALL + RULES_BY_TYPE.get(case_type, []) + RULES_BY_PLATFORM.get(platform, [])
