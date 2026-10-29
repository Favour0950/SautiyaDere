"""Generate synthetic case records in the data/schema.json format (T11).

    python generate.py                      # 150 cases -> synthetic/cases.jsonl
    python generate.py --seed 7 --out x.jsonl
    python generate.py --rewrite gemini     # optional: LLM rewrites each story (needs GEMINI_API_KEY)

How it works
- A mix grid (case type x platform x place x time x amount x evidence held x style x
  language) is filled from templates. Entity and PII spans are computed while the text is
  built, so offsets are always exact.
- Every case gets invented personal details (names, phones, plates, M-Pesa codes) in some
  stories, labelled under labels.pii, so the personal-details filter can be scored too.
- 35 cases per in-scope type + 10 out-of-scope = 150. 10 per in-scope type and 5
  out-of-scope go to held_out.

Template text is repetitive. --rewrite asks a different model family (Gemini, per the
Data Plan) to rewrite each story in a driver's voice while keeping every labelled string
verbatim; spans are then re-found in the new text, and the template version is kept if any
labelled string went missing.
"""

import argparse
import json
import os
import random
import re
import sys
import urllib.request
from pathlib import Path

from case_rules import CHECKLISTS, IN_SCOPE_TYPES, missing_evidence, policy_rules

HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------- slot values

PLATFORMS = ["Uber", "Bolt", "Little", "Faras"]
PLACES = [
    "Westlands", "CBD", "Kilimani", "South B", "South C", "Kitengela", "Rongai", "Githurai",
    "Kayole", "Embakasi", "Karen", "Lavington", "Upper Hill", "Ngong Road", "Thika Road",
    "Kasarani", "Ruaka", "Syokimau", "JKIA", "Yaya Centre", "Sarit", "TRM", "Buruburu",
    "Donholm", "Langata", "Kileleshwa", "Parklands", "Eastleigh", "Roysambu", "Utawala",
]
DATES = [
    "Friday 9 October", "Monday", "Tuesday", "last week", "yesterday", "jana", "on 3rd Oct",
    "Saturday night", "juzi", "Sunday 11th", "Wednesday 7 October", "last Thursday",
]
TIMES = [
    "8:40pm", "around 9:30 PM", "6am", "saa tatu usiku", "11pm", "around 2 am", "7:15 in the morning",
    "saa nne asubuhi", "midnight", "5.30pm", "10pm",
]
FIRST_NAMES = [
    "Wanjiku", "Otieno", "Kamau", "Achieng", "Mwangi", "Njeri", "Kiprono", "Atieno", "Mutua",
    "Wambui", "Ochieng", "Chebet", "Kimani", "Akinyi", "Barasa", "Nduta", "Omondi", "Jeptoo",
    "Brian", "Faith", "Kevin", "Mercy", "Dennis", "Sharon",
]
NOTICES = {
    "passenger_safety": [
        "Your account has been temporarily suspended while we review a safety report about a recent trip.",
        "We have received a report regarding your conduct on a trip. Your access is on hold pending investigation.",
    ],
    "fare_dispute": [
        "Your account has been temporarily restricted following a rider report. We will review and get back to you.",
        "A rider has reported an issue with payment on a recent trip. Your account is restricted during review.",
    ],
    "rating_or_cancellation": [
        "Your account has been deactivated because your cancellation rate is above the limit in your city.",
        "Your average rating has fallen below the minimum required. Your account has been deactivated.",
    ],
    "fraud_flag": [
        "We detected irregular activity on your account consistent with GPS manipulation. Your account is blocked.",
        "Your account has been permanently deactivated due to suspected fraudulent trips.",
    ],
    "out_of_scope": [
        "Your driving licence has expired. Upload a valid document to continue driving.",
        "Your vehicle insurance document is no longer valid. Please upload a new one.",
    ],
}

# ---------------------------------------------------------------- templates
# {slot} placeholders. Slot names map to a label below; unlabelled slots are plain text.

SLOT_LABELS = {
    "date": "DATE", "time": "TIME", "place": "LOCATION", "dest": "LOCATION",
    "fare": "MONEY", "paid": "MONEY", "trip": "TRIP_ID",
    "name": "PERSON", "phone": "PHONE", "plate": "PLATE", "mpesa": "MPESA_CODE",
}
PII_LABELS = {"PERSON", "PHONE", "PLATE", "MPESA_CODE"}

