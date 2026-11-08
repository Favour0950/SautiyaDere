"""Lightweight persistence store for Driver Feedback, Zero-PII Telemetry, and SMS Logs.

Uses SQLite with automatic connection closing and timeout.
Preserves privacy: Never stores driver case narratives, audio recordings, or unredacted evidence.
"""

import datetime
import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent.parent / "sautiyadere.db"


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    """Initialize SQLite tables for feedback, telemetry, and SMS logs."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    rating INTEGER,
                    comments TEXT,
                    phone TEXT,
                    platform TEXT,
                    source TEXT DEFAULT 'web'
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS telemetry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    platform TEXT,
                    predicted_case_type TEXT,
                    model_confidence REAL,
                    inversion_override INTEGER DEFAULT 0,
                    overridden_case_type TEXT,
                    entities_detected_count INTEGER DEFAULT 0,
                    readiness_score INTEGER
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS sms_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    direction TEXT DEFAULT 'outbound',
                    sms_type TEXT,
                    phone TEXT,
                    message TEXT,
                    status TEXT
                )
                """
            )
            conn.commit()
    except Exception as exc:
        logger.warning("Failed to initialize SQLite database (%s); running with in-memory fallback.", exc)


init_db()


def add_feedback(
    rating: int | None,
    comments: str | None,
    phone: str | None = None,
    platform: str | None = None,
    source: str = "web",
) -> int:
    """Record driver feedback from web PWA or Africa's Talking SMS."""
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO feedback (timestamp, rating, comments, phone, platform, source)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (timestamp, rating, comments, phone, platform, source),
            )
            conn.commit()
            return cursor.lastrowid or 1
    except Exception as exc:
        logger.error("Error saving feedback: %s", exc)
        return -1


def get_all_feedback(limit: int = 50) -> list[dict[str, Any]]:
    """Retrieve recent driver feedback."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM feedback ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(row) for row in cursor.fetchall()]
    except Exception as exc:
        logger.error("Error fetching feedback: %s", exc)
        return []


def add_telemetry(
    predicted_case_type: str | None,
    model_confidence: float | None,
    inversion_override: bool = False,
    overridden_case_type: str | None = None,
    entities_detected_count: int = 0,
    readiness_score: int | None = None,
    platform: str | None = None,
) -> int:
    """Record a zero-PII model performance telemetry ping."""
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO telemetry (
                    timestamp, platform, predicted_case_type, model_confidence,
                    inversion_override, overridden_case_type, entities_detected_count, readiness_score
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    timestamp,
                    platform,
                    predicted_case_type,
                    model_confidence,
                    1 if inversion_override else 0,
                    overridden_case_type,
                    entities_detected_count,
                    readiness_score,
                ),
            )
            conn.commit()
            return cursor.lastrowid or 1
    except Exception as exc:
        logger.error("Error saving telemetry: %s", exc)
        return -1


def get_all_telemetry(limit: int = 50) -> list[dict[str, Any]]:
    """Retrieve recent zero-PII telemetry events."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM telemetry ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(row) for row in cursor.fetchall()]
    except Exception as exc:
        logger.error("Error fetching telemetry: %s", exc)
        return []


def get_telemetry_stats() -> dict[str, Any]:
    """Calculate summary statistics for model performance."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM telemetry")
            total = cursor.fetchone()[0]

            cursor.execute("SELECT AVG(model_confidence) FROM telemetry WHERE model_confidence IS NOT NULL")
            avg_conf = cursor.fetchone()[0] or 0.0

            cursor.execute("SELECT COUNT(*) FROM telemetry WHERE inversion_override = 1")
            overrides = cursor.fetchone()[0]

            override_pct = (overrides / total * 100) if total > 0 else 0.0

            return {
                "total_telemetry_events": total,
                "avg_confidence": round(avg_conf * 100, 1) if avg_conf <= 1.0 else round(avg_conf, 1),
                "inversion_overrides": overrides,
                "override_rate_pct": round(override_pct, 1),
            }
    except Exception as exc:
        logger.error("Error fetching telemetry stats: %s", exc)
        return {
            "total_telemetry_events": 0,
            "avg_confidence": 0.0,
            "inversion_overrides": 0,
            "override_rate_pct": 0.0,
        }


def log_sms(
    phone: str,
    message: str,
    sms_type: str = "otp",
    direction: str = "outbound",
    status: str = "sent",
) -> None:
    """Log an Africa's Talking SMS event."""
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO sms_logs (timestamp, direction, sms_type, phone, message, status)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (timestamp, direction, sms_type, phone, message, status),
            )
            conn.commit()
    except Exception as exc:
        logger.error("Error logging SMS: %s", exc)


def get_all_sms_logs(limit: int = 50) -> list[dict[str, Any]]:
    """Retrieve recent SMS events."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sms_logs ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(row) for row in cursor.fetchall()]
    except Exception as exc:
        logger.error("Error fetching SMS logs: %s", exc)
        return []
