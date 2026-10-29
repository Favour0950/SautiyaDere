# Privacy and personal-details redaction

How Sauti ya Dere keeps drivers' personal details private, and which models do the redaction.
Feeds T15 (personal-details filter) and T37 (privacy check). Versions and licences checked 28 Oct 2026.

## The rule

1. **Nothing about a case is stored on our side by default.** The case lives on the driver's phone (Dexie / IndexedDB).
2. **The server only holds text while it handles one request.** It keeps nothing in memory after the response and writes nothing to logs.
3. **No personal details leave our server.** They are replaced with placeholders before any text goes to the AI service.
4. **We store data only after explicit opt-in consent, for a stated purpose.** Case tracking is the first such purpose. We store the minimum, and we delete it on a schedule or when the driver asks.

## How one request flows

```
Phone                          Backend (Cloud Run, in memory only)                 Claude API
-----                          -----------------------------------                 ----------
story + notice  --TLS-->  1. normalise (O->0, l->1 inside digit runs)
                          2. detect personal details (regex + name model + lists)
                          3. replace with <PERSON_1>, <PHONE_1>, ...
                             mapping kept in a local variable for this request only
                          4. spaCy facts, case type, gap checker (on our server)
                          5. send ONLY placeholder text  ---------------------->  draft wording
                          6. put real values back into the draft  <------------
appeal + facts  <--TLS--  7. return; request ends, mapping and text are gone
```

- **Step 6 runs on the server.** The placeholder mapping never leaves the process, never goes to the AI service, and is never logged. The appeal goes back to the driver's own phone, so restoring the names there is safe.
- **What the AI service sees.** Its prompt tells it to copy placeholders unchanged. If a placeholder comes back changed or missing, the server uses its own template wording for that sentence. It does not guess.
- **Facts the appeal needs stay in the text.** Dates, times, general areas (Westlands, CBD), KSh amounts and trip IDs are not personal details here.

### What "not stored" means in practice

| Where data could leak | What we do |
|---|---|
| Uvicorn access log | Off (`--no-access-log`). Already done in T10 |
| FastAPI validation errors | Return the field and message only, never the input. Already done in T10 |
| Exceptions and tracebacks | Log the error type and request ID only. Never log `locals()` or the request body |
| Cloud Run request logs | These record the method, path, status and latency, not the body. No query strings carry case data |
| AI service | Gets placeholder text only. The Claude API does not train on API data and deletes it within 30 days (Resource List) |
| Database | None for the 22 Oct build |
| Real test set (T17) | Private Drive folder, already redacted, deleted at the end of the project unless the driver agreed to longer use |

## Choosing the models

We need something that finds Kenyan names in mixed English, Swahili and Sheng, runs on a CPU, and fits in 2 GiB alongside FastAPI and spaCy. No single model does all of that, so the filter has layers.

