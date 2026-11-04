import logging
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.services.redaction import find_personal_details, redact, restore


def hidden(text):
    """The (label, value) pairs the filter hides."""
    return [(label, text[s:e]) for label, s, e in find_personal_details(text)]


# --- what must be hidden ------------------------------------------------------


@pytest.mark.parametrize("phone", [
    "0742 784 980", "0726137506", "+254707141633", "+254 712 345 678", "254712345678",
    "0712-345-678", "0110 123 456", "+254110123456",
])
def test_phone_numbers(phone):
    assert hidden(f"Her number is {phone} if you need to call.") == [("PHONE", phone)]


@pytest.mark.parametrize("phone", ["O712 345 678", "0712 34 56 78", "07 12 345 678"])
def test_phone_numbers_with_typos_or_odd_spacing(phone):
    assert hidden(f"nipigie {phone} kesho") == [("PHONE", phone)]


@pytest.mark.parametrize("plate",["KDC 638T", "KDF516R", "kdc 638t", "KMDA 123B"])
def test_number_plates(plate):
    assert hidden(f"Gari yangu ni {plate} kwa stage.") == [("PLATE", plate)]


@pytest.mark.parametrize("code", ["SDFT43742T", "QGH789KL22", "TV2HJCCV7H"])
def test_mpesa_codes(code):
    assert hidden(f"The M-Pesa code was {code}.") == [("MPESA_CODE", code)]


@pytest.mark.parametrize("text,name", [
    ("The passenger name was Kimani.", "Kimani"),
    ("rider alikuwa Wanjiku", "Wanjiku"),
    ("nilimpigia wanjiku jana", "wanjiku"),  # drivers often type names in lower case
    ("Otieno refused to pay", "Otieno"),
    ("kwa Otieno", "Otieno"),
])
def test_names_from_the_list(text, name):
    assert hidden(text) == [("PERSON", name)]


@pytest.mark.parametrize("text,name", [
    ("rider alikuwa Baraka", "Baraka"),
    ("mteja anaitwa Imani", "Imani"),
    ("the passenger, Mercy, shouted", "Mercy"),
    ("Grace was the passenger", "Grace"),
])
def test_ambiguous_names_next_to_a_context_word(text, name):
    assert hidden(text) == [("PERSON", name)]


@pytest.mark.parametrize("text,name", [
    ("mteja anaitwa Mwanaidi alinitukana", "Mwanaidi"),
    ("jina lake ni akello", "akello"),
    ("his name is Tsuma", "Tsuma"),
])
def test_names_not_on_the_list_after_a_naming_phrase(text, name):
    assert hidden(text) == [("PERSON", name)]


@pytest.mark.parametrize("place", ["Dennis Pritt Road", "Mama Lucy Hospital", "Ronald Ngala Street"])
def test_names_inside_place_names_are_kept(place):
    assert hidden(f"I dropped the rider at {place} yesterday") == []


def test_same_name_outside_a_place_is_still_hidden():
    assert hidden("rider Dennis took me to Dennis Pritt Road") == [("PERSON", "Dennis")]


def test_naming_phrase_before_a_place_keeps_the_place():
    assert hidden("the stage named Kencom was busy") == []


def test_email():
    assert hidden("Write to me at driver.kamau@gmail.com please") == [
        ("EMAIL", "driver.kamau@gmail.com"),
    ]


# --- what must stay ---------------------------------------------------------------


@pytest.mark.parametrize("text", [
    "fare was KES 1,750 and she paid 350",
    "Trip ID ends TRX-67091. trip id F5UN",
    "On Sunday 11th around 5.30pm, saa tatu usiku",
    "from Westlands to Karen via Thika Road, then Fedha and Umoja",
    "NIMECHOKAS SANA NA HII APP",  # all-caps Swahili is not an M-Pesa code
    "I have done 1234567890 trips",  # 10 digits but not a phone or code
    "By God's Grace I will appeal. Nina imani na neema. Baraka tele.",
    "Bolt, Uber, Little and Faras",
])
def test_facts_and_everyday_words_are_kept(text):
    assert hidden(text) == []


