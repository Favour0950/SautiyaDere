"""Dispute Classification Service (Task T22 / T31).

Classifies driver dispute narratives using the fine-tuned SetFit Few-Shot model
(sautiyadere/sauti-dispute-classifier) with heuristic keyword fallback.
"""

from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)

HF_MODEL_ID = "sautiyadere/sauti-dispute-classifier"
LOCAL_FALLBACK = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../models/sauti_setfit_model")
)

_model = None
_model_loaded = False

KEYWORD_RULES = {
    "fare_dispute": [
        r"\bfare\b",
        r"\bmpesa\b",
        r"\bshillings\b",
        r"\bamount\b",
        r"\bunpaid\b",
        r"\bcash\b",
        r"\bovercharge\b",
        r"\bbalance\b"
    ],
    "passenger_safety": [
        r"\bsafety\b",
        r"\bharass\b",
        r"\bdrunk\b",
        r"\bthreat\b",
        r"\bfight\b",
        r"\breckless\b",
        r"\bspeeding\b",
        r"\bweapon\b",
        r"\bassault\b"
    ],
    "rating_or_cancellation": [
        r"\brating\b",
        r"\bcancel\b",
        r"\bstars?\b",
        r"\brider canceled\b",
        r"\bno-show\b",
        r"\bwrong pin\b"
    ],
    "fraud_flag": [
        r"\bfraud\b",
        r"\bidentity\b",
        r"\bgps spoof\b",
        r"\bunusual activity\b",
        r"\block\b",
        r"\blocked\b",
        r"\bdeactivat\b",
        r"\bface\b",
        r"\bdoc\b"
    ],
}


def _get_model():
    global _model, _model_loaded
    if _model_loaded:
        return _model
    _model_loaded = True
    try:
        from setfit import SetFitModel
        if os.path.exists(LOCAL_FALLBACK) and os.path.exists(
            os.path.join(LOCAL_FALLBACK, "model_head.pkl")
        ):
            _model = SetFitModel.from_pretrained(LOCAL_FALLBACK)
            logger.info("Loaded SetFit model from local path: %s", LOCAL_FALLBACK)
        else:
            _model = SetFitModel.from_pretrained(HF_MODEL_ID)
            logger.info("Loaded SetFit model from Hugging Face: %s", HF_MODEL_ID)
    except Exception as exc:
        logger.warning(
            "Could not load SetFit model (%s); using heuristic classifier.", exc
        )
        _model = None
    return _model


def classify_dispute(text: str) -> tuple[str, float]:
    """Classifies driver narrative into a dispute case_type with confidence.

    Returns:
        (case_type, confidence) where confidence is between 0.0 and 1.0.
    """
    if not text or not text.strip():
        return "fare_dispute", 0.50

    model = _get_model()
    if model is not None:
        try:
            preds = model.predict([text])
            predicted_label = str(preds[0])
            # If model supports predict_proba, compute real confidence
            try:
                probs = model.predict_proba([text])
                confidence = float(max(probs[0]))
            except Exception:
                confidence = 0.92
            return predicted_label, round(confidence, 3)
        except Exception as exc:
            logger.warning("SetFit inference failed (%s); falling back to keywords.", exc)

    # Heuristic keyword classifier
    text_lower = text.lower()
    scores: dict[str, int] = {cat: 0 for cat in KEYWORD_RULES}
    for cat, patterns in KEYWORD_RULES.items():
        for p in patterns:
            if re.search(p, text_lower):
                scores[cat] += 1

    best_cat, best_score = max(scores.items(), key=lambda kv: kv[1])
    if best_score == 0:
        return "fare_dispute", 0.65

    # Scale confidence with match density
    confidence = min(0.92, 0.65 + (best_score * 0.08))
    return best_cat, round(confidence, 3)
