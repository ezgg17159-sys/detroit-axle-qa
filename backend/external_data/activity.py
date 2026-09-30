"""Admin activity log — records mutating API actions for staff review."""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from rest_framework.response import Response
from rest_framework.views import APIView

from .db import external_connection, schema_name

log = logging.getLogger(__name__)

SENSITIVE_KEYS = {
    "password",
    "password1",
    "password2",
    "new_password",
    "old_password",
    "token",
    "refresh",
    "access",
    "secret",
    "sig",
}

SKIP_PATH_PREFIXES = (
    "/api/activity-logs",
    "/api/auth/csrf",
    "/api/auth/me",
    "/api/auth/refresh",
    "/api/external/status",
)

ENTITY_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^/api/audits(?:/([^/]+))?/?$"), "audit"),
    (re.compile(r"^/api/case-types(?:/([^/]+))?/?$"), "case-type"),
    (re.compile(r"^/api/metrics(?:/([^/]+))?/?$"), "metric"),
    (re.compile(r"^/api/monitoring(?:/([^/]+))?/?$"), "monitoring"),
    (re.compile(r"^/api/production/?$"), "production"),
    (re.compile(r"^/api/agent-feedback(?:/([^/]+))?/?$"), "agent-feedback"),
    (re.compile(r"^/api/supervisor-requests(?:/([^/]+))?(?:/replies)?/?$"), "supervisor-request"),
    (re.compile(r"^/api/coaching(?:/([^/]+))?/?$"), "coaching"),
    (re.compile(r"^/api/managed-users(?:/([^/]+))?/?$"), "managed-user"),
    (re.compile(r"^/api/role-permissions/?$"), "role-permissions"),
    (re.compile(r"^/api/evaluation-progress/day-off/?$"), "day-off"),
    (re.compile(r"^/api/evaluation-progress/scheduled-day-off/?$"), "scheduled-day-off"),
    (re.compile(r"^/api/integrations/power-automate(?:/([^/]+))?/?$"), "power-automate"),
    (re.compile(r"^/api/auth/login/?$"), "auth"),
    (re.compile(r"^/api/auth/logout/?$"), "auth"),
    (re.compile(r"^/api/auth/forgot-password/?$"), "auth"),
    (re.compile(r"^/api/auth/reset-password/?$"), "auth"),
    (re.compile(r"^/api/auth/change-password/?$"), "auth"),
    (re.compile(r"^/api/auth/provision-login/?$"), "auth"),
]


