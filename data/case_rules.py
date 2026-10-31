"""
Case rules and checklist loader integrated with data alignment mappers.
"""

import json
from pathlib import Path

try:
    from data.mappings import normalize_category, normalize_evidence_id, normalize_rule_id
except ModuleNotFoundError:
    from mappings import normalize_category, normalize_evidence_id, normalize_rule_id

DATA_DIR = Path(__file__).parent

# 4 in-scope keys matching TEMPLATES in generate.py
IN_SCOPE_TYPES = [
    "fare_dispute",
    "fraud_flag",
    "passenger_safety",
    "rating_or_cancellation"
]

def load_checklists(file_path: Path = DATA_DIR / "checklists.json") -> dict:
    if not file_path.exists():
        return {}
    with open(file_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    
    checklists = {}
    for cat_key, sections in raw.items():
        normalized_sections = {}
        for section_key, items in sections.items():
            normalized_items = []
            for item in items:
                raw_id = item.get("item_id", "") if isinstance(item, dict) else str(item)
                normalized_items.append(normalize_evidence_id(raw_id))
            normalized_sections[section_key] = normalized_items
        
        checklists[cat_key] = normalized_sections
        std_cat = normalize_category(cat_key)
        checklists[std_cat] = normalized_sections

    # Explicit fallback aliases for template compatibility
    alias_map = {
        "fraud_flag": ["fraud_accusation", "FRAUD_ACCUSATION"],
        "rating_or_cancellation": ["rating_cancellation", "CONDUCT_COMPLAINT"],
        "fare_dispute": ["PAYMENT_EARNINGS_HOLD"],
        "passenger_safety": ["SAFETY_INCIDENT"]
    }
    for target_key, sources in alias_map.items():
        if target_key not in checklists:
            for src in sources:
                if src in checklists:
                    checklists[target_key] = checklists[src]
                    break

    # Provide empty checklist schema for out_of_scope to prevent KeyError in generate.py
    if "out_of_scope" not in checklists:
        checklists["out_of_scope"] = {"required": [], "optional": []}

    return checklists

def load_policies(file_path: Path = DATA_DIR / "policies.json") -> dict:
    if not file_path.exists():
        return {}
    with open(file_path, "r", encoding="utf-8") as f:
        policies = json.load(f)
    for category in ["statutory_rules", "platform_rules", "union_protocols"]:
        if category in policies:
            for rule in policies[category]:
                if "rule_id" in rule:
                    rule["rule_id"] = normalize_rule_id(rule["rule_id"])
    return policies

CHECKLISTS = load_checklists()
POLICIES = load_policies()

def policy_rules(case_type: str = None, platform: str = None) -> list:
    """Returns a list of matching rule ID strings for generator and schema validation."""
    rule_ids = []
    for category, rules in POLICIES.items():
        if isinstance(rules, list):
            for r in rules:
                if isinstance(r, dict) and "rule_id" in r:
                    rule_ids.append(r["rule_id"])
    return rule_ids

def missing_evidence(case_type: str, present_evidence: list, checklists: dict = None) -> list:
    source_checklists = checklists if checklists is not None else CHECKLISTS
    cat = normalize_category(case_type)
    reqs = (
        source_checklists.get(case_type, {}).get("required") or
        source_checklists.get(cat, {}).get("required", [])
    )
    
    present_set = set()
    for e in present_evidence:
        raw_id = e.get("item_id", "") if isinstance(e, dict) else str(e)
        present_set.add(normalize_evidence_id(raw_id))

    missing = []
    for r in reqs:
        item_id = r.get("item_id", "") if isinstance(r, dict) else str(r)
        norm_item_id = normalize_evidence_id(item_id)
        if norm_item_id and norm_item_id not in present_set:
            missing.append(r)
    return missing
