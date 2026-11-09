"""Tests for Africa's Talking OTP, Driver Feedback, Telemetry, and Admin Dashboard."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.main import (
    admin_dashboard,
    get_admin_data,
    record_telemetry,
    send_otp,
    submit_feedback,
    verify_phone_otp,
)
from app.schemas import (
    FeedbackRequest,
    SendOtpRequest,
    TelemetryPing,
    VerifyOtpRequest,
)
from app.services.otp import _OTP_STORE, generate_otp, verify_otp
from app.services.store import add_feedback, add_telemetry, get_telemetry_stats


def test_otp_generation_and_verification():
    phone = "+254712345678"
    code = generate_otp(phone)
    assert len(code) == 4
    assert code.isdigit()

    # Wrong code should fail
    valid, msg = verify_otp(phone, "0000")
    assert not valid
    assert "Incorrect" in msg

    # Correct code should succeed
    valid, msg = verify_otp(phone, code)
    assert valid
    assert "successfully verified" in msg

    # Re-using code should fail (single-use)
    valid, msg = verify_otp(phone, code)
    assert not valid
    assert "No active verification code" in msg


@patch("app.main.send_otp_sms")
def test_api_send_and_verify_otp(mock_send_sms):
    mock_send_sms.return_value = {"status": "success"}
    phone = "0712345678"

    # 1. Send OTP
    res = send_otp(SendOtpRequest(phone_number=phone))
    assert res.status == "sent"
    assert res.recipient == "+254712345678"
    mock_send_sms.assert_called_once()

    # Fetch code from store
    code = _OTP_STORE["+254712345678"]["code"]

    # 2. Verify OTP
    vdata = verify_phone_otp(VerifyOtpRequest(phone_number=phone, otp=code))
    assert vdata.verified is True
    assert vdata.status == "success"


def test_api_feedback_submission():
    payload = FeedbackRequest(
        rating=5,
        comments="DereBot helped me draft my appeal instantly!",
        phone="+254712345678",
        platform="Bolt",
    )
    res = submit_feedback(payload)
    assert res.status == "success"
    assert res.feedback_id is not None


def test_api_telemetry_ping():
    payload = TelemetryPing(
        platform="Uber",
        predicted_case_type="fare_dispute",
        model_confidence=0.94,
        inversion_override=False,
        entities_detected_count=4,
        readiness_score=100,
    )
    res = record_telemetry(payload)
    assert res.status == "success"
    assert res.event_id is not None


def test_admin_dashboard_auth():
    # 1. Unauthenticated request should fail
    with pytest.raises(HTTPException) as exc1:
        get_admin_data(x_admin_passkey=None, passkey=None)
    assert exc1.value.status_code == 401

    # 2. Wrong passkey should fail
    with pytest.raises(HTTPException) as exc2:
        get_admin_data(x_admin_passkey="wrong_key", passkey=None)
    assert exc2.value.status_code == 401

    # 3. Correct passkey should return data (via header or query param)
    data1 = get_admin_data(x_admin_passkey="dere2026", passkey=None)
    assert "stats" in data1
    assert "telemetry" in data1
    assert "feedback" in data1
    assert "sms_logs" in data1

    data2 = get_admin_data(x_admin_passkey=None, passkey="dere2026")
    assert "stats" in data2
    assert "telemetry" in data2

    # 4. Admin Dashboard HTML renders
    html_res = admin_dashboard()
    assert html_res.status_code == 200
    assert "Admin Console Login" in html_res.body.decode("utf-8")
    assert "No Africa&apos;s Talking SMS events logged yet." in html_res.body.decode("utf-8")


