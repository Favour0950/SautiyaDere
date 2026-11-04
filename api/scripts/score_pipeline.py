"""Score the personal-details filter (T15) and fact extraction (T16).

    cd api && source .venv/bin/activate
    python scripts/score_pipeline.py                      # build set
    python scripts/score_pipeline.py --errors             # also list misses and extras
    python scripts/score_pipeline.py path/to/cases.jsonl
    python scripts/score_pipeline.py --redaction labels   # extraction alone, see below

It reports three things, in the order the app runs them:
1. Filter:     how many labelled personal details (labels.pii) were hidden.
2. Facts kept: how many labelled facts survived the filter. Hiding a date,
               place or amount by mistake would weaken the appeal.
3. Extraction: facts found in the filtered text (labels.entities).

For each label:
- found:   share of labelled items that were found (recall)
- correct: share of found items that match a label (precision)

An item counts as found when a prediction with the same label overlaps it, so
"around 9:30 PM" labelled and "9:30 PM" predicted is a match.

--redaction labels swaps the labelled personal details for placeholders
instead of running the filter. Use it to check extraction on its own.

Tune patterns on the build set only. Score the held-out set once, at the end.
Synthetic scores are optimistic; the real test set (T17) is the deciding check.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.extraction import fact_spans  # noqa: E402
from app.services.redaction import PLACEHOLDER_RE, find_personal_details, redact  # noqa: E402

DEFAULT_CASES = Path(__file__).resolve().parents[2] / "data" / "synthetic" / "build_set.jsonl"

# From docs/privacy-and-redaction.md
TARGETS = "Targets: PERSON and PHONE found >= 95%; facts kept >= 98%"

Span = tuple[str, int, int]  # (label, start, end)


@dataclass
class Score:
    labelled: Counter = field(default_factory=Counter)
    found: Counter = field(default_factory=Counter)
    predicted: Counter = field(default_factory=Counter)
    correct: Counter = field(default_factory=Counter)
    misses: dict = field(default_factory=lambda: defaultdict(Counter))
    extras: dict = field(default_factory=lambda: defaultdict(Counter))


@dataclass
class Kept:
    total: int = 0
    kept: int = 0
    lost: Counter = field(default_factory=Counter)  # facts the filter hid


# --- redaction and offsets ---------------------------------------------------


def placeholder_redact(narrative: str, pii: list[dict]) -> tuple[str, list[dict]]:
    """Swap labelled personal details for placeholders.

    Returns the new text and, for each swap, where it ended in the original
    text and how much it changed the length. move() uses these to find where
    each labelled fact sits in the new text.
    """
    counts: Counter = Counter()
    shifts = []
    out, last = [], 0
    for item in sorted(pii, key=lambda p: p["start"]):
        counts[item["label"]] += 1
        token = f"<{item['label']}_{counts[item['label']]}>"
        out += [narrative[last:item["start"]], token]
        shifts.append({"end": item["end"], "shift": len(token) - (item["end"] - item["start"])})
        last = item["end"]
    out.append(narrative[last:])
    return "".join(out), shifts


def filter_redact(narrative: str, detected: list[Span]) -> tuple[str, list[dict]]:
    """Run the real filter and work out the same shifts as placeholder_redact."""
    text = redact(narrative).text
    shifts, moved = [], 0
    for _, start, end in detected:
        match = PLACEHOLDER_RE.match(text, start + moved)
        shift = len(match.group(0)) - (end - start)
        shifts.append({"end": end, "shift": shift})
        moved += shift
    return text, shifts


def move(offset: int, shifts: list[dict]) -> int:
    return offset + sum(s["shift"] for s in shifts if s["end"] <= offset)


# --- scoring -------------------------------------------------------------------


def overlaps(a: Span, b: Span) -> bool:
    return a[0] == b[0] and a[1] < b[2] and b[1] < a[2]


def touches(a: Span, b: Span) -> bool:
    """Overlap regardless of label."""
    return a[1] < b[2] and b[1] < a[2]


def score_case(text: str, labelled: list[Span], predicted: list[Span], score: Score) -> None:
    for gold in labelled:
        score.labelled[gold[0]] += 1
        if any(overlaps(gold, p) for p in predicted):
            score.found[gold[0]] += 1
        else:
            score.misses[gold[0]][text[gold[1]:gold[2]]] += 1
    for pred in predicted:
        score.predicted[pred[0]] += 1
        if any(overlaps(pred, g) for g in labelled):
            score.correct[pred[0]] += 1
        else:
            score.extras[pred[0]][text[pred[1]:pred[2]]] += 1


def score_cases(cases: list[dict], redaction: str = "filter") -> tuple[Score, Kept, Score]:
    """Return (filter score, facts kept, extraction score)."""
    filtered, kept, extraction = Score(), Kept(), Score()
    for case in cases:
        narrative, labels = case["narrative"], case["labels"]
        pii = labels.get("pii", [])
        facts = [(e["label"], e["start"], e["end"]) for e in labels.get("entities", [])]

        if redaction == "filter":
            detected = find_personal_details(narrative)
            score_case(narrative, [(p["label"], p["start"], p["end"]) for p in pii], detected, filtered)
            text, shifts = filter_redact(narrative, detected)
        else:
            detected = [(p["label"], p["start"], p["end"]) for p in pii]
            text, shifts = placeholder_redact(narrative, pii)

        surviving = []
        for fact in facts:
            kept.total += 1
            if any(touches(fact, d) for d in detected):
                kept.lost[f"{fact[0]} {narrative[fact[1]:fact[2]]!r}"] += 1
                extraction.labelled[fact[0]] += 1  # a hidden fact cannot be found
                extraction.misses[fact[0]][narrative[fact[1]:fact[2]]] += 1
            else:
                kept.kept += 1
                surviving.append((fact[0], move(fact[1], shifts), move(fact[2], shifts)))
        score_case(text, surviving, fact_spans(text), extraction)
    return filtered, kept, extraction


# --- report ---------------------------------------------------------------------


def pct(part: int, whole: int) -> str:
    return f"{part / whole:.0%}" if whole else "-"


def table(score: Score, show_errors: bool) -> list[str]:
    labels = sorted(set(score.labelled) | set(score.predicted))
    lines = [f"{'label':12} {'found':>16} {'correct':>16}"]
    for label in labels:
        found = f"{pct(score.found[label], score.labelled[label])} ({score.found[label]}/{score.labelled[label]})"
        correct = f"{pct(score.correct[label], score.predicted[label])} ({score.correct[label]}/{score.predicted[label]})"
        lines.append(f"{label:12} {found:>16} {correct:>16}")
    if show_errors:
        for title, errors in (("  missed", score.misses), ("  extra", score.extras)):
            for label in sorted(errors):
                if errors[label]:
                    items = ", ".join(f"{t!r} x{n}" for t, n in errors[label].most_common())
                    lines.append(f"{title} {label}: {items}")
    return lines


def report(filtered: Score, kept: Kept, extraction: Score, redaction: str, show_errors: bool) -> str:
    lines = []
    if redaction == "filter":
        lines += ["1. Personal-details filter"] + table(filtered, show_errors) + [""]
        lines.append(f"2. Facts kept after filtering: {pct(kept.kept, kept.total)} ({kept.kept}/{kept.total})")
        if show_errors and kept.lost:
            lines.append("  hidden: " + ", ".join(f"{t} x{n}" for t, n in kept.lost.most_common()))
        lines += ["", "3. Fact extraction on the filtered text"]
    else:
        lines += ["Fact extraction (labelled details swapped for placeholders)"]
    lines += table(extraction, show_errors)
    if redaction == "filter":
        lines += ["", TARGETS]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("cases", nargs="?", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--errors", action="store_true", help="list missed and extra items")
    parser.add_argument(
        "--redaction", choices=["filter", "labels"], default="filter",
        help="run the real filter (default) or swap labelled details for placeholders",
    )
    args = parser.parse_args()

    cases = [json.loads(line) for line in args.cases.read_text().splitlines() if line.strip()]
    print(f"{args.cases.name}: {len(cases)} cases\n")
    print(report(*score_cases(cases, args.redaction), args.redaction, args.errors))


if __name__ == "__main__":
    main()
