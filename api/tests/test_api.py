import logging

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

MARKER = "SECRET-NARRATIVE-0712345678"


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_analyze_stub_accepts_valid_body():
    res = client.post(
        "/analyze",
        json={
            "narrative": "Passenger refused to pay the full fare.",
            "platform": "Bolt",
            "evidence_held": ["suspension notice"],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["stub"] is True
    assert data["case_type"] is None
    assert data["entities"] == []


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
