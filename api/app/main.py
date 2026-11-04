"""Sauti ya Dere backend.

Privacy rule: request bodies are never logged or stored. The access log is off
(see the run command in the README and Dockerfile), and validation errors return
only the field location and message, never the submitted text.
"""

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    SmsReminderRequest,
    SmsReminderResponse,
)
from .services.appeal_builder import build_appeal
from .services.classifier import classify_case
from .services.extraction import extract
from .services.gap_checker import evaluate_evidence_gaps
from .services.redaction import redact
from .services.sms import send_timeline_reminder

app = FastAPI(title="Sauti ya Dere API", version="0.1.0")
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
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


@api_router.post("/analyze", response_model=AnalyzeResponse)
@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest) -> AnalyzeResponse:
    """Full end-to-end analysis pipeline (Task T31):
    1. Redact personal details (Presidio, T15)
    2. Extract facts from redacted narrative (spaCy EntityRuler, T16)
    3. Classify dispute category (SetFit model / fallback, T22)
    4. Audit held evidence against statutory checklists (T24)
    5. Draft policy-grounded appeal and restore personal placeholders (T25/T30)
    """
    redacted = redact(body.narrative)
    entities = extract(redacted.text)
    classification = classify_case(redacted.text, body.notice_text)
    evidence = evaluate_evidence_gaps(
        classification.case_type or "fare_dispute",
        body.evidence_held,
    )
    appeal = build_appeal(
        case_type=classification.case_type,
        platform=body.platform,
        entities=entities,
        redacted_narrative=redacted.text,
        mapping=redacted.mapping,
    )
    return AnalyzeResponse(
        stub=False,
        redacted_narrative=redacted.text,
        classification=classification,
        entities=entities,
        evidence=evidence,
        appeal=appeal,
    )


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
