"""Personal-details filter (T15).

Hides personal details behind placeholders before any text leaves the server,
and puts them back into the drafted appeal before it goes to the driver's
phone. See docs/privacy-and-redaction.md.

    result = redact("Rider Wanjiku, 0712 345 678, plate KDC 638T")
    result.text     -> "Rider <PERSON_1>, <PHONE_1>, plate <PLATE_1>"
    result.mapping  -> {"<PERSON_1>": "Wanjiku", "<PHONE_1>": "0712 345 678", ...}

    restored = restore(draft_from_claude, result.mapping)

What it finds (Presidio, with our own recognizers):
- PHONE:      Kenyan mobiles, +2547.., +2541.., 07.., 01.., spaces or dashes allowed
- PLATE:      KDC 638T, and motorbikes like KMDA 123B
- MPESA_CODE: 10 capital letters and digits, at least 2 of each
- PERSON:     names from data/kenyan_names.json, in any case. Names that are
              also everyday words (Mercy, Baraka) only next to a context word.
              Also any word right after "anaitwa", "jina lake ni", "name is"
- EMAIL:      Presidio's built-in recognizer, set up not to use the network

Presidio's own date, place and nationality detectors are off: the appeal
needs those facts.

Privacy rules this module keeps:
- Every redact() call builds a new mapping in a local variable. Nothing is
  shared between requests, so two drivers' details can never mix.
- The mapping and the input text are never logged.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache

import tldextract
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer, RecognizerRegistry
from presidio_analyzer.context_aware_enhancers import LemmaContextAwareEnhancer
from presidio_analyzer.nlp_engine import SpacyNlpEngine
from presidio_analyzer.predefined_recognizers import EmailRecognizer

from .data_files import load_json
from .nlp import MODEL_NAME, get_nlp

LANGUAGE = "en"
# A detection needs at least this score to be hidden. Ambiguous names start
# below it and only pass when a context word raises their score.
SCORE_THRESHOLD = 0.5

# 07.. / 01.. / +2547.. / +2541..: nine digits after the 0, spaced or dashed
# anywhere. A capital O typed for a zero ("O712 345 678") still counts.
PHONE_REGEX = r"(?<![\w+])(?:\+?254|[0O])[\s-]?[17](?:[\s-]?[\dO]){8}(?!\w)"
# Any word after an explicit naming phrase is a name, even if it is not on
# the list: "anaitwa Mwanaidi", "jina lake ni Mwanaidi", "his name is Mwanaidi".
# Python needs fixed-width lookbehinds, so each phrase gets its own.
NAMING_PHRASES = ["anaitwa", "aitwaye", "jina lake ni", "jina ni", "name is", "named"]
NAMED_REGEX = (
    "(?:" + "|".join(f"(?<=\\b{p} )" for p in NAMING_PHRASES) + r")[A-Za-z][A-Za-z'-]+\b"
)
PLATE_REGEXES = {
    "car": r"\bK[A-Z]{2}\s?\d{3}[A-Z]\b",
    "motorbike": r"\bKM[A-Z]{2}\s?\d{3}[A-Z]\b",
}
# Lookaheads require 2+ letters and 2+ digits, so a 10-digit phone number or
# an all-caps word ("NIMECHOKAS") is not mistaken for a code.
MPESA_REGEX = r"\b(?=(?:[0-9]*[A-Z]){2})(?=(?:[A-Z]*[0-9]){2})[A-Z0-9]{10}\b"

PLACEHOLDER_RE = re.compile(r"<([A-Z]+(?:_[A-Z]+)*)_(\d+)>")


class OfflineEmailRecognizer(EmailRecognizer):
    """Presidio's email recognizer, without network calls.

    Presidio checks the domain with tldextract, which by default downloads the
    public list of web domains on first use. This copy uses the list that
    ships with tldextract, so the filter never calls out to the internet.
    """

    _domains = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)

    def validate_result(self, pattern_text: str) -> bool:
        return self._domains(pattern_text).fqdn != ""


@dataclass(frozen=True)
class Redaction:
    text: str  # the story with placeholders
    mapping: dict[str, str] = field(repr=False)  # placeholder -> original value


@dataclass(frozen=True)
class Restored:
    text: str
    # Placeholders from the mapping that are not in the draft. Often fine
    # (the appeal need not repeat a phone number), but if Claude changed a
    # placeholder it shows up here and in `unknown`.
    missing: list[str]
    # Placeholder-looking text in the draft that is not in the mapping.
    unknown: list[str]


# --- engine ---------------------------------------------------------------


def _recognizers() -> list:
    names = load_json("kenyan_names.json")
    case_sensitive = re.DOTALL | re.MULTILINE
    return [
        PatternRecognizer(
            supported_entity="PHONE",
            name="KenyanPhoneRecognizer",
            patterns=[Pattern("ke_mobile", PHONE_REGEX, 0.7)],
            context=["phone", "number", "namba", "simu", "call", "piga", "nambari", "contact"],
        ),
        PatternRecognizer(
            supported_entity="PLATE",
            name="KenyanPlateRecognizer",
            patterns=[Pattern(f"ke_plate_{k}", v, 0.7) for k, v in PLATE_REGEXES.items()],
            context=["plate", "car", "gari", "vehicle", "registration", "reg", "number", "nambari"],
        ),
        PatternRecognizer(
            supported_entity="MPESA_CODE",
            name="MpesaCodeRecognizer",
            patterns=[Pattern("mpesa_code", MPESA_REGEX, 0.6)],
            context=["mpesa", "m-pesa", "code", "confirmed", "transaction", "msimbo", "receipt"],
            global_regex_flags=case_sensitive,
        ),
        PatternRecognizer(
            supported_entity="PERSON",
            name="KenyanNameRecognizer",
            deny_list=names["names"],
            deny_list_score=0.85,
        ),
        PatternRecognizer(
            supported_entity="PERSON",
            name="AmbiguousNameRecognizer",
            deny_list=names["ambiguous"],
            deny_list_score=0.3,
            context=names["context_words"],
            global_regex_flags=case_sensitive,  # "Mercy" may be a name, "mercy" is not
        ),
        PatternRecognizer(
            supported_entity="PERSON",
            name="NamedPersonRecognizer",
            patterns=[Pattern("after_naming_phrase", NAMED_REGEX, 0.6)],
        ),
        OfflineEmailRecognizer(),
    ]


@lru_cache(maxsize=1)
def _analyzer() -> AnalyzerEngine:
    # Reuse the spaCy model fact extraction already loaded, instead of letting
    # Presidio load (or download) its default large model.
    nlp_engine = SpacyNlpEngine(models=[{"lang_code": LANGUAGE, "model_name": MODEL_NAME}])
    nlp_engine.nlp = {LANGUAGE: get_nlp()}

    registry = RecognizerRegistry(supported_languages=[LANGUAGE])
    for recognizer in _recognizers():
        registry.add_recognizer(recognizer)

    return AnalyzerEngine(
        registry=registry,
        nlp_engine=nlp_engine,
        supported_languages=[LANGUAGE],
        default_score_threshold=SCORE_THRESHOLD,
        context_aware_enhancer=LemmaContextAwareEnhancer(
            context_prefix_count=5,
            context_suffix_count=2,  # "Baraka alinipigia" as well as "rider Baraka"
            context_matching_mode="whole_word",
        ),
    )


# --- finding ----------------------------------------------------------------

_LABELS = {"EMAIL_ADDRESS": "EMAIL"}


@lru_cache(maxsize=1)
def _place_regex() -> re.Pattern:
    """Matches any listed place, longest first, ignoring case."""
    places = load_json("nairobi_locations.json")["places"]
    names = sorted(
        {n for p in places for n in [p["name"], *p.get("aliases", [])]}, key=len, reverse=True
    )
    return re.compile(r"\b(?:" + "|".join(re.escape(n) for n in names) + r")\b", re.IGNORECASE)


def _inside_a_place(start: int, end: int, places: list[tuple[int, int]]) -> bool:
    return any(p_start <= start and end <= p_end for p_start, p_end in places)


def find_personal_details(text: str) -> list[tuple[str, int, int]]:
    """Return personal details as (label, start, end), in order, without overlaps.

    When two detections overlap the longer wins, then the higher score: an
    email address beats the name inside it. A "name" that is, or sits inside,
    a listed place is dropped: "Karen", "Dennis Pritt Road" and "Mama Lucy
    Hospital" stay, because the appeal needs places.
    """
    places = [m.span() for m in _place_regex().finditer(text)]
    results = [
        r for r in _analyzer().analyze(text=text, language=LANGUAGE)
        if not (r.entity_type == "PERSON" and _inside_a_place(r.start, r.end, places))
    ]
    ranked = sorted(results, key=lambda r: (-(r.end - r.start), -r.score, r.start))
    chosen: list = []
    for r in ranked:
        if all(r.end <= c.start or c.end <= r.start for c in chosen):
            chosen.append(r)
    return [
        (_LABELS.get(r.entity_type, r.entity_type), r.start, r.end)
        for r in sorted(chosen, key=lambda r: r.start)
    ]


# --- placeholders -----------------------------------------------------------


def _same_value_key(label: str, value: str) -> str:
    """Two mentions of the same detail get the same placeholder."""
    if label == "PHONE":
        return re.sub(r"\D", "", value)[-9:]  # 0712.. and +254712.. are one number
    if label in {"PLATE", "MPESA_CODE"}:
        return re.sub(r"\s", "", value).upper()
    return " ".join(value.lower().split())


def redact(text: str) -> Redaction:
    """Replace personal details with placeholders like <PHONE_1>.

    Returns the new text and a mapping from placeholder to the original
    value. The mapping is new on every call and must stay on the server.
    """
    mapping: dict[str, str] = {}
    by_value: dict[tuple[str, str], str] = {}
    counts: dict[str, int] = {}
    parts: list[str] = []
    last = 0
    for label, start, end in find_personal_details(text):
        value = text[start:end]
        key = (label, _same_value_key(label, value))
        if key not in by_value:
            counts[label] = counts.get(label, 0) + 1
            placeholder = f"<{label}_{counts[label]}>"
            by_value[key] = placeholder
            mapping[placeholder] = value
        parts += [text[last:start], by_value[key]]
        last = end
    parts.append(text[last:])
    return Redaction(text="".join(parts), mapping=mapping)


def restore(text: str, mapping: dict[str, str]) -> Restored:
    """Put the original values back into text that contains placeholders.

    Placeholders not in the mapping are left as they are and listed in
    `unknown`, so the caller can fall back to template wording.
    """
    found: set[str] = set()
    unknown: list[str] = []

    def swap(match: re.Match) -> str:
        placeholder = match.group(0)
        if placeholder in mapping:
            found.add(placeholder)
            return mapping[placeholder]
        if placeholder not in unknown:
            unknown.append(placeholder)
        return placeholder

    restored = PLACEHOLDER_RE.sub(swap, text)
    missing = [p for p in mapping if p not in found]
    return Restored(text=restored, missing=missing, unknown=unknown)
