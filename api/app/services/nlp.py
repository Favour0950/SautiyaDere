"""Shared spaCy model.

Fact extraction (T16) and the personal-details filter (T15) both need spaCy.
Loading the model once and sharing it keeps memory low on Cloud Run.

The model is installed as a package from requirements.txt, so nothing is
downloaded while the app runs.
"""

from functools import lru_cache

import spacy
from spacy.language import Language

MODEL_NAME = "en_core_web_sm"

# The dependency parser is not used by either service, so it is not loaded.
_EXCLUDE = ["parser"]


@lru_cache(maxsize=1)
def get_nlp() -> Language:
    """Return the shared spaCy pipeline, loading it on first use."""
    return spacy.load(MODEL_NAME, exclude=_EXCLUDE)
