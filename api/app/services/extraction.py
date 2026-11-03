"""Fact extraction (T16).

Pulls the facts an appeal needs out of the driver's story: dates, times,
places, KSh amounts and trip IDs. It runs on the redacted story, so personal
details are already placeholders like <PHONE_1> by the time text gets here.

How it works:
1. An EntityRuler, placed before spaCy's own entity model, tags facts with
   our patterns (KSh amounts, English and Swahili dates and times, Nairobi
   places from data/nairobi_locations.json, TRX-style trip IDs).
2. spaCy's own entity model runs after the ruler. Its guesses are switched
   off for now (see KEEP_FROM_MODEL): on the build set they were all wrong.
3. A second pass tags plain numbers after words like "paid" or "walilipa" as
   MONEY, and short codes after "trip id" as TRIP_ID. Only the number or code
   is tagged, so the driver sees "350", not "paid 350".
"""

from __future__ import annotations

import json
import threading
from functools import lru_cache
from pathlib import Path

from spacy.language import Language
from spacy.matcher import Matcher
from spacy.tokens import Doc, Span
from spacy.util import filter_spans

from ..schemas import Entity
from .nlp import get_nlp

RULER_NAME = "sauti_fact_ruler"
RULER_ID = "sauti"  # marks entities that came from our patterns
# Labels to keep from spaCy's own entity model. Empty for now: on the build
# set it added no correct facts, only noise ("four years", "night", and phone
# numbers as dates). Add "DATE" / "TIME" back here to use it again.
KEEP_FROM_MODEL: set[str] = set()

# --- word lists ---------------------------------------------------------

WEEKDAYS = [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    # Swahili
    "jumatatu", "jumanne", "jumatano", "alhamisi", "ijumaa", "jumamosi", "jumapili",
]
# Short forms only count when capitalised: "sat" and "wed" are also words.
WEEKDAY_SHORT = ["Mon", "Tue", "Tues", "Wed", "Thu", "Thur", "Thurs", "Fri", "Sat", "Sun"]
MONTHS = [
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
]
PART_OF_DAY = ["morning", "afternoon", "evening", "night"]
# Swahili times: "saa nne asubuhi" (10am), "saa tatu usiku" (9pm).
SW_HOURS = ["moja", "mbili", "tatu", "nne", "tano", "sita", "saba", "nane", "tisa", "kumi"]
SW_PART_OF_DAY = ["asubuhi", "mchana", "jioni", "usiku", "alfajiri", "usiku wa manane"]

CURRENCY_WORDS = ["ksh", "kshs", "ksh.", "kes", "sh", "shs", "sh.", "bob"]
CURRENCY_AFTER = ["ksh", "kshs", "kes", "bob", "shillings", "shilingi", "/-", "/="]

# Words that come right before a plain amount: "paid 350", "walilipa 750".
MONEY_CUES = [
    "paid", "pay", "pays", "paying", "charged", "charge", "cost", "costs",
    "fare", "gave", "showed", "of", "was", "is", "only", "balance", "refund",
    # Swahili and Sheng
    "lipa", "kulipa", "alilipa", "walilipa", "nililipwa", "amelipa", "ilionyesha",
    "nauli", "pesa", "doo",
]
# Only these cues are strong enough on their own. Weak cues ("of", "was",
# "is", "only") need a strong cue just before them, e.g. "fare was 1050",
# "instead of 2700".
WEAK_MONEY_CUES = {"of", "was", "is", "only"}
WEAK_CUE_LEADS = {"fare", "instead", "paid", "cost", "nauli", "balance", "price", "total"}

NUMBER_REGEX = r"^\d{1,3}(,\d{3})+$|^\d{2,6}$"

# --- data file ----------------------------------------------------------


def _find_data_file(name: str) -> Path:
    here = Path(__file__).resolve()
    for data_dir in (here.parents[3] / "data", here.parents[2] / "data"):  # repo, Docker
        if (data_dir / name).exists():
            return data_dir / name
    raise FileNotFoundError(f"data/{name} not found")


def _load_places() -> list[dict]:
    return json.loads(_find_data_file("nairobi_locations.json").read_text())["places"]


# --- patterns -----------------------------------------------------------


def _place_patterns(nlp: Language) -> list[dict]:
    patterns = []
    for place in _load_places():
        attr = "ORTH" if place.get("match_case") else "LOWER"
        for name in [place["name"], *place.get("aliases", [])]:
            values = [t.text if attr == "ORTH" else t.lower_ for t in nlp.tokenizer(name)]
            # Also match with a full stop on the last word: "South C." at the
            # end of a sentence is one token. extract() trims the full stop.
            for last in (values[-1], values[-1] + "."):
                pattern = [{attr: v} for v in values[:-1]] + [{attr: last}]
                patterns.append({"label": "LOCATION", "pattern": pattern})
    return patterns