TEMPLATES = {
    "passenger_safety": [
        ("english", ["calm", "long"],
         "On {date} around {time} I picked a passenger at {place} going to {dest}. She did not like the route "
         "the app gave and started shouting. I followed the map the whole way. When we reached she rated me one "
         "star and reported I was driving dangerously. That is not true, I drive carefully."),
        ("mixed", ["upset"],
         "mteja alinireport eti nilikuwa naendesha vibaya. tulitoka {place} {time} {date} kuenda {dest}. "
         "hakuna kitu nilifanya, alikuwa amelewa na akaanza matusi. sasa account imefungwa."),
        ("english", ["upset"],
         "they suspended me saying I harassed a client!! I picked him at {place} {date} {time}, we argued "
         "because he wanted to sit in front with 3 people at the back. I refused. he said he will finish me."),
        ("english", ["very_short"],
         "client reported unsafe driving {date}. trip {place} to {dest}. not true"),
        ("mixed", ["calm"],
         "Nilikuwa na trip {date} kutoka {place} to {dest} saa {time}. Passenger alisema nilipita njia ndefu "
         "akaripoti. Nilifuata GPS ya app. Nina dashcam video ya safari yote."),
    ],
    "fare_dispute": [
        ("english", ["calm", "long"],
         "On {date} around {time} I picked a client at {place} going to {dest}. Halfway she said change to "
         "another place further. I told her the fare will go up and she said ok. At the end the app showed "
         "{fare}, she paid {paid} on M-Pesa and said that's what the first price was. She reported me. Trip ID ends {trip}."),
        ("mixed", ["upset"],
         "Nilikuwa nachukua mteja stage ya {place} {time} {date}. Alikataa kulipa {fare} ya M-Pesa kwa sababu "
         "ya traffic. Nilipomwambia anilipe akateta akasema ataniripoti kwa app."),
        ("english", ["very_short"],
         "client paid {paid} instead of {fare}. {place} to {dest} {date}. now im blocked"),
        ("english", ["upset"],
         "cash trip {date} from {place}. fare was {fare} the guy gave me {paid} and ran into the gate. "
         "then he reported ME that i overcharged. trip id {trip}"),
        ("mixed", ["calm"],
         "Trip ya {date} {time}, {place} kwenda {dest}. App ilionyesha {fare} lakini mteja alituma {paid} tu. "
         "Nilimwambia kwa chat ya app. Siku iliyofuata account ikawa restricted."),
    ],
    "rating_or_cancellation": [
        ("english", ["very_short", "upset"],
         "they blocked me for cancelling but most of those the pin was wrong or the client told me to cancel. "
         "{date} 3 trips in {place} the client said cancel he will get another car. i have the chats"),
        ("english", ["calm", "long"],
         "My account was deactivated for low rating. I have been driving for four years with good ratings. "
         "Since {date} I got many one star ratings from trips around {place} at night, I think it is because "
         "I refuse to carry extra passengers. Nobody told me what I did wrong."),
        ("mixed", ["upset"],
         "wameniblock juu ya cancellation rate. pin za {place} huwa wrong kila mara, unafika unapata mteja "
         "yuko {dest}. {date} nilicancel mbili juu ya hiyo."),
        ("english", ["very_short"],
         "deactivated low rating. started {date}. please help"),
        ("mixed", ["calm"],
         "Rating yangu ilishuka {date}. Clients wa {place} wananipatia one star bila sababu. "
         "Mimi huwa natumia AC na gari ni safi."),
    ],
    "fraud_flag": [
        ("english", ["calm", "long"],
         "The app says I used a fake GPS app. I have never installed anything like that. My phone is old and "
         "the GPS jumps sometimes around {place}. On {date} I did trips from {place} to {dest} normally and the "
         "next morning I was blocked for fraud."),
        ("mixed", ["upset"],
         "eti nilikuwa na fake trips! mimi ndiye natumia account peke yangu. {date} nilifanya trips nne {place} "
         "na wateja walilipa {fare} kwa M-Pesa. Wanadai ni fraud."),
        ("english", ["very_short"],
         "blocked for fraud {date}. i dont share my account"),
        ("english", ["upset"],
         "they say someone else was driving my account. that is a lie. {date} {time} I was at {place} myself "
         "doing a trip to {dest}. trip id {trip}"),
        ("mixed", ["calm"],
         "Account ilifungwa juu ya suspected payment fraud. Trip ya {date} kutoka {place}, mteja alilipa "
         "{fare} na akaomba refund baadaye. Sijui ni nini kilifanyika."),
    ],
    "out_of_scope": [
        ("english", ["very_short"], "my licence expired {date} and now i cant go online"),
        ("mixed", ["calm"], "Insurance ya gari iliexpire {date}. App imesema ni upload document mpya. Nifanye aje?"),
        ("english", ["calm"], "The app wants a new inspection certificate. I went to {place} {date} but they said come back next week."),
    ],
}

