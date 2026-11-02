"""Evidence gap checking service (Task T24).

Audits evidence held by a driver against statutory/platform checklists for their case type,
calculates readiness score, and returns missing/optional items.
"""

from __future__ import annotations

import importlib.util
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..schemas import EvidenceCheck, MissingItem


def _find_data_dir() -> Path:
    """Find data directory across local repo and Docker container layouts."""
    candidates = [
        Path(__file__).resolve().parents[3] / "data",  # <repo_root>/data
        Path(__file__).resolve().parents[2] / "data",  # /srv/data (Docker)
        Path.cwd() / "data",
        Path.cwd().parent / "data",
    ]
    for p in candidates:
        if (p / "checklists.json").exists():
            return p
    return candidates[0]


def _load_mappings():
    """Load normalization functions from data/mappings.py with safe fallbacks."""
    try:
        from data.mappings import normalize_category, normalize_evidence_id
        return normalize_category, normalize_evidence_id
    except ModuleNotFoundError:
        pass

    data_dir = _find_data_dir()
    mappings_file = data_dir / "mappings.py"
    if mappings_file.exists():
        spec = importlib.util.spec_from_file_location("mappings", mappings_file)
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod.normalize_category, mod.normalize_evidence_id

    # Fallback normalization logic if mappings module is unreachable
    def _fallback_cat(category_str: str) -> str:
        cat_map = {
            "fare_dispute": "PAYMENT_EARNINGS_HOLD",
            "fraud_flag": "FRAUD_ACCUSATION",
            "passenger_safety": "SAFETY_INCIDENT",
            "rating_or_cancellation": "CONDUCT_COMPLAINT",
            "account_verification": "ACCOUNT_INTEGRITY",
            "out_of_scope": "OUT_OF_SCOPE",
        }
        clean = category_str.lower().strip()
        return cat_map.get(clean, category_str.upper())

    def _fallback_ev(evidence_str: str) -> str:
        return evidence_str.strip()

    return _fallback_cat, _fallback_ev


normalize_category, normalize_evidence_id = _load_mappings()

EXTRA_CATEGORY_ALIASES = {
    "fare_payment_dispute": "PAYMENT_EARNINGS_HOLD",
    "passenger_safety_complaint": "SAFETY_INCIDENT",
    "rating_cancellation_dispute": "CONDUCT_COMPLAINT",
    "rating_cancellation": "CONDUCT_COMPLAINT",
    "account_fraud_flag": "FRAUD_ACCUSATION",
    "fraud_accusation": "FRAUD_ACCUSATION",
    "safety_incident": "SAFETY_INCIDENT",
    "conduct_complaint": "CONDUCT_COMPLAINT",
    "payment_earnings_hold": "PAYMENT_EARNINGS_HOLD",
    "account_integrity": "ACCOUNT_INTEGRITY",
}


@lru_cache(maxsize=1)
def load_checklists(file_path: Path | None = None) -> dict[str, Any]:
    """Load authoritative evidence requirements from checklists.json."""
    if file_path is None:
        file_path = _find_data_dir() / "checklists.json"
    if not file_path.exists():
        return {}
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def evaluate_evidence_gaps(
    case_type: str, evidence_held: list[str] | None = None
) -> EvidenceCheck:
    """Evaluate evidence held against checklists for a given dispute category.

    Args:
        case_type: Category identifier (e.g. 'fare_dispute', 'passenger_safety', etc.)
        evidence_held: List of evidence IDs currently provided by the driver.

    Returns:
        EvidenceCheck model with readiness score, missing items, and optional items.
    """
    if evidence_held is None:
        evidence_held = []

    if not case_type:
        return EvidenceCheck(readiness=None, missing=[], optional=[])

    checklists = load_checklists()
    raw_type = case_type.strip()
    norm_cat = normalize_category(raw_type)

    if norm_cat not in checklists:
        clean_key = raw_type.lower().replace("-", "_").replace(" ", "_")
        alias = EXTRA_CATEGORY_ALIASES.get(clean_key)
        if alias and alias in checklists:
            norm_cat = alias

    if norm_cat == "OUT_OF_SCOPE" or raw_type.lower() in ("out_of_scope", "out-of-scope"):
        return EvidenceCheck(readiness=1.0, missing=[], optional=[])

    category_data = checklists.get(norm_cat)
    if not category_data:
        return EvidenceCheck(readiness=None, missing=[], optional=[])

    # Normalize held evidence for robust lookup
    held_set: set[str] = set()
    for item in evidence_held:
        if isinstance(item, str):
            clean_item = item.strip()
            held_set.add(clean_item)
            held_set.add(clean_item.upper())
            held_set.add(normalize_evidence_id(clean_item))

    # Evaluate required items
    required_items = category_data.get("required", [])
    total_required = len(required_items)
    missing_items: list[MissingItem] = []
    held_required_count = 0

    for item in required_items:
        item_id = item.get("item_id", "")
        norm_item_id = normalize_evidence_id(item_id)
        if norm_item_id in held_set or item_id in held_set:
            held_required_count += 1
        else:
            reason = item.get("reason") or item.get("label") or f"Required for {case_type} appeal."
            missing_items.append(MissingItem(id=item_id, reason=reason))

    # Evaluate optional items (only those NOT held)
    optional_not_held: list[str] = []
    for item in category_data.get("optional", []):
        item_id = item.get("item_id", "")
        norm_item_id = normalize_evidence_id(item_id)
        if norm_item_id not in held_set and item_id not in held_set:
            optional_not_held.append(item_id)

    # Calculate readiness score
    if total_required > 0:
        readiness = round(held_required_count / total_required, 2)
    else:
        readiness = 1.0

    return EvidenceCheck(
        readiness=readiness,
        missing=missing_items,
        optional=optional_not_held,
    )
