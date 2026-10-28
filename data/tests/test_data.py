import copy
import json
from collections import Counter
from pathlib import Path

import pytest

from case_rules import CHECKLISTS, IN_SCOPE_TYPES, missing_evidence
from generate import apply_rewrite, generate
from validate import check_record

DATA = Path(__file__).resolve().parent.parent
EXAMPLES = sorted((DATA / "examples").glob("*.json"))


@pytest.fixture(scope="module")
def cases():
    return generate(seed=42)


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.name)
def test_worked_examples_validate(path):
    assert check_record(json.loads(path.read_text())) == []


def test_at_least_two_examples():
    assert len(EXAMPLES) >= 2


def test_wrong_offsets_are_caught():
    record = json.loads((DATA / "examples" / "SYN-042.json").read_text())
    record["labels"]["entities"][0].update(start=16, end=34)  # the offsets from the first draft
    assert any("narrative[16:34]" in e for e in check_record(record))


def test_real_case_needs_consent():
    record = json.loads((DATA / "examples" / "SYN-014.json").read_text())
    record.update(source="real", case_id="REAL-001")
    assert check_record(record)
    record["consent"] = {"date": "2026-10-10", "form": "written", "scope": ["test_set"]}
    assert check_record(record) == []


def test_generated_cases_all_validate(cases):
    problems = {c["case_id"]: check_record(c) for c in cases}
    assert {k: v for k, v in problems.items() if v} == {}


def test_generated_mix(cases):
    assert len(cases) == 150
    types = Counter(c["labels"]["case_type"] for c in cases)
    assert all(types[t] == 35 for t in IN_SCOPE_TYPES) and types["out_of_scope"] == 10
    held = Counter(c["labels"]["case_type"] for c in cases if c["split"] == "held_out")
    assert all(held[t] == 10 for t in IN_SCOPE_TYPES)
    assert len({c["case_id"] for c in cases}) == 150
    assert len({c["platform"] for c in cases}) == 4
    assert sum(bool(c["labels"]["pii"]) for c in cases) >= 30  # enough to score the PII filter


def test_generated_evidence_missing_matches_checklist(cases):
    for c in cases:
        expected = missing_evidence(c["labels"]["case_type"], c["evidence_held"], CHECKLISTS)
        assert c["labels"]["evidence_missing"] == expected


def test_generation_is_deterministic():
    assert generate(seed=1) == generate(seed=1)
    assert generate(seed=1) != generate(seed=2)


def test_rewrite_respans_or_keeps_original(cases):
    case = copy.deepcopy(next(c for c in cases if c["labels"]["entities"]))
    original = copy.deepcopy(case)
    first = case["labels"]["entities"][0]["text"]

    assert apply_rewrite(case, "nothing useful here") is False
    assert case == original

    keep = [s["text"] for s in case["labels"]["entities"] + case["labels"]["pii"]]
    assert apply_rewrite(case, "Rewritten: " + " / ".join(keep)) is True
    assert case["labels"]["entities"][0]["text"] == first
    assert check_record(case) == []
