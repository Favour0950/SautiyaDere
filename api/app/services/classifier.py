import os
from setfit import SetFitModel

# Canonical remote repository on Hugging Face
HF_MODEL_ID = "sautiyadere/sauti-dispute-classifier"
LOCAL_FALLBACK = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../models/sauti_setfit_model"))

if os.path.exists(LOCAL_FALLBACK) and os.path.exists(os.path.join(LOCAL_FALLBACK, "model_head.pkl")):
    classifier_model = SetFitModel.from_pretrained(LOCAL_FALLBACK)
else:
    classifier_model = SetFitModel.from_pretrained(HF_MODEL_ID)