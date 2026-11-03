"""Score fact extraction (T16) against labelled cases.

    cd api && source .venv/bin/activate
    python scripts/score_pipeline.py                      # build set
    python scripts/score_pipeline.py --errors             # also list misses and extras
    python scripts/score_pipeline.py path/to/cases.jsonl

For each label it reports:
- found:   share of labelled facts the extractor found (recall)
- correct: share of the extractor's facts that match a label (precision)

A fact counts as found when a prediction with the same label overlaps it, so
"around 9:30 PM" labelled and "9:30 PM" predicted is a match.

Extraction runs on redacted text in the app. Until the personal-details
filter (T15) is ready, this script makes that text itself by swapping each
labelled personal detail for a placeholder like <PHONE_1>.

Tune patterns on the build set only. Score the held-out set once, at the end.
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

DEFAULT_CASES = Path(__file__).resolve().parents[2] / "data" / "synthetic" / "build_set.jsonl"

Span = tuple[str, int, int]  # (label, start, end)


@dataclass
class Score:
    labelled: Counter = field(default_factory=Counter)
    found: Counter = field(default_factory=Counter)
    predicted: Counter = field(default_factory=Counter)
    correct: Counter = field(default_factory=Counter)
    misses: dict = field(default_factory=lambda: defaultdict(Counter))
    extras: dict = field(default_factory=lambda: defaultdict(Counter))


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


def move(offset: int, shifts: list[dict]) -> int:
    return offset + sum(s["shift"] for s in shifts if s["end"] <= offset)


def overlaps(a: Span, b: Span) -> bool:
    return a[0] == b[0] and a[1] < b[2] and b[1] < a[2]


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


def score_cases(cases: list[dict]) -> Score:
    score = Score()
    for case in cases:
        labels = case["labels"]
        text, shifts = placeholder_redact(case["narrative"], labels.get("pii", []))
        labelled = [
            (e["label"], move(e["start"], shifts), move(e["end"], shifts))
            for e in labels.get("entities", [])
        ]
        score_case(text, labelled, fact_spans(text), score)
    return score


def pct(part: int, whole: int) -> str:
    return f"{part / whole:.0%}" if whole else "-"


def report(score: Score, show_errors: bool) -> str:
    labels = sorted(set(score.labelled) | set(score.predicted))
    lines = [f"{'label':10} {'found':>16} {'correct':>16}"]
    for label in labels:
        found = f"{pct(score.found[label], score.labelled[label])} ({score.found[label]}/{score.labelled[label]})"
        correct = f"{pct(score.correct[label], score.predicted[label])} ({score.correct[label]}/{score.predicted[label]})"
        lines.append(f"{label:10} {found:>16} {correct:>16}")
    if show_errors:
        for title, errors in (("Missed", score.misses), ("Extra", score.extras)):
            for label in sorted(errors):
                items = ", ".join(f"{t!r} x{n}" for t, n in errors[label].most_common())
                lines.append(f"{title} {label}: {items}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("cases", nargs="?", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--errors", action="store_true", help="list missed and extra facts")
    args = parser.parse_args()

    cases = [json.loads(line) for line in args.cases.read_text().splitlines() if line.strip()]
    print(f"Fact extraction on {args.cases.name} ({len(cases)} cases)\n")
    print(report(score_cases(cases), args.errors))


if __name__ == "__main__":
    main()
