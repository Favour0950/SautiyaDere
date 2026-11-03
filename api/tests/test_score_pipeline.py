from scripts.score_pipeline import (
    Score,
    filter_redact,
    move,
    placeholder_redact,
    score_case,
    score_cases,
)


def test_placeholders_replace_personal_details_and_keep_fact_offsets():
    narrative = "Call 0712345678 at Westlands, rider Wanjiku paid KSh 500."
    pii = [
        {"label": "PHONE", "start": 5, "end": 15},
        {"label": "PERSON", "start": 36, "end": 43},
    ]
    text, shifts = placeholder_redact(narrative, pii)
    assert text == "Call <PHONE_1> at Westlands, rider <PERSON_1> paid KSh 500."
    start, end = narrative.index("KSh 500"), narrative.index("KSh 500") + 7
    assert text[move(start, shifts):move(end, shifts)] == "KSh 500"
    start = narrative.index("Westlands")
    assert text[move(start, shifts):move(start + 9, shifts)] == "Westlands"


def test_repeated_labels_get_numbered_placeholders():
    text, _ = placeholder_redact("KDC 638T then KDF 516R", [
        {"label": "PLATE", "start": 0, "end": 8},
        {"label": "PLATE", "start": 14, "end": 22},
    ])
    assert text == "<PLATE_1> then <PLATE_2>"


def test_overlap_counts_as_found_and_wrong_label_does_not():
    text = "around 9:30 PM at CBD"
    score = Score()
    labelled = [("TIME", 0, 14), ("LOCATION", 18, 21)]
    predicted = [("TIME", 7, 14), ("DATE", 18, 21)]
    score_case(text, labelled, predicted, score)
    assert score.found == {"TIME": 1}
    assert score.labelled == {"TIME": 1, "LOCATION": 1}
    assert score.correct == {"TIME": 1}
    assert score.extras["DATE"] == {"CBD": 1}
    assert score.misses["LOCATION"] == {"CBD": 1}


CASE = {
    "narrative": "Sunday 11th at Westlands, rider Wanjiku, plate KDC 638T, paid KSh 500.",
    "labels": {
        "entities": [
            {"label": "DATE", "start": 0, "end": 11},
            {"label": "LOCATION", "start": 15, "end": 24},
            {"label": "MONEY", "start": 62, "end": 69},
        ],
        "pii": [
            {"label": "PERSON", "start": 32, "end": 39},
            {"label": "PLATE", "start": 47, "end": 55},
        ],
    },
}


def test_filter_redact_offsets_match_the_real_filter():
    narrative = CASE["narrative"]
    detected = [("PERSON", 32, 39), ("PLATE", 47, 55)]
    text, shifts = filter_redact(narrative, detected)
    start = narrative.index("KSh 500")
    assert text[move(start, shifts):move(start + 7, shifts)] == "KSh 500"


def test_scores_a_labelled_case_end_to_end():
    for redaction in ("filter", "labels"):
        filtered, kept, extraction = score_cases([CASE], redaction)
        assert extraction.found == extraction.labelled == {"DATE": 1, "LOCATION": 1, "MONEY": 1}
        assert not any(extraction.extras.values())
        assert kept.kept == kept.total == 3
    filtered, _, _ = score_cases([CASE], "filter")
    assert filtered.found == filtered.labelled == {"PERSON": 1, "PLATE": 1}


def test_a_fact_hidden_by_the_filter_counts_as_lost():
    case = {
        "narrative": "Met him at Westlands.",
        "labels": {"entities": [{"label": "LOCATION", "start": 11, "end": 20}], "pii": []},
    }
    # Pretend the labels marked the place as a personal detail.
    case["labels"]["pii"] = [{"label": "PERSON", "start": 11, "end": 20}]
    _, kept, extraction = score_cases([case], "labels")
    assert kept.kept == 0 and kept.total == 1
    assert extraction.found == {} and extraction.labelled == {"LOCATION": 1}
