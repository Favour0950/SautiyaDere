import pytest

from app.schemas import Entity
from app.services.extraction import extract


def facts(text):
    return [(e.label, e.text) for e in extract(text)]


def labelled(text, label):
    return [t for (lab, t) in facts(text) if lab == label]


# --- worked examples from docs/labelling_guide.md --------------------------
# Personal details are shown as placeholders, because extraction runs on the
# redacted story.

WORKED_EXAMPLES = [
    (
        "cash trip Wednesday 7 October from CBD. fare was KES 1,750 the guy gave me 500 "
        "and ran into the gate. then he reported ME that i overcharged. trip id F5UN "
        "The passenger name was <PERSON_1>.",
        [("DATE", "Wednesday 7 October"), ("LOCATION", "CBD"), ("MONEY", "KES 1,750"),
         ("MONEY", "500"), ("TRIP_ID", "F5UN")],
    ),
    (
        "On Sunday 11th around 5.30pm I picked a passenger at Westlands going to Thika Road. "
        "She did not like the route the app gave and started shouting. "
        "Her number is <PHONE_1> if you need to call.",
        [("DATE", "Sunday 11th"), ("TIME", "5.30pm"), ("LOCATION", "Westlands"),
         ("LOCATION", "Thika Road")],
    ),
    (
        "wameniblock juu ya cancellation rate. pin za Utawala huwa wrong kila mara, unafika "
        "unapata mteja yuko Karen. jana nilicancel mbili juu ya hiyo. "
        "The M-Pesa code was <MPESA_CODE_1>.",
        [("LOCATION", "Utawala"), ("LOCATION", "Karen"), ("DATE", "jana")],
    ),
    (
        "eti nilikuwa na fake trips! mimi ndiye natumia account peke yangu. Sunday 11th "
        "nilifanya trips nne Ngong Road na wateja walilipa KSh 800 kwa M-Pesa. Wanadai ni "
        "fraud. Gari yangu ni <PLATE_1>, rider alikuwa <PERSON_1>.",
        [("DATE", "Sunday 11th"), ("LOCATION", "Ngong Road"), ("MONEY", "KSh 800")],
    ),
]


@pytest.mark.parametrize("text,expected", WORKED_EXAMPLES)
def test_worked_examples(text, expected):
    assert facts(text) == expected


# --- money -------------------------------------------------------------


@pytest.mark.parametrize("amount", [
    "KSh 2,300", "Ksh2850", "KES 950", "bob 200", "200bob", "1700/-", "Ksh.500", "Kshs 1,200",
])
def test_money_with_currency(amount):
    assert labelled(f"The fare was shown as {amount} on the app.", "MONEY") == [amount]


@pytest.mark.parametrize("text,amount", [
    ("she paid 350 on M-Pesa", "350"),
    ("client paid Ksh200 instead of 2700.", "2700"),
    ("fare was 1050 the guy ran", "1050"),
    ("the guy gave me 250 and ran", "250"),
    ("wateja walilipa 750 kwa M-Pesa", "750"),
    ("App ilionyesha 1000 lakini mteja", "1000"),
])
def test_plain_amount_after_a_payment_word(text, amount):
    assert amount in labelled(text, "MONEY")


@pytest.mark.parametrize("text", [
    "I have done 350 trips this year",
    "nilifanya trips 12 leo",
    "it was 2 people in the car",
])
def test_plain_numbers_without_a_payment_word_are_not_money(text):
    assert labelled(text, "MONEY") == []


# --- dates and times -------------------------------------------------------


@pytest.mark.parametrize("date", [
    "Friday 9 October", "3rd Oct", "last Thursday", "yesterday", "last week",
    "jana", "juzi", "Jumamosi", "7/10/2026",
])
def test_dates(date):
    assert date in labelled(f"It happened {date} near the stage.", "DATE")


@pytest.mark.parametrize("time", [
    "5.30pm", "8:40pm", "10pm", "6am", "9:30 PM", "2 am", "midnight",
    "7:15 in the morning", "saa nne asubuhi", "saa tatu usiku", "saa kumi na moja jioni",
])
def test_times(time):
    assert time in labelled(f"I picked the rider at {time} and drove off.", "TIME")


def test_weekday_then_time_is_split_correctly():
    assert facts("at Utawala Monday 11pm, we argued") == [
        ("LOCATION", "Utawala"), ("DATE", "Monday"), ("TIME", "11pm"),
    ]


def test_date_at_end_of_sentence():
    assert labelled("It happened on 3rd Oct.", "DATE") == ["3rd Oct"]


def test_durations_are_not_dates():
    assert labelled("I have driven for four years", "DATE") == []


# --- places ------------------------------------------------------------


@pytest.mark.parametrize("place", ["Westlands", "JKIA", "CBD", "Sarit Centre", "Eastleigh", "Kilimani"])
def test_spec_places(place):
    assert labelled(f"I dropped him at {place} yesterday.", "LOCATION") == [place]


def test_places_ignore_case():
    assert labelled("nilimpeleka westlands", "LOCATION") == ["westlands"]


def test_place_at_end_of_sentence():
    assert labelled("I dropped her at South C. Then she left.", "LOCATION") == ["South C"]


def test_longest_place_wins():
    assert labelled("we were on Thika Road", "LOCATION") == ["Thika Road"]


def test_everyday_words_are_not_places_in_lower_case():
    # fedha = money, umoja = unity
    assert labelled("sina fedha, tunahitaji umoja", "LOCATION") == []
    assert labelled("I live in Umoja", "LOCATION") == ["Umoja"]


# --- trip IDs -------------------------------------------------------------


@pytest.mark.parametrize("text,trip_id", [
    ("Trip ID ends TRX-67091.", "TRX-67091"),
    ("trip id GU2F Gari yangu", "GU2F"),
    ("trip ID: 8T26", "8T26"),
    ("trip id MZWN", "MZWN"),
])
def test_trip_ids(text, trip_id):
    assert labelled(text, "TRIP_ID") == [trip_id]


def test_short_codes_without_trip_word_are_not_trip_ids():
    assert labelled("the code RSK3 was on the screen", "TRIP_ID") == []


# --- placeholders and output -----------------------------------------------


def test_placeholders_are_never_facts():
    text = "Call <PHONE_1>, plate <PLATE_2>, code <MPESA_CODE_1>, rider <PERSON_1> paid <MPESA_CODE_2>."
    assert facts(text) == []


def test_repeats_come_back_once_in_order():
    text = "From Westlands to CBD, then back to westlands. Paid KSh 500, then KSh 500 again."
    assert facts(text) == [("LOCATION", "Westlands"), ("LOCATION", "CBD"), ("MONEY", "KSh 500")]


def test_returns_entity_objects():
    result = extract("Sunday at Westlands")
    assert all(isinstance(e, Entity) for e in result)


def test_story_with_no_facts():
    assert extract("Wameniblock bila sababu.") == []