def test_place_names_are_never_hidden_as_names():
    text = "rider alikuwa Karen, alikuwa anaenda Karen"
    assert "Karen" not in [v for _, v in hidden(text)]


# --- placeholders ---------------------------------------------------------------


def test_redact_replaces_details_with_numbered_placeholders():
    result = redact("Rider Wanjiku, 0712 345 678, plate KDC 638T, rider Kamau")
    assert result.text == "Rider <PERSON_1>, <PHONE_1>, plate <PLATE_1>, rider <PERSON_2>"
    assert result.mapping == {
        "<PERSON_1>": "Wanjiku",
        "<PHONE_1>": "0712 345 678",
        "<PLATE_1>": "KDC 638T",
        "<PERSON_2>": "Kamau",
    }


def test_same_detail_gets_the_same_placeholder():
    result = redact("Call 0712 345 678 or +254712345678. Kamau, yes kamau.")
    assert result.text == "Call <PHONE_1> or <PHONE_1>. <PERSON_1>, yes <PERSON_1>."


def test_redact_then_restore_gives_back_the_original():
    story = (
        "On Sunday 11th rider Wanjiku (0742 784 980) paid KSh 800, code SDFT43742T, "
        "car KDC 638T, email wanjiku@example.com, at Westlands."
    )
    result = redact(story)
    assert "Wanjiku" not in result.text and "0742" not in result.text
    restored = restore(result.text, result.mapping)
    assert restored.text == story
    assert restored.missing == [] and restored.unknown == []


def test_story_without_details_is_unchanged():
    result = redact("Wameniblock bila sababu at Westlands.")
    assert result.text == "Wameniblock bila sababu at Westlands."
    assert result.mapping == {}


def test_restore_reports_dropped_and_invented_placeholders():
    mapping = {"<PERSON_1>": "Kamau", "<PHONE_1>": "0712 345 678"}
    restored = restore("Dear team, <PERSON_1> reported me. Call <PHONE_2>.", mapping)
    assert restored.text == "Dear team, Kamau reported me. Call <PHONE_2>."
    assert restored.missing == ["<PHONE_1>"]
    assert restored.unknown == ["<PHONE_2>"]


# --- privacy -------------------------------------------------------------------------


def test_each_call_gets_its_own_mapping():
    first = redact("rider Wanjiku")
    second = redact("rider Kamau")
    assert first.mapping == {"<PERSON_1>": "Wanjiku"}
    assert second.mapping == {"<PERSON_1>": "Kamau"}
    assert first.mapping is not second.mapping


def test_parallel_requests_never_mix_details():
    stories = [f"rider {name}, phone 07{i:02d} 345 678" for i, name in
               enumerate(["Wanjiku", "Kamau", "Otieno", "Achieng", "Kiprono", "Mutua"] * 5)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(redact, stories))
    for story, result in zip(stories, results):
        assert restore(result.text, result.mapping).text == story
        assert all(value in story for value in result.mapping.values())


def test_filter_never_uses_the_network(monkeypatch):
    # Presidio's stock email recognizer downloads a domain list on first use.
    # Attempts are recorded rather than raised, because a library could
    # swallow the error and fall back quietly.
    import socket

    attempts = []

    def block(target, *args, **kwargs):
        attempts.append(target)
        raise OSError("network blocked in this test")

    monkeypatch.setattr(socket, "getaddrinfo", block)
    monkeypatch.setattr(socket, "create_connection", block)
    monkeypatch.setattr(socket.socket, "connect", lambda self, addr: block(addr))
    result = redact("email me at someone.new@example.co.ke or rider Kamau, 0712 345 678")
    assert result.text == "email me at <EMAIL_1> or rider <PERSON_1>, <PHONE_1>"
    assert attempts == []


def test_details_are_not_logged(caplog):
    marker_phone, marker_name = "0799 111 222", "Nyambura"
    with caplog.at_level(logging.DEBUG):
        result = redact(f"rider {marker_name} called {marker_phone}")
        restore(result.text, result.mapping)
    assert marker_phone not in caplog.text
    assert marker_name not in caplog.text
