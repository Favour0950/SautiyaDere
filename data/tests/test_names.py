import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent
NAMES = json.loads((DATA / "kenyan_names.json").read_text())
PLACES = json.loads((DATA / "nairobi_locations.json").read_text())["places"]


def _lower(items):
    return [i.lower() for i in items]


def test_lists_are_not_empty():
    assert len(NAMES["names"]) > 100
    assert NAMES["ambiguous"]
    assert NAMES["context_words"]


def test_no_name_is_listed_twice():
    everything = _lower(NAMES["names"] + NAMES["ambiguous"])
    repeats = {n for n in everything if everything.count(n) > 1}
    assert not repeats


def test_no_name_is_also_a_place():
    # A place must never be hidden as a name: the appeal needs it.
    places = {n.lower() for p in PLACES for n in [p["name"], *p.get("aliases", [])]}
    clashes = set(_lower(NAMES["names"] + NAMES["ambiguous"])) & places
    assert not clashes


def test_no_name_is_a_weekday_or_month():
    calendar = {
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        "january", "february", "march", "april", "may", "june", "july", "august",
        "september", "october", "november", "december",
    }
    assert not set(_lower(NAMES["names"] + NAMES["ambiguous"])) & calendar


def test_context_words_are_lower_case_single_words():
    for word in NAMES["context_words"]:
        assert word == word.lower() and " " not in word
