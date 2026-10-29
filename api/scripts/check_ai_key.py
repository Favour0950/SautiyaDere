"""T05: check the Claude API key works and returns schema-valid JSON.

    cd api && source .venv/bin/activate
    pip install -r requirements.txt
    python scripts/check_ai_key.py        # reads ANTHROPIC_API_KEY from api/.env or the shell

Uses only a synthetic story. Never run this with a real driver's text.
"""

import sys
from pathlib import Path

import anthropic
from pydantic import BaseModel

MODEL = "claude-haiku-5-5"
STORY = (
    "On Friday 9 October around 8:40pm I picked a client at Westlands going to South B. "
    "The app showed KSh 1,850, she paid KSh 900 on M-Pesa. Trip ID ends 7Q2K."
)


class Facts(BaseModel):
    date: str | None
    time: str | None
    places: list[str]
    amounts: list[str]
    trip_id: str | None


def load_env_file() -> None:
    import os

    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and not line.lstrip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip())


def main() -> int:
    load_env_file()
    client = anthropic.Anthropic()
    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": f"Extract the facts from this driver's story.\n\n{STORY}"}],
            output_format=Facts,
        )
    except anthropic.AuthenticationError:
        print("FAIL: key rejected. Check ANTHROPIC_API_KEY in api/.env.")
        return 1
    except anthropic.PermissionDeniedError:
        print("FAIL: key has no access to this model or the account has no credit.")
        return 1
    except anthropic.NotFoundError:
        print(f"FAIL: model {MODEL} not found.")
        return 1
    except anthropic.RateLimitError:
        print("FAIL: rate limited or spend limit reached.")
        return 1
    except anthropic.APIConnectionError:
        print("FAIL: could not reach the API. Check the network.")
        return 1

    if response.stop_reason == "refusal":
        print("FAIL: request was refused.")
        return 1
    print("OK:", response.parsed_output.model_dump_json(indent=2))
    usage = response.usage
    print(f"tokens in/out: {usage.input_tokens}/{usage.output_tokens}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