# Optional sentences that carry invented personal details for scoring the PII filter.
PII_ADDONS = [
    "The passenger name was {name}.",
    "Her number is {phone} if you need to call.",
    "My car is {plate}.",
    "Mteja anaitwa {name}, namba yake ni {phone}.",
    "The M-Pesa code was {mpesa}.",
    "Gari yangu ni {plate}, rider alikuwa {name}.",
]


def fake_phone(rng):
    digits = "7" + "".join(rng.choice("0123456789") for _ in range(8))
    return rng.choice([f"0{digits}", f"+254{digits}", f"0{digits[:3]} {digits[3:6]} {digits[6:]}"])


def fake_plate(rng):
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    return f"KD{rng.choice(letters)} {rng.randint(100, 999)}{rng.choice(letters)}"


def fake_mpesa(rng):
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"
    while True:
        code = rng.choice("ST") + "".join(rng.choice(chars) for _ in range(9))
        if sum(c.isdigit() for c in code) >= 2:
            return code


def fake_amount(rng, low=200, high=3000):
    n = rng.randrange(low, high, 50)
    return rng.choice([f"KSh {n:,}", f"Ksh{n}", f"{n}", f"bob {n}", f"KES {n:,}"])


def fake_trip_id(rng):
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"
    return rng.choice(["".join(rng.choice(chars) for _ in range(4)), f"TRX-{rng.randint(10000, 99999)}"])


def render(template: str, values: dict) -> tuple[str, list[dict], list[dict]]:
    """Fill {slots}, returning text plus entity and PII spans with exact offsets."""
    out, entities, pii, pos = [], [], [], 0
    length = 0
    for m in re.finditer(r"\{(\w+)\}", template):
        literal = template[pos:m.start()]
        out.append(literal)
        length += len(literal)
        value = values[m.group(1)]
        label = SLOT_LABELS.get(m.group(1))
        if label:
            span = {"text": value, "label": label, "start": length, "end": length + len(value)}
            (pii if label in PII_LABELS else entities).append(span)
        out.append(value)
        length += len(value)
        pos = m.end()
    out.append(template[pos:])
    return "".join(out), entities, pii


def make_case(rng, case_type: str, platform: str, index: int, split: str) -> dict:
    lang, style, template = rng.choice(TEMPLATES[case_type])
    place, dest = rng.sample(PLACES, 2)
    values = {
        "date": rng.choice(DATES), "time": rng.choice(TIMES), "place": place, "dest": dest,
        "fare": fake_amount(rng, 600, 3000), "paid": fake_amount(rng, 200, 550),
        "trip": fake_trip_id(rng), "name": rng.choice(FIRST_NAMES),
        "phone": fake_phone(rng), "plate": fake_plate(rng), "mpesa": fake_mpesa(rng),
    }
    if case_type != "out_of_scope" and rng.random() < 0.4:
        template = template + " " + rng.choice(PII_ADDONS)
    narrative, entities, pii = render(template, values)

    checklist = CHECKLISTS[case_type]
    pool = checklist["required"] + checklist["optional"]
    held = sorted(rng.sample(pool, rng.randint(0, len(pool)))) if pool else []
    # Order held items as they appear in the checklist, for readability.
    held = [item for item in pool if item in held]

    has_notice = case_type == "out_of_scope" or rng.random() < 0.85
    return {
        "schema_version": "1.0",
        "case_id": f"SYN-{index:03d}",
        "source": "synthetic",
        "split": split,
        "platform": platform,
        "notice_text": rng.choice(NOTICES[case_type]) if has_notice else None,
        "narrative": narrative,
        "evidence_held": held,
        "style": style,
        "language": lang,
        "labels": {
            "case_type": case_type,
            "entities": entities,
            "pii": pii,
            "evidence_missing": missing_evidence(case_type, held, CHECKLISTS),
            "policy_rules": policy_rules(case_type, platform),
        },
    }


