"""Africa's Talking SMS Service for Sauti ya Dere.

Dispatches statutory timeline reminders to drivers in compliance with
NTSA Legal Notice 120 Regulation 15 (30-day statutory response window).
"""

import logging
import os
import re

import africastalking

from ..config import settings

logger = logging.getLogger(__name__)


def normalize_kenyan_phone(phone_number: str) -> str:
    """Normalize a phone number to Kenyan E.164 format (+254...).

    Accepts formats such as:
    - 0712345678 -> +254712345678
    - 0112345678 -> +254112345678
    - 712345678  -> +254712345678
    - 254712345678 -> +254712345678
    - +254712345678 -> +254712345678
    - Numbers with spaces/dashes: +254 712-345 678 -> +254712345678
    """
    cleaned = re.sub(r"[\s\-\(\)\.]", "", str(phone_number).strip())
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]

    if cleaned.startswith("0") and len(cleaned) == 10:
        cleaned = "254" + cleaned[1:]
    elif not cleaned.startswith("254") and len(cleaned) == 9:
        cleaned = "254" + cleaned

    return f"+{cleaned}"


def send_timeline_reminder(
    phone_number: str,
    case_ref: str,
    days_remaining: int,
) -> dict:
    """Send an NTSA LN 120 timeline reminder SMS to a driver.

    Message format:
    'Sauti ya Dere Alert: Case {case_ref} is on Day {30 - days_remaining}
    of the 30-day NTSA LN 120 statutory window. Awaiting platform response.'

    If credentials are unset or the API raises an error, logs a warning
    and returns a graceful status dict without crashing.
    """
    normalized_phone = normalize_kenyan_phone(phone_number)
    day_number = max(0, 30 - int(days_remaining))
    message = (
        f"Sauti ya Dere Alert: Case {case_ref} is on Day {day_number} "
        f"of the 30-day NTSA LN 120 statutory window. Awaiting platform response."
    )

    username = (
        os.getenv("AFRICASTALKING_USERNAME")
        or settings.africastalking_username
        or "sandbox"
    )
    api_key = os.getenv("AFRICASTALKING_API_KEY") or settings.africastalking_api_key

    if not api_key or not api_key.strip():
        logger.warning(
            "AFRICASTALKING_API_KEY is not configured. Skipping SMS delivery to %s",
            normalized_phone,
        )
        return {
            "status": "skipped",
            "reason": "credentials_unset",
            "recipient": normalized_phone,
            "message": message,
        }

    try:
        africastalking.initialize(username, api_key)
        sms = africastalking.SMS
        response = sms.send(message, [normalized_phone])
        logger.info("Successfully sent SMS reminder to %s: %s", normalized_phone, response)
        return {
            "status": "success",
            "recipient": normalized_phone,
            "message": message,
            "response": response,
        }
    except Exception as exc:
        logger.warning(
            "Africa's Talking SMS delivery failed for %s: %s",
            normalized_phone,
            exc,
        )
        return {
            "status": "failed",
            "error": str(exc),
            "recipient": normalized_phone,
            "message": message,
        }
