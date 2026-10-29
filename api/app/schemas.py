"""Request and response shapes for the API.

Field names follow the case record format in the Data Plan (data/schema.json, T06).
"""

from typing import Literal

from pydantic import BaseModel, Field

Platform = Literal["Uber", "Bolt", "Little", "Faras", "other"]


class AnalyzeRequest(BaseModel):
    narrative: str = Field(min_length=1, max_length=10_000)
    notice_text: str | None = Field(default=None, max_length=5_000)
    platform: Platform | None = None
    evidence_held: list[str] = Field(default_factory=list)


class Entity(BaseModel):
    type: str
    text: str


class AnalyzeResponse(BaseModel):
    stub: bool = True
    case_type: str | None = None
    confidence: float | None = None
    entities: list[Entity] = Field(default_factory=list)
    evidence_missing: list[str] = Field(default_factory=list)
    appeal_statement: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
