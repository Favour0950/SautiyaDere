"""Request and response shapes for the API.

Field names follow the case record format in data/schema.json (T06).
The response layout follows Violet's proposal in docs/api.md.
"""

from typing import Literal

from pydantic import BaseModel, Field

Platform = Literal["Uber", "Bolt", "Little", "Faras", "other"]
CaseType = Literal[
    "passenger_safety",
    "fare_dispute",
    "rating_or_cancellation",
    "fraud_flag",
    "out_of_scope",
]
EntityLabel = Literal["DATE", "TIME", "LOCATION", "MONEY", "TRIP_ID"]


class AnalyzeRequest(BaseModel):
    narrative: str = Field(min_length=1, max_length=10_000)
    notice_text: str | None = Field(default=None, max_length=5_000)
    platform: Platform | None = None
    evidence_held: list[str] = Field(default_factory=list)


class Classification(BaseModel):
    case_type: CaseType | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    confidence_threshold: float = 0.70
    # True when confidence is below the threshold: the PWA asks the driver to pick.
    needs_confirmation: bool = True


class Entity(BaseModel):
    label: EntityLabel
    text: str


class MissingItem(BaseModel):
    id: str  # checklist item ID, e.g. MPESA_RECEIPT
    reason: str  # why the appeal needs it, in plain words


class EvidenceCheck(BaseModel):
    # Share of required checklist items the driver already holds, 0 to 1.
    readiness: float | None = Field(default=None, ge=0, le=1)
    missing: list[MissingItem] = Field(default_factory=list)
    optional: list[str] = Field(default_factory=list)


class Appeal(BaseModel):
    headline: str | None = None
    body: str | None = None
    policy_rules: list[str] = Field(default_factory=list)  # rule IDs from policies.json


class AnalyzeResponse(BaseModel):
    stub: bool = True
    redacted_narrative: str | None = None
    classification: Classification = Field(default_factory=Classification)
    entities: list[Entity] = Field(default_factory=list)
    evidence: EvidenceCheck = Field(default_factory=EvidenceCheck)
    appeal: Appeal = Field(default_factory=Appeal)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
