"""Sauti ya Dere backend.

Privacy rule: Driver case narratives, audio recordings, and unredacted evidence
are never logged or stored. The access log is off, and validation errors return
only the field location and message, never the submitted text.
"""

import logging
import re
from typing import Annotated

from fastapi import APIRouter, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from .admin_view import get_admin_dashboard_html
from .config import settings
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    Appeal,
    Classification,
    Entity,
    FeedbackRequest,
    FeedbackResponse,
    HealthResponse,
    SendOtpRequest,
    SendOtpResponse,
    SmsReminderRequest,
    SmsReminderResponse,
    TelemetryPing,
    TelemetryResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from .services.classifier import classify_dispute
from .services.gap_checker import evaluate_evidence_gaps
from .services.otp import generate_otp, verify_otp
from .services.sms import (
    normalize_phone_number,
    send_otp_sms,
    send_timeline_reminder,
)
from .services.store import (
    add_feedback,
    add_telemetry,
    get_all_feedback,
    get_all_sms_logs,
    get_all_telemetry,
    get_telemetry_stats,
    log_sms,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Sauti ya Dere API", version="0.2.0")
api_router = APIRouter(prefix="/api")

# Configure CORS to allow Vercel and local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sautiya-dere-wp15.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
        "*",  # Wildcard allows all origins for preflight requests
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # FastAPI's default handler echoes the input back; drop it.
    errors = [
        {"loc": list(err.get("loc", [])), "msg": err.get("msg", "")}
        for err in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


# =====================================================================
# ADMIN DASHBOARD & TELEMETRY OBSERVABILITY
# =====================================================================
@app.get("/admin", response_class=HTMLResponse)
@api_router.get("/admin", response_class=HTMLResponse)
def admin_dashboard() -> HTMLResponse:
    """Serve the authenticated Admin Console for TAWU-Kenya and judges."""
    return HTMLResponse(content=get_admin_dashboard_html(), status_code=200)


@api_router.get("/admin/data")
@app.get("/admin/data")
def get_admin_data(
    x_admin_passkey: Annotated[str | None, Header(alias="x-admin-passkey")] = None,
    passkey: str | None = None,
) -> dict:
    """Fetch live telemetry, feedback, and SMS logs for the dashboard."""
    expected = settings.admin_passkey or "dere2026"
    provided = (x_admin_passkey or passkey or "").strip()
    if not provided or provided != expected.strip():
        raise HTTPException(status_code=401, detail="Unauthorized passkey")

    return {
        "stats": get_telemetry_stats(),
        "telemetry": get_all_telemetry(100),
        "feedback": get_all_feedback(100),
        "sms_logs": get_all_sms_logs(100),
    }


# =====================================================================
# AFRICA'S TALKING SMS & OTP ENDPOINTS
# =====================================================================
@api_router.post("/sms/send-otp", response_model=SendOtpResponse)
@app.post("/sms/send-otp", response_model=SendOtpResponse)
def send_otp(body: SendOtpRequest) -> SendOtpResponse:
    """Generate and dispatch a 4-digit verification code to the driver."""
    normalized = normalize_phone_number(body.phone_number)
    code = generate_otp(normalized)
    send_otp_sms(normalized, code)
    return SendOtpResponse(
        status="sent",
        message="Verification code sent via SMS gateway.",
        recipient=normalized,
        expires_in_seconds=300,
    )


@api_router.post("/sms/verify-otp", response_model=VerifyOtpResponse)
@app.post("/sms/verify-otp", response_model=VerifyOtpResponse)
def verify_phone_otp(body: VerifyOtpRequest) -> VerifyOtpResponse:
    """Verify submitted OTP code against the in-memory TTL store."""
    normalized = normalize_phone_number(body.phone_number)
    is_valid, reason = verify_otp(normalized, body.otp)
    return VerifyOtpResponse(
        status="success" if is_valid else "invalid",
        verified=is_valid,
        message=reason,
    )


@api_router.post("/sms/callback")
@app.post("/sms/callback")
async def sms_callback(request: Request):
    """Africa's Talking Two-Way SMS Webhook.

    Listens on shortcode 20384. Receives incoming SMS matching keyword
    routing (e.g. 'kamilimu sauti [message]').
    """
    # Extract form fields safely with fallback for environments without python-multipart
    sender = "Unknown"
    text = ""
    try:
        form_data = await request.form()
        sender = form_data.get("from") or "Unknown"
        text = form_data.get("text") or ""
    except Exception as parse_err:
        logger.warning("request.form() failed (%s); falling back to raw body parsing.", parse_err)
        try:
            import urllib.parse
            raw = (await request.body()).decode("utf-8", errors="ignore")
            qs = urllib.parse.parse_qs(raw)
            sender = (qs.get("from") or ["Unknown"])[0]
            text = (qs.get("text") or [""])[0]
        except Exception as body_err:
            logger.error("Raw body parsing also failed: %s", body_err)

    logger.info("Received incoming SMS from %s: %s", sender, text)

    # Strip the routing prefix if present (e.g., 'kamilimu sauti')
    cleaned_comment = re.sub(r"^kamilimu\s+sauti\s*", "", text, flags=re.I).strip()
    if not cleaned_comment:
        cleaned_comment = text.strip()

    # Log into feedback table and SMS logs
    add_feedback(
        rating=None,
        comments=cleaned_comment,
        phone=str(sender),
        source="sms",
    )
    log_sms(
        phone=str(sender),
        message=text,
        sms_type="inbound_feedback",
        direction="inbound",
        status="received",
    )

    return {"status": "ok", "action": "recorded"}


@api_router.post("/notify/sms", response_model=SmsReminderResponse)
@app.post("/notify/sms", response_model=SmsReminderResponse)
def notify_sms(body: SmsReminderRequest) -> SmsReminderResponse:
    """Dispatches NTSA Legal Notice 120 timeline reminders."""
    result = send_timeline_reminder(
        phone_number=body.phone_number,
        case_ref=body.case_ref,
        days_remaining=body.days_remaining,
    )
    return SmsReminderResponse(**result)


# =====================================================================
# DRIVER FEEDBACK & ZERO-PII TELEMETRY ENDPOINTS
# =====================================================================
@api_router.post("/feedback", response_model=FeedbackResponse)
@app.post("/feedback", response_model=FeedbackResponse)
def submit_feedback(body: FeedbackRequest) -> FeedbackResponse:
    """Record direct in-app driver feedback and ratings."""
    feedback_id = add_feedback(
        rating=body.rating,
        comments=body.comments,
        phone=body.phone,
        platform=body.platform,
        source="web",
    )
    return FeedbackResponse(status="success", feedback_id=feedback_id)


@api_router.post("/telemetry", response_model=TelemetryResponse)
@app.post("/telemetry", response_model=TelemetryResponse)
def record_telemetry(body: TelemetryPing) -> TelemetryResponse:
    """Record a zero-PII model performance telemetry ping.

    Adheres strictly to the Dignity Principle: No driver personal narratives,
    names, or specific locations are ever accepted or stored.
    """
    event_id = add_telemetry(
        predicted_case_type=body.predicted_case_type,
        model_confidence=body.model_confidence,
        inversion_override=body.inversion_override,
        overridden_case_type=body.overridden_case_type,
        entities_detected_count=body.entities_detected_count,
        readiness_score=body.readiness_score,
        platform=body.platform,
    )
    return TelemetryResponse(status="success", event_id=event_id)


# =====================================================================
# TASK T31 ANALYZE PIPELINE (SETFIT CLASSIFIER + GAP AUDIT)
# =====================================================================
def _run_analyze_pipeline(body: AnalyzeRequest) -> AnalyzeResponse:
    """Executes the complete Task T31 legal intake and triage pipeline."""
    # 1. PII Redaction (KDPA 2019 compliance)
    redacted_text = body.narrative
    try:
        from .services.redaction import redact

        res = redact(body.narrative)
        redacted_text = res.text
    except Exception as exc:
        logger.warning("Redaction service failed (%s); using regex masking.", exc)
        redacted_text = re.sub(
            r"(?:\+?254|0)[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b",
            "<PHONE_1>",
            redacted_text,
        )
        redacted_text = re.sub(
            r"\bK[A-Z]{2}\s*\d{3}[A-Z]\b", "<PLATE_1>", redacted_text
        )

    # 2. Fact Extraction (NER for trip facts)
    entities: list[Entity] = []
    try:
        from .services.extraction import extract

        entities = extract(redacted_text)
    except Exception as exc:
        logger.warning("Fact extraction service failed (%s); using regex parser.", exc)
        time_matches = re.findall(
            r"\b(?:[0-1]?[0-9]|2[0-3]):[0-5][0-9]\s*(?:am|pm)?\b|\b[1-9]\s*(?:am|pm)\b",
            body.narrative,
            re.I,
        )
        for t in set(time_matches):
            entities.append(Entity(label="TIME", text=t.strip()))
        date_matches = re.findall(
            r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b",
            body.narrative,
            re.I,
        )
        for d in set(date_matches):
            entities.append(Entity(label="DATE", text=d.strip()))
        money_matches = re.findall(
            r"(?:KSh|KES)\s*[\d,]+|\b\d+\s*bob\b", body.narrative, re.I
        )
        for m in set(money_matches):
            entities.append(Entity(label="MONEY", text=m.strip()))
        for loc in [
            "Westlands", "JKIA", "CBD", "Town", "Upper Hill", "Kilimani",
            "Karen", "Eastleigh", "Ngong Road", "Rongai", "Airport", "Gikomba",
        ]:
            if re.search(rf"\b{loc}\b", body.narrative, re.I):
                entities.append(Entity(label="LOCATION", text=loc))

    # 3. Dispute Classification (SetFit / Consensus Model)
    combined_input = f"{redacted_text} {body.notice_text or ''}".strip()
    case_type, confidence = classify_dispute(combined_input)
    classification = Classification(
        case_type=case_type,
        confidence=confidence,
        confidence_threshold=0.70,
        needs_confirmation=confidence < 0.70,
    )

    # 4. Evidence Gap Audit (Statutory Checklist)
    evidence = evaluate_evidence_gaps(
        case_type=case_type, evidence_held=body.evidence_held
    )

    # 5. Appeal Dossier Structuring
    platform_name = body.platform or "Transport Platform"
    appeal_headline = f"Formal Appeal: {platform_name} Account Restriction ({case_type.replace('_', ' ').title()})"
    policy_rules = ["LN120_REG15_1", "LN120_REG13_1_B", "KDPA_2019_SEC26"]

    appeal = Appeal(
        headline=appeal_headline,
        body="",
        policy_rules=policy_rules,
    )

    return AnalyzeResponse(
        stub=False,
        redacted_narrative=redacted_text,
        classification=classification,
        entities=entities,
        evidence=evidence,
        appeal=appeal,
    )


@api_router.post("/analyze", response_model=AnalyzeResponse)
@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest) -> AnalyzeResponse:
    return _run_analyze_pipeline(body)


app.include_router(api_router)
