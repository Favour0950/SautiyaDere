"""Sauti ya Dere backend.

Privacy rule: request bodies are never logged or stored. The access log is off
(see the run command in the README and Dockerfile), and validation errors return
only the field location and message, never the submitted text.
"""

import logging
import re
from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    Appeal,
    Classification,
    Entity,
    HealthResponse,
    SmsReminderRequest,
    SmsReminderResponse,
)
from .services.classifier import classify_dispute
from .services.gap_checker import evaluate_evidence_gaps
from .services.sms import send_timeline_reminder

logger = logging.getLogger(__name__)

app = FastAPI(title="Sauti ya Dere API", version="0.1.0")
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
            "Karen", "Eastleigh", "Ngong Road", "Rongai", "Airport", "Gikomba"
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


@api_router.post("/notify/sms", response_model=SmsReminderResponse)
@app.post("/notify/sms", response_model=SmsReminderResponse)
def notify_sms(body: SmsReminderRequest) -> SmsReminderResponse:
    result = send_timeline_reminder(
        phone_number=body.phone_number,
        case_ref=body.case_ref,
        days_remaining=body.days_remaining,
    )
    return SmsReminderResponse(**result)


app.include_router(api_router)
