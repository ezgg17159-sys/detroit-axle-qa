"""Fill missing production .env keys without printing secret values."""

from __future__ import annotations

import secrets
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
        print("ERROR: .env not found", file=sys.stderr)
        return 1

    existing = parse_env(ENV_PATH.read_text(encoding="utf-8"))
    auth_pw = existing.get("DJANGO_DB_PASSWORD") or secrets.token_urlsafe(24)
    secret = existing.get("DJANGO_SECRET_KEY")
    if not secret or secret in {"", "change-me-to-a-long-random-string"}:
        secret = secrets.token_urlsafe(48)

    # Preserve existing QA DB + Power Automate URLs; add prod keys.
    # Local Docker prod stack uses HTTP on localhost until real HTTPS host is known.
    lines = [
        "# Detroit Axle QA — local/prod secrets (gitignored). Do not commit.",
        "",
        "# --- External QA Postgres ---",
        f"QA_USE_EXTERNAL_DB={existing.get('QA_USE_EXTERNAL_DB', 'true')}",
        f"QA_EXTERNAL_SCHEMA={existing.get('QA_EXTERNAL_SCHEMA', 'db_external_data')}",
        f"QA_DB_NAME={existing.get('QA_DB_NAME', '')}",
        f"QA_DB_USER={existing.get('QA_DB_USER', '')}",
        f"QA_DB_PASSWORD={existing.get('QA_DB_PASSWORD', '')}",
        f"QA_DB_HOST={existing.get('QA_DB_HOST', '')}",
        f"QA_DB_PORT={existing.get('QA_DB_PORT', '5432')}",
        "QA_DB_SSLMODE=prefer",
        "QA_DB_CONNECT_TIMEOUT=8",
        "",
        "# --- Django / auth (production-ready; docker compose forces DEBUG=false) ---",
        f"DJANGO_SECRET_KEY={secret}",
        "DEBUG=false",
        "USE_HTTPS=false",
        "SECURE_SSL_REDIRECT=false",
        "ALLOWED_HOSTS=localhost,127.0.0.1",
        "CORS_ORIGINS=http://localhost:8000,http://127.0.0.1:8000,http://localhost:5173,http://127.0.0.1:5173",
        "CSRF_TRUSTED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000,http://localhost:5173,http://127.0.0.1:5173",
        "ALLOW_CLOUDFLARE_TUNNEL_CORS=false",
        "FRONTEND_APP_URL=http://127.0.0.1:8000",
        "VITE_APP_URL=http://127.0.0.1:8000",
        "ALLOWED_EMAIL_DOMAINS=detroitaxle.com",
        "VITE_ALLOWED_EMAIL_DOMAINS=detroitaxle.com",
        "ALLOW_EMAIL_TEST_OVERRIDE=false",
        "",
        "# --- Django auth Postgres (docker compose service: auth-db) ---",
        "DJANGO_DB_ENGINE=django.db.backends.postgresql",
        "DJANGO_DB_NAME=daq_auth",
        "DJANGO_DB_USER=daq",
        f"DJANGO_DB_PASSWORD={auth_pw}",
        "DJANGO_DB_HOST=127.0.0.1",
        "DJANGO_DB_PORT=5433",
        "DJANGO_DB_CONN_MAX_AGE=60",
        "DJANGO_DB_SSLMODE=disable",
        "",
        "# --- Power Automate webhooks ---",
        f"POWER_AUTOMATE_AVG_EMAIL_WEBHOOK={existing.get('POWER_AUTOMATE_AVG_EMAIL_WEBHOOK', '')}",
        f"POWER_AUTOMATE_MONITORING_WEBHOOK={existing.get('POWER_AUTOMATE_MONITORING_WEBHOOK', '')}",
        f"POWER_AUTOMATE_FORGOT_PASSWORD_WEBHOOK={existing.get('POWER_AUTOMATE_FORGOT_PASSWORD_WEBHOOK', '')}",
        f"POWER_AUTOMATE_SHARE_AUDIT_WEBHOOK={existing.get('POWER_AUTOMATE_SHARE_AUDIT_WEBHOOK', '')}",
        "",
        "# Leave blank in production (emails go to employees).",
        "# POWER_AUTOMATE_TEST_EMAIL=",
        "",
        "# When you have a real public host, set:",
        "# USE_HTTPS=true",
        "# SECURE_SSL_REDIRECT=true",
        "# FRONTEND_APP_URL=https://qa.your-domain.com",
        "# ALLOWED_HOSTS=qa.your-domain.com",
        "# CORS_ORIGINS=https://qa.your-domain.com",
        "# CSRF_TRUSTED_ORIGINS=https://qa.your-domain.com",
        "# QA_DB_SSLMODE=require",
        "",
    ]
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    missing = []
    for key in (
        "QA_DB_HOST",
        "DJANGO_SECRET_KEY",
        "DJANGO_DB_PASSWORD",
        "POWER_AUTOMATE_AVG_EMAIL_WEBHOOK",
        "POWER_AUTOMATE_MONITORING_WEBHOOK",
        "POWER_AUTOMATE_FORGOT_PASSWORD_WEBHOOK",
        "POWER_AUTOMATE_SHARE_AUDIT_WEBHOOK",
    ):
        val = parse_env(ENV_PATH.read_text(encoding="utf-8")).get(key, "")
        status = "OK" if val else "MISSING"
        if not val:
            missing.append(key)
        print(f"{key}: {status}")

    print("Wrote .env (secrets not printed).")
    if missing:
        print("Still need values for: " + ", ".join(missing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