def _money_patterns() -> list[dict]:
    number = {"LIKE_NUM": True}
    joined = r"^(kshs?|kes|shs?)\.?\d[\d,]*(\.\d+)?(/[-=])?$"  # Ksh2850, sh500
    joined_after = r"^\d[\d,]*(\.\d+)?(bob|/-|/=)$"  # 200bob, 1700/-
    return [
        {"label": "MONEY", "pattern": [{"LOWER": {"IN": CURRENCY_WORDS}}, number]},
        {"label": "MONEY", "pattern": [{"LOWER": {"IN": CURRENCY_WORDS}}, {"ORTH": "."}, number]},
        {"label": "MONEY", "pattern": [number, {"LOWER": {"IN": CURRENCY_AFTER}}]},
        {"label": "MONEY", "pattern": [{"LOWER": {"REGEX": joined}}]},
        {"label": "MONEY", "pattern": [{"LOWER": {"REGEX": joined_after}}]},
    ]


def _date_patterns() -> list[dict]:
    weekday = {"LOWER": {"IN": WEEKDAYS}}
    weekday_short = {"ORTH": {"IN": WEEKDAY_SHORT}}
    # "Oct." at the end of a sentence is one token, full stop included.
    month = {"LOWER": {"REGEX": rf"^({'|'.join(MONTHS)})\.?$"}}
    day = {"LOWER": {"REGEX": r"^([1-9]|[12]\d|3[01])(st|nd|rd|th)?$"}}
    # A weekday then a bare number needs "th"/"st": "Monday 11" is often "Monday 11pm".
    ordinal = {"LOWER": {"REGEX": r"^([1-9]|[12]\d|3[01])(st|nd|rd|th)$"}}
    year = {"TEXT": {"REGEX": r"^(19|20)\d{2}$"}}
    rel = {"LOWER": {"IN": ["last", "this", "next", "past"]}}
    patterns = []
    for wd in (weekday, weekday_short):
        patterns += [
            [wd],
            [rel, wd],
            [wd, ordinal],
            [wd, day, month],
            [wd, day, month, year],
            [wd, {"LOWER": {"IN": PART_OF_DAY}}],
        ]
    patterns += [
        [day, month],
        [day, month, year],
        [day, {"LOWER": "of"}, month],
        [month, day],
        [month, day, {"ORTH": ","}, year],
        [{"TEXT": {"REGEX": r"^\d{1,2}[/-]\d{1,2}[/-](\d{2}|\d{4})$"}}],
        [{"LOWER": {"IN": ["yesterday", "today"]}}],
        [{"LOWER": {"IN": ["last", "past", "this"]}}, {"LOWER": {"IN": ["week", "month", "weekend"]}}],
        [{"LOWER": "the"}, {"LOWER": "day"}, {"LOWER": "before"}, {"LOWER": "yesterday"}],
        # Swahili: jana (yesterday), juzi (day before), leo (today), wiki iliyopita (last week)
        [{"LOWER": {"IN": ["jana", "juzi"]}}],
        [{"ORTH": "leo"}],
        [{"LOWER": {"IN": ["wiki", "mwezi"]}}, {"LOWER": {"IN": ["iliyopita", "uliopita", "jana"]}}],
    ]
    return [{"label": "DATE", "pattern": p} for p in patterns]


def _time_patterns() -> list[dict]:
    clock = {"TEXT": {"REGEX": r"^([01]?\d|2[0-3])([.:][0-5]\d)?$"}}
    colon_clock = {"TEXT": {"REGEX": r"^([01]?\d|2[0-3]):[0-5]\d$"}}
    am_pm = {"LOWER": {"IN": ["am", "pm", "a.m.", "p.m.", "a.m", "p.m", "hrs"]}}
    joined = {"LOWER": {"REGEX": r"^([01]?\d|2[0-3])([.:][0-5]\d)?(am|pm|hrs)$"}}
    in_the = [{"LOWER": "in"}, {"LOWER": "the"}, {"LOWER": {"IN": PART_OF_DAY}}]
    sw_hour = {"LOWER": {"IN": SW_HOURS + [str(n) for n in range(1, 13)]}}
    sw_part = {"LOWER": {"IN": SW_PART_OF_DAY}}
    fraction = [{"LOWER": "na"}, {"LOWER": {"IN": ["nusu", "robo"]}}]  # half past, quarter past
    patterns = [
        [joined],
        [clock, am_pm],
        [colon_clock],
        [joined, *in_the],
        [clock, am_pm, *in_the],
        [colon_clock, *in_the],
        [{"LOWER": {"IN": ["midnight", "midday", "noon"]}}],
        [{"LOWER": "saa"}, sw_hour],
        [{"LOWER": "saa"}, sw_hour, sw_part],
        [{"LOWER": "saa"}, sw_hour, *fraction],
        [{"LOWER": "saa"}, sw_hour, *fraction, sw_part],
        [{"LOWER": "saa"}, {"LOWER": "kumi"}, {"LOWER": "na"}, {"LOWER": {"IN": ["moja", "mbili"]}}],
        [{"LOWER": "saa"}, {"LOWER": "kumi"}, {"LOWER": "na"}, {"LOWER": {"IN": ["moja", "mbili"]}}, sw_part],
    ]
    return [{"label": "TIME", "pattern": p} for p in patterns]


