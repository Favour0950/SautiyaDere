import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent
LOCATIONS = json.loads((DATA / "nairobi_locations.json").read_text())
PLACES = LOCATIONS["places"]


def _all_names(place):
    return [place["name"], *place.get("aliases", [])]


def test_every_place_has_a_name_and_known_type():
    for place in PLACES:
        assert place["name"].strip()
        assert place["type"] in LOCATIONS["types"]


def test_no_name_or_alias_is_listed_twice():
    seen = {}
    for place in PLACES:
        for name in _all_names(place):
            key = name.lower()
            assert key not in seen, f"{name!r} is listed under {seen[key]!r} too"
            seen[key] = place["name"]


def test_spec_places_are_listed():
    # The places named in the T16 task description.
    names = {n.lower() for place in PLACES for n in _all_names(place)}
    for spec_place in ["Westlands", "JKIA", "CBD", "Sarit Centre", "Eastleigh", "Kilimani"]:
        assert spec_place.lower() in names


def test_everyday_words_need_matching_case():
    # Places that are also common words must only match when capitalised,
    # or "fedha" (money) and "umoja" (unity) would be tagged as places.
    by_name = {place["name"]: place for place in PLACES}
    for word in ["Fedha", "Umoja", "Huruma", "Pipeline", "Karen"]:
        assert by_name[word].get("match_case") is True
