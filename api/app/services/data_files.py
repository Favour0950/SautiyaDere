"""Find the shared files in the repo's data/ folder.

Locally data/ sits next to api/. In the Docker image it is copied to /srv/data.
"""

import json
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve()
_CANDIDATES = (_HERE.parents[3] / "data", _HERE.parents[2] / "data")  # repo, Docker


def load_json(name: str) -> Any:
    for data_dir in _CANDIDATES:
        path = data_dir / name
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"data/{name} not found")