def generate(seed: int = 42, per_type: int = 35, held_per_type: int = 10,
             out_of_scope: int = 10, held_out_of_scope: int = 5) -> list[dict]:
    rng = random.Random(seed)
    plan = []
    for case_type in IN_SCOPE_TYPES:
        plan += [(case_type, i < held_per_type) for i in range(per_type)]
    plan += [("out_of_scope", i < held_out_of_scope) for i in range(out_of_scope)]
    rng.shuffle(plan)

    cases = []
    for index, (case_type, held_out) in enumerate(plan, 1):
        platform = PLATFORMS[index % len(PLATFORMS)]  # even spread across platforms
        cases.append(make_case(rng, case_type, platform, index, "held_out" if held_out else "build"))
    return cases


# ---------------------------------------------------------------- optional LLM rewrite

REWRITE_PROMPT = """Rewrite this Kenyan ride-hailing driver's complaint so it sounds like a real driver typed it on a
phone: {language} style, tone {style}. Keep the same facts and keep the meaning. You may add the odd
typo or missing punctuation. Do not add new facts, names, numbers or places.
Every one of these strings must appear in your text exactly as written, character for character:
{keep}

Original:
{narrative}

Reply as JSON: {{"narrative": "..."}}"""


def respan(text: str, spans: list[dict]) -> list[dict] | None:
    """Find each labelled string in new text. None if any is missing."""
    taken, result = [], []
    for span in spans:
        start = 0
        while True:
            i = text.find(span["text"], start)
            if i < 0:
                return None
            if not any(i < e and s < i + len(span["text"]) for s, e in taken):
                break
            start = i + 1
        taken.append((i, i + len(span["text"])))
        result.append({**span, "start": i, "end": i + len(span["text"])})
    return result


def apply_rewrite(case: dict, new_text: str) -> bool:
    labels = case["labels"]
    entities = respan(new_text, labels["entities"])
    pii = respan(new_text, labels["pii"])
    if entities is None or pii is None:
        return False
    case["narrative"], labels["entities"], labels["pii"] = new_text, entities, pii
    return True


def gemini_rewrite(case: dict, model: str, api_key: str) -> str:
    keep = [s["text"] for s in case["labels"]["entities"] + case["labels"]["pii"]]
    prompt = REWRITE_PROMPT.format(
        language=case["language"], style=", ".join(case["style"]),
        keep="\n".join(f"- {k}" for k in keep) or "(none)", narrative=case["narrative"],
    )
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.9},
    }).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=body, headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.load(res)
    return json.loads(data["candidates"][0]["content"]["parts"][0]["text"])["narrative"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=HERE / "synthetic" / "cases.jsonl")
    parser.add_argument("--rewrite", choices=["gemini"], help="LLM rewrite pass (synthetic data only)")
    parser.add_argument("--model", default=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
                        help="confirm the exact model ID in Google AI Studio first")
    args = parser.parse_args()

    cases = generate(args.seed)

    if args.rewrite:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            print("GEMINI_API_KEY is not set", file=sys.stderr)
            return 2
        kept = 0
        for case in cases:
            try:
                kept += apply_rewrite(case, gemini_rewrite(case, args.model, key))
            except Exception as exc:  # keep the template text for this case
                print(f"{case['case_id']}: rewrite failed ({exc.__class__.__name__})", file=sys.stderr)
        print(f"rewrite kept for {kept}/{len(cases)} cases")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w") as f:
        for case in cases:
            f.write(json.dumps(case, ensure_ascii=False) + "\n")
    print(f"wrote {len(cases)} cases to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
