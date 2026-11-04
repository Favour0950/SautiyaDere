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
from .services.sms import send_timeline_reminder

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


@api_router.post("/analyze", response_model=AnalyzeResponse)
@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest) -> AnalyzeResponse:
    # Stub. The real pipeline (filter, extraction, case type, gap checker,
    # appeal statement) is joined here in T31.
    return AnalyzeResponse()


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
