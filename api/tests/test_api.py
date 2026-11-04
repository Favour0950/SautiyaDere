import logging

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

MARKER = "SECRET-NARRATIVE-0712345678"


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_analyze_runs_full_pipeline():
    res = client.post(
        "/analyze",
        json={
            "narrative": "On Friday around 8:30pm from Westlands to Syokimau, rider Wanjiku (0712 345 678) refused to pay the KSh 1,450 fare.",
            "platform": "Bolt",
            "evidence_held": ["EVID-TRIP-RECEIPT"],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["stub"] is False
    assert "<PHONE_1>" in data["redacted_narrative"]
    assert data["classification"]["case_type"] in (
        "fare_dispute",
        "passenger_safety",
        "rating_or_cancellation",
        "fraud_flag",
    )
    assert len(data["entities"]) >= 1
    assert data["evidence"]["readiness"] is not None
    assert len(data["appeal"]["policy_rules"]) >= 1
    assert data["appeal"]["body"] is not None


def test_api_analyze_prefix_and_field_aliases():
    res = client.post(
        "/api/analyze",
        json={
            "platform": "Bolt",
            "selected_notice_type": "Safety Violation",
            "narrative": "Picked up client around 9:30 PM Tuesday at Westlands.",
            "attached_evidence_keys": ["trip_receipt_screenshot.png"],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["stub"] is False
    assert set(data) == {
        "stub",
        "redacted_narrative",
        "classification",
        "entities",
        "evidence",
        "appeal",
    }


def test_analyze_response_has_all_sections():
    data = client.post("/analyze", json={"narrative": "x"}).json()
    assert set(data) == {
        "stub",
        "redacted_narrative",
        "classification",
        "entities",
        "evidence",
        "appeal",
    }


def test_analyze_rejects_missing_narrative():
    res = client.post("/analyze", json={"platform": "Uber"})
    assert res.status_code == 422


def test_validation_error_does_not_echo_input():
    res = client.post("/analyze", json={"narrative": MARKER, "platform": "NotAnApp"})
    assert res.status_code == 422
    assert MARKER not in res.text


def test_request_body_not_logged(caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/analyze", json={"narrative": MARKER})
        client.post("/analyze", json={"narrative": MARKER, "platform": "bad"})
    assert MARKER not in caplog.text
