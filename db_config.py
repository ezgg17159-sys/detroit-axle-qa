"""
Loads Postgres settings for schema `db_external_data` from the project-root `.env`.

Do not put secrets in this file — use `.env` only.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    try:
        from dotenv import load_dotenv
    except ImportError:
        # Minimal fallback if python-dotenv is not installed yet
        for line in env_path.read_text(encoding="utf-8").splitlines():
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
        return

    load_dotenv(env_path, override=False)


_load_dotenv()

EXTERNAL_SCHEMA = os.environ.get("QA_EXTERNAL_SCHEMA", "db_external_data").strip() or "db_external_data"

USE_EXTERNAL_DB = os.environ.get("QA_USE_EXTERNAL_DB", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

DB_CONFIG = {
    "dbname": os.environ.get("QA_DB_NAME", "").strip(),
    "user": os.environ.get("QA_DB_USER", "").strip(),
    "password": os.environ.get("QA_DB_PASSWORD", ""),
    "host": os.environ.get("QA_DB_HOST", "127.0.0.1").strip() or "127.0.0.1",
    "port": int(os.environ.get("QA_DB_PORT", "5432") or "5432"),
    "sslmode": (os.environ.get("QA_DB_SSLMODE") or "prefer").strip() or "prefer",
    "connect_timeout": int(os.environ.get("QA_DB_CONNECT_TIMEOUT") or "8"),
}
