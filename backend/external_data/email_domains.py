"""Allowed email-domain helpers for managed users / provisioning."""

from __future__ import annotations

from django.conf import settings


class EmailDomainError(ValueError):
    """Raised when an email is outside ALLOWED_EMAIL_DOMAINS."""


def allowed_email_domains() -> list[str]:
    raw = getattr(settings, "ALLOWED_EMAIL_DOMAINS", None)
    if isinstance(raw, (list, tuple)) and raw:
        return [str(d).strip().lower().lstrip("@") for d in raw if str(d).strip()]
    return ["detroitaxle.com"]


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def email_domain(email: str) -> str:
    value = normalize_email(email)
    if "@" not in value:
        return ""
    return value.rsplit("@", 1)[-1]


def assert_allowed_email(email: str) -> str:
    """Return normalized email or raise EmailDomainError."""
    value = normalize_email(email)
    if not value or "@" not in value:
        raise EmailDomainError("A valid work email is required.")
    domain = email_domain(value)
    allowed = allowed_email_domains()
    if domain not in allowed:
        domains = ", ".join(f"@{d}" for d in allowed)
        raise EmailDomainError(f"Email must use an allowed domain ({domains}).")
    return value
