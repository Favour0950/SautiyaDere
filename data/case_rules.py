"""
Case rules and evidence checklist loader integrated with data alignment mappers.
"""

import json
from pathlib import Path
from data.mappings import normalize_category, normalize_evidence_id, normalize_rule_id

DATA_DIR = Path(__file__).parent

def load_checklists(file_path: Path = DATA_DIR / "checklists.json") -> dict:
    """Loads evidence checklists, normalizing keys and item IDs to standard enums."""
    if not file_path.exists():
        return {}
    
    with open(file_path, "r", encoding="utf-8") as f:
        raw_checklists = json.load(f)
    
    normalized_checklists = {}
    for cat_key, sections in raw_checklists.items():
        std_cat = normalize_category(cat_key)
        normalized_sections = {}
        
        for section_key, items in sections.items():
            normalized_items = []
            for item in items:
                if isinstance(item, dict):
                    item_copy = item.copy()
                    item_copy["item_id"] = normalize_evidence_id(item_copy.get("item_id", ""))
                    normalized_items.append(item_copy)
                else:
                    normalized_items.append(normalize_evidence_id(str(item)))
            normalized_sections[section_key] = normalized_items
            
        normalized_checklists[std_cat] = normalized_sections
        
    return normalized_checklists

def load_policies(file_path: Path = DATA_DIR / "policies.json") -> dict:
    """Loads policies, normalizing rule_id values."""
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