def _trip_id_patterns() -> list[dict]:
    # TRX-67091 style references are distinctive enough to tag anywhere.
    return [{"label": "TRIP_ID", "pattern": [{"TEXT": {"REGEX": r"^TRX-?\d{4,8}$"}}]}]


def _context_matcher(nlp: Language) -> Matcher:
    matcher = Matcher(nlp.vocab)
    number = {"TEXT": {"REGEX": NUMBER_REGEX}}
    strong = [c for c in MONEY_CUES if c not in WEAK_MONEY_CUES]
    matcher.add("MONEY", [
        [{"LOWER": {"IN": strong}}, number],
        [{"LOWER": {"IN": strong}}, {"LOWER": "me"}, number],  # "gave me 500"
        [{"LOWER": {"IN": list(WEAK_CUE_LEADS)}}, {"LOWER": {"IN": list(WEAK_MONEY_CUES)}}, number],
    ])
    # Short trip codes (F5UN, 8T26) only after "trip id", "trip ID:", "trip no".
    # spaCy splits "id" into "i" + "d", so both spellings are listed.
    code = {"TEXT": {"REGEX": r"^(?=.*[A-Z0-9])[A-Z0-9]{4,8}$"}}
    trip = {"LOWER": {"IN": ["trip", "safari"]}}
    id_word = [
        [{"LOWER": "id"}],
        [{"LOWER": "i"}, {"LOWER": "d"}],
        [{"LOWER": {"IN": ["no", "no.", "number", "ref", "namba"]}}],
    ]
    between = [[], [{"ORTH": ":"}], [{"LOWER": {"IN": ["ends", "is", "was"]}}]]
    matcher.add("TRIP_ID", [[trip, *w, *b, code] for w in id_word for b in between])
    return matcher


# --- pipeline -----------------------------------------------------------

_setup_lock = threading.Lock()


@lru_cache(maxsize=1)
def _pipeline() -> tuple[Language, Matcher]:
    nlp = get_nlp()
    with _setup_lock:
        if RULER_NAME not in nlp.pipe_names:
            ruler = nlp.add_pipe(
                "entity_ruler", name=RULER_NAME, before="ner", config={"overwrite_ents": False}
            )
            patterns = (
                _place_patterns(nlp)
                + _money_patterns()
                + _date_patterns()
                + _time_patterns()
                + _trip_id_patterns()
            )
            ruler.add_patterns([{**p, "id": RULER_ID} for p in patterns])
    return nlp, _context_matcher(nlp)


def _is_placeholder(span: Span) -> bool:
    # <PHONE_1> is split into "<", "PHONE_1", ">".
    return any("_" in t.text and t.text.split("_")[-1].isdigit() for t in span)


def _facts(doc: Doc, matcher: Matcher) -> list[Span]:
    ours = [ent for ent in doc.ents if ent.ent_id_ == RULER_ID]
    for match_id, start, end in matcher(doc):
        label = doc.vocab.strings[match_id]
        last = doc[end - 1]
        ours.append(Span(doc, last.i, last.i + 1, label=label))
    # Among our own spans, the longest wins when they overlap.
    ours = filter_spans(ours)
    # The model only fills gaps: it can mistake "fare was 1050" for a date.
    taken = {i for span in ours for i in range(span.start, span.end)}
    from_model = [
        ent for ent in doc.ents
        if ent.ent_id_ != RULER_ID
        and ent.label_ in KEEP_FROM_MODEL
        and not taken.intersection(range(ent.start, ent.end))
    ]
    return [s for s in ours + from_model if not _is_placeholder(s)]


def extract(text: str) -> list[Entity]:
    """Return the facts in a (redacted) story, in the order they appear.

    Repeats are dropped: "Westlands" mentioned twice comes back once.
    """
    nlp, matcher = _pipeline()
    doc = nlp(text)
    seen: set[tuple[str, str]] = set()
    facts: list[Entity] = []
    for span in sorted(_facts(doc, matcher), key=lambda s: s.start):
        text = span.text
        if span.label_ in {"LOCATION", "DATE"}:
            text = text.rstrip(".")  # "South C." -> "South C"; TIME keeps "a.m."
        key = (span.label_, text.lower())
        if key not in seen:
            seen.add(key)
            facts.append(Entity(label=span.label_, text=text))
    return facts
