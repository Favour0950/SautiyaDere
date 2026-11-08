"""In-memory OTP generator and validator with Time-To-Live (TTL).

Security & Privacy:
- Generates 4-digit numeric OTPs.
- Expires after 5 minutes (300 seconds).
- Validates and immediately burns the OTP on successful verification (single-use).
"""

import logging
import random
import time
from typing import TypedDict

logger = logging.getLogger(__name__)


class OtpRecord(TypedDict):
    code: str
    expires_at: float
    attempts: int


# Key: normalized_phone -> OtpRecord
_OTP_STORE: dict[str, OtpRecord] = {}
TTL_SECONDS = 300  # 5 minutes
MAX_ATTEMPTS = 5


def generate_otp(phone_number: str) -> str:
    """Generate a 4-digit OTP, store it with TTL, and return the code."""
    # Generate 4-digit code between 1000 and 9999
    code = f"{random.randint(1000, 9999)}"
    expires_at = time.time() + TTL_SECONDS
    _OTP_STORE[phone_number] = {
        "code": code,
        "expires_at": expires_at,
        "attempts": 0,
    }
    logger.info("Generated OTP for %s (expires in %ds)", phone_number, TTL_SECONDS)
    return code


def verify_otp(phone_number: str, submitted_code: str) -> tuple[bool, str]:
    """Verify an OTP for a given phone number.

    Returns (is_valid, reason_message).
    """
    record = _OTP_STORE.get(phone_number)
    if not record:
        return False, "No active verification code found for this number. Please request a new code."

    now = time.time()
    if now > record["expires_at"]:
        _OTP_STORE.pop(phone_number, None)
        return False, "Verification code has expired. Please request a new code."

    record["attempts"] += 1
    if record["attempts"] > MAX_ATTEMPTS:
        _OTP_STORE.pop(phone_number, None)
        return False, "Too many failed attempts. Please request a new verification code."

    # Compare stripped strings
    if record["code"].strip() == submitted_code.strip():
        # Burn OTP so it cannot be reused
        _OTP_STORE.pop(phone_number, None)
        return True, "Phone number successfully verified."

    remaining = MAX_ATTEMPTS - record["attempts"]
    return False, f"Incorrect verification code. {remaining} attempt(s) remaining."
