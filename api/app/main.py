"""Sauti ya Dere backend.

Privacy rule: request bodies are never logged or stored. The access log is off
(see the run command in the README and Dockerfile), and validation errors return
only the field location and message, never the submitted text.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .schemas import AnalyzeRequest, AnalyzeResponse, HealthResponse

app = FastAPI(title="Sauti ya Dere API", version="0.1.0")

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


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest) -> AnalyzeResponse:
    # Stub. The real pipeline (filter, extraction, case type, gap checker,
    # appeal statement) is joined here in T31.
    return AnalyzeResponse()
