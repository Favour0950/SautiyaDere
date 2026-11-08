"""Africa's Talking SMS Service for Sauti ya Dere.

Handles:
1. Dynamic OTP verification SMS dispatch.
2. NTSA Legal Notice 120 Regulation 15 statutory timeline reminders.
3. Africa's Talking shared shortcode 20384 keyword routing and logs.
"""

import logging
import os
import re

try:
    import africastalking
except ImportError:
    africastalking = None

from ..config import settings
from .store import log_sms

logger = logging.getLogger(__name__)


def normalize_phone_number(phone_number: str) -> str:
    """Normalize any phone number into E.164 format.

    Supports:
    - 0712345678 -> +254712345678 (Kenyan 07xx)
    - 0112345678 -> +254112345678 (Kenyan 01xx)
    - 712345678  -> +254712345678 (9-digit local)
    - 254712345678 -> +254712345678
    - +254712345678 -> +254712345678
    - East Africa cross-border:
      - +256712345678 (Uganda) -> +256712345678
      - +255712345678 (Tanzania) -> +255712345678
      - +250712345678 (Rwanda) -> +250712345678
    """
    cleaned = re.sub(r"[\s\-\(\)\.]", "", str(phone_number).strip())
    if cleaned.startswith("+"):
        return cleaned

    # Check Kenyan local prefixes
    if (cleaned.startswith("07") or cleaned.startswith("01")) and len(cleaned) == 10:
        return "+254" + cleaned[1:]
    if (cleaned.startswith("7") or cleaned.startswith("1")) and len(cleaned) == 9:
        return "+254" + cleaned
    if cleaned.startswith("254") and len(cleaned) == 12:
        return "+" + cleaned
    if cleaned.startswith("256") or cleaned.startswith("255") or cleaned.startswith("250"):
        return "+" + cleaned

    # Default fallback: add + if missing
    return f"+{cleaned}"


# Backward compatibility alias
normalize_kenyan_phone = normalize_phone_number


def send_sms_direct(phone_number: str, message: str, sms_type: str = "general") -> dict:
    """Send an SMS via Africa's Talking gateway and record in delivery log."""
    normalized_phone = normalize_phone_number(phone_number)

    # In test environments, mock delivery immediately to avoid blocking on socket timeouts
    if os.getenv("TESTING") == "1" or os.getenv("PYTEST_CURRENT_TEST"):
        logger.info("Test environment detected; simulating SMS to %s", normalized_phone)
        log_sms(
            phone=normalized_phone,
            message=message,
            sms_type=sms_type,
            direction="outbound",
            status="test_mocked",
        )
        return {
            "status": "success",
            "recipient": normalized_phone,
            "message": message,
            "response": {"mock": True},
        }

    if not africastalking:
        logger.warning(
            "africastalking library not installed in environment. Simulating SMS to %s: %s",
            normalized_phone,
            message,
        )
        log_sms(
            phone=normalized_phone,
            message=message,
            sms_type=sms_type,
            direction="outbound",
            status="simulated_no_library",
        )
        return {
            "status": "simulated",
            "reason": "library_not_installed",
            "recipient": normalized_phone,
            "message": message,
        }

    username = (
        os.getenv("AFRICASTALKING_USERNAME")
        or settings.africastalking_username
        or "buildathon-voice"
    )
    api_key = os.getenv("AFRICASTALKING_API_KEY") or settings.africastalking_api_key

    if not api_key or not api_key.strip():
        logger.warning(
            "AFRICASTALKING_API_KEY is not configured. Simulating SMS delivery to %s: %s",
            normalized_phone,
            message,
        )
        log_sms(
            phone=normalized_phone,
            message=message,
            sms_type=sms_type,
            direction="outbound",
            status="simulated_no_credentials",
        )
        return {
            "status": "simulated",
            "reason": "credentials_unset",
            "recipient": normalized_phone,
            "message": message,
        }

    try:
        africastalking.initialize(username, api_key)
        sms = africastalking.SMS
        shortcode = settings.africastalking_shortcode or "20384"
        try:
            response = sms.send(message, [normalized_phone], sender_id=shortcode)
        except Exception:
            # Fallback to default sender_id if shortcode delivery raises error
            response = sms.send(message, [normalized_phone])
        logger.info("Successfully sent SMS (%s) to %s: %s", sms_type, normalized_phone, response)
        log_sms(
            phone=normalized_phone,
            message=message,
            sms_type=sms_type,
            direction="outbound",
            status="delivered",
        )
        return {
            "status": "success",
            "recipient": normalized_phone,
            "message": message,
            "response": response,
        }
    except Exception as exc:
        logger.warning("Africa's Talking SMS delivery failed for %s: %s", normalized_phone, exc)
        log_sms(
            phone=normalized_phone,
            message=message,
            sms_type=sms_type,
            direction="outbound",
            status=f"error: {str(exc)[:100]}",
        )
        return {
            "status": "failed",
            "error": str(exc),
            "recipient": normalized_phone,
            "message": message,
        }


def send_otp_sms(phone_number: str, otp_code: str) -> dict:
    """Dispatch a 4-digit verification code to the driver."""
    message = (
        f"Sauti ya Dere: Your driver verification code is {otp_code}. "
        f"Valid for 5 minutes. Do not share this code."
    )
    return send_sms_direct(phone_number, message, sms_type="otp")


def send_timeline_reminder(
    phone_number: str,
    case_ref: str,
    days_remaining: int,
) -> dict:
    """Send an NTSA LN 120 timeline reminder SMS to a driver."""
    day_number = max(0, 30 - int(days_remaining))
    message = (
        f"Sauti ya Dere Alert: Case {case_ref} is on Day {day_number} "
        f"of the 30-day NTSA LN 120 statutory window. Awaiting platform response."
    )
    return send_sms_direct(phone_number, message, sms_type="timeline_reminder")
