from app.services.nlp import get_nlp


def test_model_loads_once():
    assert get_nlp() is get_nlp()


def test_pipeline_has_ner_but_no_parser():
    nlp = get_nlp()
    assert "ner" in nlp.pipe_names
    assert "parser" not in nlp.pipe_names


def test_model_reads_a_driver_story():
    doc = get_nlp()("On Sunday at 5.30pm I picked a passenger at Westlands.")
    assert len(doc) > 0
    assert any(ent.label_ in {"DATE", "TIME"} for ent in doc.ents)