| Option | Size | Licence | Swahili | Verdict |
|---|---|---|---|---|
| [Presidio](https://presidio.dataprivacystack.org/) `presidio-analyzer` 2.2.366 (27 Oct 2026) | Library | MIT | Through the models it hosts | **Use as the frame.** It is now community-run, at github.com/data-privacy-stack/presidio. It supports Python 3.11 to 3.14 and has a built-in GLiNER recognizer |
| [urchade/gliner_multi_pii-v1](https://huggingface.co/urchade/gliner_multi_pii-v1) | ~1.16 GB fp32; an ONNX build exists | Apache-2.0 | Not measured | **Use for names.** You give it labels at run time ("person"), and Presidio has a ready-made recognizer for it |
| [masakhane/afroxlmr-large-ner-masakhaner-1.0_2.0](https://huggingface.co/masakhane/afroxlmr-large-ner-masakhaner-1.0_2.0) | ~2.4 GB fp32 | AFL-3.0 | **Yes** (F1 88 to 93) | **Upgrade path** if GLiNER misses too many Swahili names. Needs int8 ONNX to fit |
| [openai/privacy-filter](https://huggingface.co/openai/privacy-filter) | ~1 to 1.5B total, 50M active | Apache-2.0 | Mainly English | **Possible alternative.** It also tags dates, which we must keep, so filter its output |
| [nvidia/gliner-pii](https://huggingface.co/nvidia/gliner-pii) | ~570M | NVIDIA Open Model | English only | Too heavy, and English only |
| [fastino/GLiNER2-Guardrails-PII-Multi](https://huggingface.co/fastino/GLiNER2-Guardrails-PII-Multi) | ~0.3B | Apache-2.0 | European languages only | Small, but Presidio needs a custom wrapper for it. Keep as a fallback |
| iiiorg/piiranha-v1 | ~0.3B | CC-BY-NC-ND | No | **Avoid** because of the licence |
| Google SDP, AWS Comprehend, Azure AI Language | Hosted | Paid per use | Azure only | **Avoid.** The raw story would go to a third party *before* redaction, which defeats the point |
| A small local LLM that rewrites the text | 0.5 to 1 GB at 4-bit | Varies | Weak on Sheng | **Avoid.** Slow on a CPU, and it can rewrite facts |

### The pipeline (T15)

**1. Regex recognizers for fixed formats** (Presidio `PatternRecognizer`; context words raise the score):

| Entity | Starting pattern | Guard against false hits |
|---|---|---|
| PHONE | `(?:\+?254\|0)(?:7\d\|1[01])\d{7}`, allowing spaces or dashes | None needed |
| PLATE | `\bK[A-Z]{2}\s?\d{3}[A-Z]?\b`, plus `\bKM[A-Z]{2}\s?\d{3}[A-Z]\b` for motorbikes | None needed |
| MPESA_CODE | `\b[A-Z0-9]{10}\b` | At least 2 letters and 2 digits. Boost the score near "M-Pesa", "confirmed" or "code" |
| ID_NUMBER | `\b\d{7,8}\b` | Only near "ID", "kitambulisho" or "namba ya ID", so fares and trip IDs are not hit |
| EMAIL | Presidio built-in | None needed |
| ADDRESS | "house no.", "plot", "apt", "nyumba namba" + number | None needed |

**2. One model for names.** Use Presidio's `GLiNERRecognizer` with `urchade/gliner_multi_pii-v1`, labels `["person"]`, threshold about 0.4. Remove `SpacyRecognizer` so names are not tagged twice. Load the model once at startup.

**3. Lists.**
- **Allow-list** (never redact): Nairobi estates, stages and towns, the platform names, "M-Pesa", and common Sheng words.
- **Deny-list:** about 2,000 common Kenyan first names and surnames, matched case-insensitively, because drivers often type names in lower case ("nilimpigia wanjiku").

**4. Turn off Presidio's DATE_TIME, LOCATION and NRP entities.** The appeal needs those facts.

**5. Reversible placeholders.** Use Presidio's documented pseudonymisation sample (`InstanceCounterAnonymizer` / `DeanonymizeEngine`) to produce `<PERSON_1>`. Create a **new mapping dict for every request**. The sample's shared mapping is not thread-safe and would mix up drivers' data.

### Known failure modes to test

- **Names that are also words:** Baraka, Imani, Neema, Amani, Zawadi, Mercy, Grace. Rely on the model plus context words ("anaitwa", "jina", "mteja", "rider").
- **Names joined to Swahili grammar:** "kwa Otieno", "na Wanjiku", "Kamau's".
- **Areas versus exact addresses:** "Kawangware" is an area, so it is allowed. "nyumba ya pili Kawangware stage, gate 4" is an address.
- **Fares, trip IDs and odometer readings that look like ID numbers.** This is why the ID pattern needs context words.
- **All-caps shouting** ("NIMECHOKA SANA") looking like an M-Pesa code. This is why the code needs letters and digits.
- **Typos inside numbers** ("O712…" with the letter O, or "7l2" with a lower-case L). This is why step 1 normalises the text.

### How we measure it

- **Synthetic cases.** `data/generate.py` puts invented names, phone numbers, plates and M-Pesa codes into about 40% of the stories and labels them under `labels.pii` with exact offsets. That gives a score for the filter on every run.
- **Real test set (T17).** Mercy's real test set is the deciding check (T37), done by hand because Presidio itself warns it cannot catch everything.
- **Targets.**
  - PERSON and PHONE: at least 95% recall. Missing a detail is worse than over-redacting.
  - Entities the appeal needs (dates, places, amounts): kept at least 98% of the time.
  - Memory: the backend stays under 1.5 GiB, measured on Cloud Run.

### Still to confirm before T15

- `gliner` and `onnxruntime` (or `torch`) wheels exist for Python 3.14.
- spaCy works on 3.14.
- Actual memory use and response time on Cloud Run with 2 GiB.

## Consent-based storage (case tracking)

Storage is off unless the driver turns it on for a stated purpose. Case tracking is the first purpose.

**First check whether the server is needed at all.** Tracking for one driver on one phone can live entirely in Dexie. Server storage is only needed for:
- a driver moving to a new phone,
- TAWU following up on a case,
- or anonymous statistics on outcomes.

**If we do store:**

- **Opt-in screen.** A plain-language screen in English and Swahili, unticked by default. It says what is kept, why, for how long, and how to delete it. We record the date, the consent version and the scope (`case_tracking`, `test_set`, `training`; this matches `consent` in `data/schema.json`).
- **What we keep.** The minimum:
  - a random case ID (not the phone number),
  - case type, platform and status,
  - key dates,
  - which checklist items are done.
- **What we never keep.** The narrative, the notice text or screenshots. If a later feature needs the story, store only the redacted version, after a second consent.
- **Retention.** Delete automatically a set time after the case closes (suggested 90 days), and at once when the driver asks. The delete control sits in the app, next to the opt-in.
- **Separate store.** A separate table or project from anything else, with its own access list.
- **Law.** Check with a mentor against the Data Protection Act 2019:
  - consent conditions (s.32),
  - data minimisation (s.25),
  - the right to erasure (s.40),
  - whether the team must register with the ODPC as a data controller before storing anything.
