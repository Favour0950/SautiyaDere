"""Dispute case classifier service (Tasks T20-T23).

Uses Violet's fine-tuned SetFit model (`sautiyadere/sauti-dispute-classifier`)
when the `setfit` runtime is available, with a resilient multilingual
English/Kiswahili/Sheng fallback so the API never fails in lightweight
environments.
"""

from __future__ import annotations

import os
from functools import lru_cache

from ..schemas import CaseType, Classification

# Canonical remote repository on Hugging Face (trained in PR #10)
HF_MODEL_ID = "sautiyadere/sauti-dispute-classifier"
LOCAL_FALLBACK = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../models/sauti_setfit_model")
)

VALID_CASE_TYPES: set[str] = {
    "passenger_safety",
    "fare_dispute",
    "rating_or_cancellation",
    "fraud_flag",
    "out_of_scope",
}

LABEL_MAP: dict[str, CaseType] = {
    "0": "fare_dispute",
    "1": "fraud_flag",
    "2": "passenger_safety",
    "3": "rating_or_cancellation",
    "fare_dispute": "fare_dispute",
    "fraud_flag": "fraud_flag",
    "passenger_safety": "passenger_safety",
    "rating_or_cancellation": "rating_or_cancellation",
    "out_of_scope": "out_of_scope",
}


@lru_cache(maxsize=1)
def _get_setfit_model():
    """Load Violet's SetFit model lazily so import time stays fast."""
    try:
        from setfit import SetFitModel  # type: ignore

        if os.path.exists(LOCAL_FALLBACK) and os.path.exists(
            os.path.join(LOCAL_FALLBACK, "model_head.pkl")
        ):
            return SetFitModel.from_pretrained(LOCAL_FALLBACK)
        return SetFitModel.from_pretrained(HF_MODEL_ID)
    except Exception:
        return None


def _rule_classify(text: str, notice_text: str | None = None) -> Classification:
    """Multilingual English/Kiswahili/Sheng scorer fallback."""
    combined = f"{text} {notice_text or ''}".lower()
    scores: dict[CaseType, float] = {
        "fare_dispute": 0.0,
        "passenger_safety": 0.0,
        "rating_or_cancellation": 0.0,
        "fraud_flag": 0.0,
        "out_of_scope": 0.0,
    }

    for kw in (
        "fare", "paid", "pay", "payment", "cash", "mpesa", "m-pesa", "ksh",
        "shilling", "bob", "commission", "deduct", "underpaid", "refused to pay",
        "walked away", "malipo", "nauli", "kulipa", "alilipa", "walilipa", "pesa",
    ):
        if kw in combined:
            scores["fare_dispute"] += 1.5

    for kw in (
        "safety", "drunk", "intoxicated", "threat", "abuse", "assault", "harass",
        "weapon", "5 passengers", "five passengers", "overload", "smoke", "smoking",
        "violent", "false report", "falsely accused", "usalama", "mlevi", "tishia",
    ):
        if kw in combined:
            scores["passenger_safety"] += 1.5

    for kw in (
        "rating", "star", "1-star", "cancel", "cancelled", "cancellation",
        "pickup pin", "wrong pin", "acceptance rate", "ghairi", "nyota",
    ):
        if kw in combined:
            scores["rating_or_cancellation"] += 1.5

    for kw in (
        "fraud", "gps", "spoof", "collusion", "duplicate", "irregular trip",
        "selfie", "identity", "verification", "shared account", "bot", "algorithm",
        "udanganyifu",
    ):
        if kw in combined:
            scores["fraud_flag"] += 1.5

    if notice_text:
        nl = notice_text.lower()
        if "fare" in nl or "payment" in nl:
            scores["fare_dispute"] += 1.2
        elif "safety" in nl or "conduct" in nl:
            scores["passenger_safety"] += 1.2
        elif "cancel" in nl or "rating" in nl:
            scores["rating_or_cancellation"] += 1.2
        elif "fraud" in nl or "identity" in nl or "verification" in nl:
            scores["fraud_flag"] += 1.2

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top_type, top_score = ranked[0]
    second_score = ranked[1][1]

    if top_score == 0:
        return Classification(
            case_type="fare_dispute",
            confidence=0.62,
            confidence_threshold=0.70,
            needs_confirmation=True,
        )

    margin = top_score - second_score
    conf = round(min(0.96, max(0.58, 0.68 + min(top_score, 6.0) * 0.04 + min(margin, 3.0) * 0.03)), 2)
    return Classification(
        case_type=top_type,
        confidence=conf,
        confidence_threshold=0.70,
        needs_confirmation=conf < 0.70,
    )


def classify_case(text: str, notice_text: str | None = None) -> Classification:
    """Classify a redacted driver narrative using Violet's SetFit model or fallback."""
    model = _get_setfit_model()
    if model is not None:
        try:
            preds = model.predict([text])
            raw_pred = str(preds[0]).strip()
            mapped = LABEL_MAP.get(raw_pred, "fare_dispute")
            conf = 0.88
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba([text])[0]
                conf = round(float(max(probs)), 2)
            return Classification(
                case_type=mapped,
                confidence=conf,
                confidence_threshold=0.70,
                needs_confirmation=conf < 0.70,
            )
        except Exception:
            pass

    return _rule_classify(text, notice_text)
