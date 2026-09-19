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
    if not USE_EXTERNAL_DB:
        return False
    required = ("dbname", "user", "password", "host")
    return all(str(DB_CONFIG.get(key) or "").strip() for key in required)


def schema_name() -> str:
    return EXTERNAL_SCHEMA


def connection_status() -> dict[str, Any]:
    return {
        "enabled": bool(USE_EXTERNAL_DB),
        "configured": external_db_enabled(),
        "schema": EXTERNAL_SCHEMA,
        "host": DB_CONFIG.get("host") or "",
        "port": DB_CONFIG.get("port") or "",
        "dbname": DB_CONFIG.get("dbname") or "",
    }


@contextmanager
def external_connection() -> Iterator[Any]:
    if not USE_EXTERNAL_DB:
        raise RuntimeError("External DB is disconnected (USE_EXTERNAL_DB=False in db_config.py).")
    if not external_db_enabled():
        raise RuntimeError(
            "External DB credentials are missing. Fill the project-root .env (QA_DB_*)."
        )

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
        connect_timeout=int(DB_CONFIG.get("connect_timeout") or 8),
        sslmode=str(DB_CONFIG.get("sslmode") or "prefer"),
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
