"""List managed users with missing or non-work emails (read-only)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.chdir(ROOT / "backend")

# Load Django settings via manage path
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.conf import settings

from external_data.email_domains import allowed_email_domains, email_domain, normalize_email
from external_data.portal_data import list_managed_users


def main() -> int:
    try:
        payload = list_managed_users(limit=2000, offset=0)
    except Exception as exc:
        print(f"Could not query managed users: {exc}")
        return 1

    items = payload.get("items") or []
    allowed = set(allowed_email_domains())
    bad: list[str] = []
    for row in items:
        name = str(row.get("agentName") or row.get("alias") or row.get("id") or "?")
        email = normalize_email(str(row.get("email") or ""))
        if not email:
            bad.append(f"MISSING  {name}")
            continue
        domain = email_domain(email)
        if domain not in allowed:
            bad.append(f"BAD      {name}  <{email}>")

    print(f"Checked {len(items)} managed users (allowed: {', '.join(sorted(allowed))})")
    if not bad:
        print("All profiles have an allowed work email.")
        return 0
    print(f"{len(bad)} need fixing:")
    for line in bad:
        print(f"  {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