def _ensure_table(cur, schema: str) -> None:
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {schema}.qa_activity_logs (
          id UUID PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          actor_user_id TEXT,
          actor_name TEXT,
          actor_email TEXT,
          actor_role TEXT,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          summary TEXT NOT NULL,
          detail JSONB,
          request_path TEXT,
          request_method TEXT,
          team TEXT,
          ip_address TEXT
        )
        """
    )
    cur.execute(
        f"""
        CREATE INDEX IF NOT EXISTS qa_activity_logs_created_at_idx
          ON {schema}.qa_activity_logs (created_at DESC)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX IF NOT EXISTS qa_activity_logs_actor_email_idx
          ON {schema}.qa_activity_logs (actor_email)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX IF NOT EXISTS qa_activity_logs_entity_type_idx
          ON {schema}.qa_activity_logs (entity_type)
        """
    )


def _sanitize(value: Any, *, depth: int = 0) -> Any:
    if depth > 4:
        return "…"
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            key_l = str(key).lower()
            if key_l in SENSITIVE_KEYS or "password" in key_l or "token" in key_l:
                out[str(key)] = "[redacted]"
            else:
                out[str(key)] = _sanitize(item, depth=depth + 1)
        return out
    if isinstance(value, list):
        if len(value) > 40:
            return [_sanitize(item, depth=depth + 1) for item in value[:40]] + ["…"]
        return [_sanitize(item, depth=depth + 1) for item in value]
    if isinstance(value, str) and len(value) > 500:
        return value[:500] + "…"
    return value


def _action_from_method(method: str) -> str:
    return {
        "POST": "create",
        "PUT": "update",
        "PATCH": "update",
        "DELETE": "delete",
    }.get(method.upper(), method.lower())


def _parse_entity(path: str) -> tuple[str, str | None]:
    clean = path.split("?", 1)[0]
    for pattern, entity in ENTITY_RULES:
        match = pattern.match(clean)
        if match:
            entity_id = None
            if match.lastindex:
                entity_id = match.group(1) or None
            return entity, entity_id
    return "api", None


def _summary_for(
    *,
    action: str,
    entity_type: str,
    entity_id: str | None,
    method: str,
    path: str,
    body: Any,
) -> str:
    label = entity_type.replace("-", " ")
    if entity_type == "auth":
        clean = path.rstrip("/")
        if clean.endswith("provision-login"):
            return "Provisioned login account"
        if clean.endswith("change-password"):
            return "Changed password"
        if clean.endswith("login"):
            return "Signed in"
        if clean.endswith("logout"):
            return "Signed out"
        if "forgot-password" in path:
            return "Requested password reset"
        if "reset-password" in path:
            return "Reset password"
        return "Auth action"
    if entity_type == "day-off":
        return "Toggled evaluation day off"
    if entity_type == "scheduled-day-off":
        return "Updated scheduled day off"
    if entity_type == "production":
        count = None
        if isinstance(body, dict):
            rows = body.get("rows")
            if isinstance(rows, list):
                count = len(rows)
        return f"Imported production data ({count} rows)" if count is not None else "Imported production data"
    if entity_type == "role-permissions":
        return "Updated role permissions"
    if entity_type == "power-automate":
        flow = entity_id or "flow"
        return f"Triggered Power Automate ({flow})"
    if action == "create":
        name = ""
        if isinstance(body, dict):
            name = str(
                body.get("agentName")
                or body.get("name")
                or body.get("alias")
                or body.get("order")
                or ""
            ).strip()
        return f"Created {label}" + (f" — {name}" if name else "")
    if action == "update":
        return f"Updated {label}" + (f" {entity_id}" if entity_id else "")
    if action == "delete":
        return f"Deleted {label}" + (f" {entity_id}" if entity_id else "")
    return f"{method} {path}"


def insert_activity_log(
    *,
    actor: dict[str, Any] | None,
    action: str,
    entity_type: str,
    entity_id: str | None,
    summary: str,
    detail: Any = None,
    request_path: str = "",
    request_method: str = "",
    team: str | None = None,
    ip_address: str | None = None,
) -> None:
    actor = actor or {}
    schema = schema_name()
    detail_json = json.dumps(_sanitize(detail) if detail is not None else {})
    with external_connection() as conn:
        with conn.cursor() as cur:
            _ensure_table(cur, schema)
            cur.execute(
                f"""
                INSERT INTO {schema}.qa_activity_logs (
                  id, created_at,
                  actor_user_id, actor_name, actor_email, actor_role,
                  action, entity_type, entity_id, summary, detail,
                  request_path, request_method, team, ip_address
                )
                VALUES (
                  %s, NOW(),
                  %s, %s, %s, %s,
                  %s, %s, %s, %s, %s::jsonb,
                  %s, %s, %s, %s
                )
                """,
                (
                    str(uuid.uuid4()),
                    str(actor.get("userId") or "") or None,
                    str(actor.get("name") or "") or None,
                    str(actor.get("email") or "") or None,
                    str(actor.get("role") or "") or None,
                    action,
                    entity_type,
                    entity_id,
                    summary[:500],
                    detail_json,
                    request_path[:400] or None,
                    request_method[:16] or None,
                    (team or None),
                    ip_address,
                ),
            )


def list_activity_logs(
    *,
    search: str = "",
    entity_type: str = "",
    actor: str = "",
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    schema = schema_name()
    limit = max(1, min(int(limit or 100), 500))
    offset = max(0, int(offset or 0))
    clauses = ["TRUE"]
    params: list[Any] = []

    if search.strip():
        clauses.append(
            "("
            "summary ILIKE %s OR actor_name ILIKE %s OR actor_email ILIKE %s "
            "OR entity_type ILIKE %s OR entity_id ILIKE %s OR action ILIKE %s"
            ")"
        )
        like = f"%{search.strip()}%"
        params.extend([like, like, like, like, like, like])
    if entity_type.strip():
        clauses.append("entity_type = %s")
        params.append(entity_type.strip())
    if actor.strip():
        clauses.append("(actor_email ILIKE %s OR actor_name ILIKE %s)")
        like = f"%{actor.strip()}%"
        params.extend([like, like])

    where_sql = " AND ".join(clauses)
    with external_connection() as conn:
        with conn.cursor() as cur:
            _ensure_table(cur, schema)
            cur.execute(
                f"SELECT COUNT(*)::int AS n FROM {schema}.qa_activity_logs WHERE {where_sql}",
                params,
            )
            total = int((cur.fetchone() or {}).get("n") or 0)
            cur.execute(
                f"""
                SELECT
                  id, created_at,
                  actor_user_id, actor_name, actor_email, actor_role,
                  action, entity_type, entity_id, summary, detail,
                  request_path, request_method, team, ip_address
                FROM {schema}.qa_activity_logs
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = cur.fetchall() or []

    items = []
    for row in rows:
        created = row.get("created_at")
        items.append(
            {
                "id": str(row.get("id") or ""),
                "createdAt": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
                "actorUserId": row.get("actor_user_id") or "",
                "actorName": row.get("actor_name") or "",
                "actorEmail": row.get("actor_email") or "",
                "actorRole": row.get("actor_role") or "",
                "action": row.get("action") or "",
                "entityType": row.get("entity_type") or "",
                "entityId": row.get("entity_id") or "",
                "summary": row.get("summary") or "",
                "detail": row.get("detail") if isinstance(row.get("detail"), dict) else {},
                "requestPath": row.get("request_path") or "",
                "requestMethod": row.get("request_method") or "",
                "team": row.get("team") or "",
                "ipAddress": row.get("ip_address") or "",
            }
        )
    return {"connected": True, "items": items, "total": total}


