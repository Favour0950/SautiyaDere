from scripts.score_pipeline import Score, move, placeholder_redact, score_case, score_cases


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


def test_scores_a_labelled_case_end_to_end():
    narrative = "Sunday 11th at Westlands, plate KDC 638T."
    case = {
        "narrative": narrative,
        "labels": {
            "entities": [
                {"label": "DATE", "start": 0, "end": 11},
                {"label": "LOCATION", "start": 15, "end": 24},
            ],
            "pii": [{"label": "PLATE", "start": 32, "end": 40}],
        },
    }
    score = score_cases([case])
    assert score.found == score.labelled == {"DATE": 1, "LOCATION": 1}
    assert not any(score.extras.values())
