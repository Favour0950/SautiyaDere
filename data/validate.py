"""Validate case records against data/schema.json plus checks JSON Schema can't express.

Usage:
    python validate.py examples/            # every *.json in a folder
    python validate.py synthetic/cases.jsonl
    python validate.py a.json b.json

Exit code 0 when every record is valid, 1 otherwise.
"""

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.json"
_validator = Draft202012Validator(
    json.loads(SCHEMA_PATH.read_text()), format_checker=FormatChecker()
)


def check_record(record: dict) -> list[str]:
    """Return a list of problems; empty means valid."""
    errors = [
        f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
        for e in _validator.iter_errors(record)
    ]
    if errors:
        return errors  # semantic checks assume the shape is right

    text = record["narrative"]
    labels = record["labels"]
    spans = []
    for kind in ("entities", "pii"):
        for i, span in enumerate(labels[kind]):
            where = f"labels/{kind}/{i}"
            start, end = span["start"], span["end"]
            if not (0 <= start < end <= len(text)):
                errors.append(f"{where}: span {start}-{end} outside narrative (length {len(text)})")
            elif text[start:end] != span["text"]:
                errors.append(
                    f"{where}: narrative[{start}:{end}] is {text[start:end]!r}, not {span['text']!r}"
                    f" (found at {text.find(span['text'])})"
                )
            spans.append((start, end, where))

    spans.sort()
    for (s1, e1, w1), (s2, e2, w2) in zip(spans, spans[1:]):
        if s2 < e1:
            errors.append(f"{w1} and {w2} overlap")

    both = set(record["evidence_held"]) & set(labels["evidence_missing"])
    if both:
        errors.append(f"evidence both held and missing: {sorted(both)}")
    return errors


def load_records(path: Path) -> list[tuple[str, dict]]:
    if path.is_dir():
        return [(str(p), json.loads(p.read_text())) for p in sorted(path.glob("*.json"))]
    if path.suffix == ".jsonl":
        return [
            (f"{path}:{n}", json.loads(line))
            for n, line in enumerate(path.read_text().splitlines(), 1)
            if line.strip()
        ]
    return [(str(path), json.loads(path.read_text()))]


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    bad = total = 0
    for arg in argv:
        for name, record in load_records(Path(arg)):
            total += 1
            problems = check_record(record)
            if problems:
                bad += 1
                print(f"FAIL {name}")
                for p in problems:
                    print(f"  - {p}")
    print(f"{total - bad}/{total} records valid")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