def _client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR") or ""
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def _actor_from_request(request) -> dict[str, Any]:
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        body = getattr(request, "data", None)
        email = ""
        if isinstance(body, dict):
            email = str(body.get("login") or body.get("email") or "").strip()
        return {
            "userId": "",
            "name": email or "Anonymous",
            "email": email,
            "role": "",
        }
    name = (
        f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip()
        or getattr(user, "username", "")
        or "User"
    )
    role = "admin" if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False) else "qa"
    return {
        "userId": str(getattr(user, "id", "") or ""),
        "name": name,
        "email": getattr(user, "email", "") or "",
        "role": role,
    }


def log_request_activity(request, response: Response) -> None:
    method = (request.method or "").upper()
    if method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return
    path = request.path or ""
    if not path.startswith("/api/"):
        return
    for prefix in SKIP_PATH_PREFIXES:
        if path.startswith(prefix):
            return
    status_code = getattr(response, "status_code", 0) or 0
    # Log successful mutations and failed login attempts.
    is_login = path.rstrip("/").endswith("/api/auth/login") or path.endswith("/api/auth/login/")
    if status_code >= 400 and not is_login:
        return
    if status_code >= 500:
        return

    entity_type, entity_id = _parse_entity(path)
    action = _action_from_method(method)
    if is_login:
        action = "login" if status_code < 400 else "login-failed"
    elif path.rstrip("/").endswith("logout"):
        action = "logout"

    body: Any = None
    try:
        body = getattr(request, "data", None)
    except Exception:
        body = None

    team = None
    if isinstance(body, dict):
        team = str(body.get("team") or body.get("department") or "") or None
        if not entity_id:
            entity_id = str(
                body.get("id") or body.get("auditId") or body.get("agentId") or ""
            ) or entity_id

    summary = _summary_for(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        method=method,
        path=path,
        body=body,
    )
    if action == "login-failed":
        summary = "Failed sign-in attempt"

    actor = _actor_from_request(request)
    if is_login and status_code < 400:
        payload = getattr(response, "data", None)
        if isinstance(payload, dict):
            user_data = payload.get("user")
            if isinstance(user_data, dict):
                actor = {
                    "userId": str(user_data.get("id") or actor.get("userId") or ""),
                    "name": str(
                        user_data.get("full_name")
                        or user_data.get("username")
                        or actor.get("name")
                        or ""
                    ),
                    "email": str(user_data.get("email") or actor.get("email") or ""),
                    "role": (
                        "admin"
                        if user_data.get("is_staff") or user_data.get("is_superuser")
                        else actor.get("role") or "qa"
                    ),
                }

    insert_activity_log(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        detail={"body": _sanitize(body), "status": status_code},
        request_path=path,
        request_method=method,
        team=team,
        ip_address=_client_ip(request),
    )


class LoggedAPIView(APIView):
    """APIView that records successful (and login-failed) mutating requests."""

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        try:
            if external_db_ready():
                log_request_activity(request, response)
        except Exception:
            log.exception("Failed to write activity log for %s %s", request.method, request.path)
        return response


def external_db_ready() -> bool:
    from .db import external_db_enabled

    return external_db_enabled()
