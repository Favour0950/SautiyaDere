"""Settings read from environment variables. Nothing secret lives in the code."""

import os
from dataclasses import dataclass, field


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


settings = Settings()
