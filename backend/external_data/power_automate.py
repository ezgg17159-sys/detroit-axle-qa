"""Server-side Power Automate HTTP webhook proxy.

Webhook URLs stay in env vars — never sent to the browser.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings


FLOW_KEYS = {
    "avg-email": "POWER_AUTOMATE_AVG_EMAIL_WEBHOOK",
    "monitoring-email": "POWER_AUTOMATE_MONITORING_WEBHOOK",
    "share-audit": "POWER_AUTOMATE_SHARE_AUDIT_WEBHOOK",
    "forgot-password": "POWER_AUTOMATE_FORGOT_PASSWORD_WEBHOOK",
}


def webhook_url(flow: str) -> str:
    env_key = FLOW_KEYS.get(flow, "")
    if not env_key:
        return ""
    raw = (os.environ.get(env_key) or "").strip()
    if not raw:
        return ""
    # Explicit :443 sometimes stalls TLS on corporate networks / Python SSL.
    return raw.replace(":443/", "/")


def flow_configured(flow: str) -> bool:
    return bool(webhook_url(flow))


def test_email() -> str:
    """When set, QA emails are redirected here (dev/testing only)."""
    return (os.environ.get("POWER_AUTOMATE_TEST_EMAIL") or "").strip()


def email_test_override_allowed() -> bool:
    return bool(getattr(settings, "ALLOW_EMAIL_TEST_OVERRIDE", False))


def prepare_payload(flow: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Attach toEmail routing.

    Client emailTestMode / emailTestTo are ignored unless ALLOW_EMAIL_TEST_OVERRIDE
    is enabled (DEBUG by default). Production uses agent emails only, optionally
    redirected by POWER_AUTOMATE_TEST_EMAIL when override is allowed.
    """
    out = dict(payload or {})
    # Never forward client override fields to the webhook.
    out.pop("emailTestTo", None)
    client_mode = bool(out.pop("emailTestMode", False))
    client_to = str(payload.get("emailTestTo") or "").strip() if isinstance(payload, dict) else ""

    override = ""
    if email_test_override_allowed():
        if client_mode and client_to:
            override = client_to
        elif client_mode:
            override = test_email()
        elif "emailTestMode" not in (payload or {}):
            # No explicit client flag — allow env redirect in test environments.
            override = test_email()
        # Explicit emailTestMode=false → no override
    # Production (override disabled): always deliver to employee agentEmail.

    if flow == "monitoring-email":
        agent_email = str(out.get("agentEmail") or "").strip()
        out["toEmail"] = override or agent_email
        out["emailTestMode"] = bool(override)
        return out

    if flow == "forgot-password":
        agent_email = str(out.get("agentEmail") or out.get("email") or "").strip()
        out["toEmail"] = override or agent_email
        out["emailTestMode"] = bool(override)
        return out

    if flow == "avg-email" and isinstance(out.get("recipients"), list):
        recipients: list[Any] = []
        for row in out["recipients"]:
            if not isinstance(row, dict):
                recipients.append(row)
                continue
            item = dict(row)
            agent_email = str(
                item.get("agentEmail") or item.get("email") or ""
            ).strip()
            item["agentEmail"] = agent_email
            item["toEmail"] = override or agent_email
            item["emailTestMode"] = bool(override)
            recipients.append(item)
        out["recipients"] = recipients
        out["emailTestMode"] = bool(override)
        if override:
            out["toEmail"] = override

    return out


def post_to_flow(flow: str, payload: dict[str, Any], *, timeout: float = 15.0) -> dict[str, Any]:
    url = webhook_url(flow)
    if not url:
        raise RuntimeError(
            f"Power Automate webhook is not configured for “{flow}”. "
            f"Set {FLOW_KEYS.get(flow, flow)} in the project .env."
        )

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "DetroitAxle-QA/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            status_code = getattr(response, "status", 200)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        raise RuntimeError(f"Power Automate returned HTTP {exc.code}: {detail[:300]}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", None) or exc
        raise RuntimeError(f"Could not reach Power Automate: {reason}") from exc

    parsed: Any = None
    if raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw

    return {
        "ok": True,
        "flow": flow,
        "statusCode": status_code,
        "response": parsed,
    }


def post_to_flow_async(flow: str, payload: dict[str, Any], *, timeout: float = 15.0) -> None:
    """Fire-and-forget webhook call (forgot-password should not block the HTTP response)."""
    import logging
    import threading

    log = logging.getLogger(__name__)

    def _run() -> None:
        try:
            post_to_flow(flow, payload, timeout=timeout)
        except Exception:
            log.exception("Background Power Automate send failed for flow=%s", flow)

    threading.Thread(target=_run, name=f"pa-{flow}", daemon=True).start()
