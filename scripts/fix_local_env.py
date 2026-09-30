"""Rewrite .env for local `dev.ps1` (SQLite auth). Preserve secrets/webhooks."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, val = raw.split("=", 1)
        out[key.strip()] = val.strip()
    return out


def main() -> int:
    if not ENV_PATH.exists():
        print("ERROR: .env missing", file=sys.stderr)
        return 1

    existing = parse_env(ENV_PATH.read_text(encoding="utf-8"))

    def get(*keys: str, default: str = "") -> str:
        for key in keys:
            if existing.get(key):
                return existing[key]
        return default

    secret = get("DJANGO_SECRET_KEY", default="django-insecure-dev-only-change-me-before-production")
    lines = [
        "# Local development (.env is gitignored).",
        "# For Docker production stack, run: .\\scripts\\prod_up.ps1",
        "# docker-compose overrides DEBUG/DB host; keep DJANGO_DB_PASSWORD set below for compose.",
        "",
        "# --- External QA Postgres ---",
        f"QA_USE_EXTERNAL_DB={get('QA_USE_EXTERNAL_DB', default='true')}",
        f"QA_EXTERNAL_SCHEMA={get('QA_EXTERNAL_SCHEMA', default='db_external_data')}",
        f"QA_DB_NAME={get('QA_DB_NAME')}",
        f"QA_DB_USER={get('QA_DB_USER')}",
        f"QA_DB_PASSWORD={get('QA_DB_PASSWORD')}",
        f"QA_DB_HOST={get('QA_DB_HOST')}",
        f"QA_DB_PORT={get('QA_DB_PORT', default='5432')}",
        "QA_DB_SSLMODE=prefer",
        "QA_DB_CONNECT_TIMEOUT=8",
        "",
        "# --- Django local (SQLite auth DB — do NOT set DJANGO_DB_ENGINE here) ---",
        f"DJANGO_SECRET_KEY={secret}",
        "DEBUG=true",
        "USE_HTTPS=false",
        "SECURE_SSL_REDIRECT=false",
        "ALLOWED_HOSTS=localhost,127.0.0.1",
        "CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
        "CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
        "FRONTEND_APP_URL=http://127.0.0.1:5173",
        "VITE_APP_URL=http://127.0.0.1:5173",
        "ALLOWED_EMAIL_DOMAINS=detroitaxle.com",
        "VITE_ALLOWED_EMAIL_DOMAINS=detroitaxle.com",
        "ALLOW_EMAIL_TEST_OVERRIDE=true",
        "",
        "# Auth Postgres password used only by docker compose (auth-db).",
        "# Leave DJANGO_DB_ENGINE unset so local runserver uses SQLite.",
        f"DJANGO_DB_NAME={get('DJANGO_DB_NAME', default='daq_auth')}",
        f"DJANGO_DB_USER={get('DJANGO_DB_USER', default='daq')}",
        f"DJANGO_DB_PASSWORD={get('DJANGO_DB_PASSWORD', default='')}",
        "",
        "# --- Power Automate ---",
        f"POWER_AUTOMATE_AVG_EMAIL_WEBHOOK={get('POWER_AUTOMATE_AVG_EMAIL_WEBHOOK')}",
        f"POWER_AUTOMATE_MONITORING_WEBHOOK={get('POWER_AUTOMATE_MONITORING_WEBHOOK')}",
        f"POWER_AUTOMATE_FORGOT_PASSWORD_WEBHOOK={get('POWER_AUTOMATE_FORGOT_PASSWORD_WEBHOOK')}",
        f"POWER_AUTOMATE_SHARE_AUDIT_WEBHOOK={get('POWER_AUTOMATE_SHARE_AUDIT_WEBHOOK')}",
        "",
        f"SUPERADMIN_PASSWORD={get('SUPERADMIN_PASSWORD')}",
        "",
    ]
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Updated .env for local development (SQLite). Restart .\\dev.ps1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
