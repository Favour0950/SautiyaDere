"""Settings read from environment variables. Nothing secret lives in the code."""

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # Comma-separated list of front-end origins allowed to call the API.
    cors_origins: list[str] = field(
        default_factory=lambda: _split(
            os.getenv("CORS_ORIGINS", "http://localhost:5173")
        )
    )
    # Key for the AI service (T05). Only ever held by the backend.
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY") or None

    # Africa's Talking SMS Credentials
    africastalking_username: str = os.getenv("AFRICASTALKING_USERNAME", "buildathon-voice")
    africastalking_api_key: str | None = os.getenv(
        "AFRICASTALKING_API_KEY",
        "atsk_cc2a04e75e8d2f7c5626e8c98681252513425f3284069e6cf7c00378aa152c4b16631d38",
    )
    africastalking_shortcode: str = os.getenv("AFRICASTALKING_SHORTCODE", "20384")

    # Admin Dashboard Passkey
    admin_passkey: str = os.getenv("ADMIN_PASSKEY", "dere2026")


settings = Settings()
