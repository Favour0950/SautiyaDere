"""Unit tests for Africa's Talking SMS reminder service and phone normalization."""

from unittest.mock import MagicMock, patch

import pytest

from app.main import notify_sms
from app.schemas import SmsReminderRequest, SmsReminderResponse
from app.services.sms import normalize_kenyan_phone, send_timeline_reminder


class TestPhoneNormalization:
    """Verifies all standard Kenyan phone number variants normalize to E.164 (+254...)."""

    def test_standard_07_format(self):
        assert normalize_kenyan_phone("0712345678") == "+254712345678"

    def test_standard_01_format(self):
        assert normalize_kenyan_phone("0112345678") == "+254112345678"

    def test_nine_digit_format(self):
        assert normalize_kenyan_phone("712345678") == "+254712345678"

    def test_254_without_plus(self):
        assert normalize_kenyan_phone("254712345678") == "+254712345678"

    def test_full_e164_with_plus(self):
        assert normalize_kenyan_phone("+254712345678") == "+254712345678"

    def test_spaces_and_hyphens(self):
        assert normalize_kenyan_phone("+254 712-345 678") == "+254712345678"
        assert normalize_kenyan_phone(" 0712 345 678 ") == "+254712345678"
        assert normalize_kenyan_phone("(0712) 345-678") == "+254712345678"


class TestSendTimelineReminder:
    """Verifies statutory message composition, mock API dispatch, and graceful error handling."""

    def test_message_composition_and_day_calculation(self):
        mock_settings = MagicMock(africastalking_username="sandbox", africastalking_api_key="fake_api_key")
        with patch.dict("os.environ", {"AFRICASTALKING_API_KEY": "fake_api_key"}), \
             patch("app.services.sms.settings", mock_settings), \
             patch("africastalking.initialize") as mock_init, \
             patch("africastalking.SMS") as mock_sms:

            mock_sms.send.return_value = {"SMSMessageData": {"Recipients": [{"status": "Success"}]}}

            result = send_timeline_reminder(
                phone_number="0712345678",
                case_ref="SYD-APP-2026-0042",
                days_remaining=25,
            )

            assert result["status"] == "success"
            assert result["recipient"] == "+254712345678"
            expected_msg = (
                "Sauti ya Dere Alert: Case SYD-APP-2026-0042 is on Day 5 of the "
                "30-day NTSA LN 120 statutory window. Awaiting platform response."
            )
            assert result["message"] == expected_msg
            mock_init.assert_called_once_with("sandbox", "fake_api_key")
            mock_sms.send.assert_called_once_with(expected_msg, ["+254712345678"])

    def test_unset_credentials_gracefully_skips(self):
        mock_settings = MagicMock(africastalking_username="sandbox", africastalking_api_key=None)
        with patch.dict("os.environ", {}, clear=True), \
             patch("app.services.sms.settings", mock_settings), \
             patch("africastalking.SMS") as mock_sms:

            result = send_timeline_reminder(
                phone_number="0712345678",
                case_ref="SYD-APP-2026-0042",
                days_remaining=10,
            )

            assert result["status"] == "skipped"
            assert result["reason"] == "credentials_unset"
            assert result["recipient"] == "+254712345678"
            mock_sms.send.assert_not_called()

    def test_api_exception_handled_gracefully(self):
        mock_settings = MagicMock(africastalking_username="sandbox", africastalking_api_key="valid_key")
        with patch.dict("os.environ", {"AFRICASTALKING_API_KEY": "valid_key"}), \
             patch("app.services.sms.settings", mock_settings), \
             patch("africastalking.initialize"), \
             patch("africastalking.SMS") as mock_sms:

            mock_sms.send.side_effect = RuntimeError("Africa's Talking gateway connection timeout")

            result = send_timeline_reminder(
                phone_number="0799112233",
                case_ref="SYD-APP-2026-0088",
                days_remaining=5,
            )

            assert result["status"] == "failed"
            assert "Africa's Talking gateway connection timeout" in result["error"]
            assert result["recipient"] == "+254799112233"


class TestFastApiNotifySmsEndpoint:
    """Tests the /api/notify/sms endpoint request and response contract."""

    def test_endpoint_invokes_service_and_returns_schema(self):
        with patch("app.main.send_timeline_reminder") as mock_service:
            mock_service.return_value = {
                "status": "success",
                "recipient": "+254712345678",
                "message": "Sauti ya Dere Alert: Case SYD-101 is on Day 18 of the 30-day NTSA LN 120 statutory window.",
                "response": {"status": "sent"},
            }

            body = SmsReminderRequest(
                phone_number="0712345678",
                case_ref="SYD-101",
                days_remaining=12,
            )

            response = notify_sms(body)

            assert isinstance(response, SmsReminderResponse)
            assert response.status == "success"
            assert response.recipient == "+254712345678"
            assert "Day 18" in response.message
            mock_service.assert_called_once_with(
                phone_number="0712345678",
                case_ref="SYD-101",
                days_remaining=12,
            )
