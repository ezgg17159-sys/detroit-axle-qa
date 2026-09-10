"""Connection helpers for db_external_data via project-root db_config.py."""

from __future__ import annotations

import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from db_config import DB_CONFIG, EXTERNAL_SCHEMA, USE_EXTERNAL_DB  # noqa: E402


def external_db_enabled() -> bool:
    return bool(USE_EXTERNAL_DB)


def schema_name() -> str:
    return EXTERNAL_SCHEMA


@contextmanager
def external_connection() -> Iterator[Any]:
    if not USE_EXTERNAL_DB:
        raise RuntimeError("External DB is disconnected (USE_EXTERNAL_DB=False in db_config.py).")

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError as exc:
        raise RuntimeError("psycopg2 is required for external DB access.") from exc

    conn = psycopg2.connect(
        dbname=DB_CONFIG["dbname"],
        user=DB_CONFIG["user"],
        password=DB_CONFIG["password"],
        host=DB_CONFIG["host"],
        port=DB_CONFIG["port"],
        cursor_factory=RealDictCursor,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
