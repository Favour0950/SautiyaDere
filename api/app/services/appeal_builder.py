"""Grounded appeal statement generator (Tasks T25 & T30).

Uses the deterministic templates in data/templates.json and policy citations
in data/policies.json to draft a structured appeal statement from extracted
entities, then restores any redacted driver details via redaction.restore().
"""

from __future__ import annotations

from ..schemas import Appeal, Entity
from .data_files import load_json
from .redaction import restore


def build_appeal(
    case_type: str | None,
    platform: str | None,
    entities: list[Entity],
    redacted_narrative: str,
    mapping: dict[str, str] | None = None,
) -> Appeal:
    """Build a policy-grounded appeal from templates.json and extracted entities."""
    templates = load_json("templates.json")
    effective_type = case_type if case_type in templates else "fare_dispute"
    tmpl = templates.get(effective_type, templates["fare_dispute"])

    dates = [e.text for e in entities if e.label == "DATE"]
    times = [e.text for e in entities if e.label == "TIME"]
    locations = [e.text for e in entities if e.label == "LOCATION"]
    moneys = [e.text for e in entities if e.label == "MONEY"]
    trip_ids = [e.text for e in entities if e.label == "TRIP_ID"]

    slots = {
        "platform": platform or "Platform",
        "date": dates[0] if dates else "the date on record",
        "time": times[0] if times else "the recorded trip timestamp",
        "location": " to ".join(locations[:2]) if locations else "the recorded Nairobi route",
        "money": moneys[0] if moneys else "the recorded trip fare",
        "trip_id": trip_ids[0] if trip_ids else "on record",
    }

    headline = tmpl.get("headline", "Formal Driver Appeal and Account Review Request")
    body_template = tmpl.get("body_template", "")
    policy_rules = list(tmpl.get("policy_rules", ["POL-NTSA-15", "POL-TAWU-01"]))

    draft_body = body_template.format(**slots)

    # Restore any personal details from the driver's narrative mapping if present
    if mapping:
        draft_body = restore(draft_body, mapping).text

    return Appeal(
        headline=headline,
        body=draft_body,
        policy_rules=policy_rules,
    )
