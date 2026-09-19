"""List helpers for monitoring-adjacent portal tables."""

from __future__ import annotations

import json
from typing import Any

from .db import external_connection, schema_name
from .queries import team_slug


def _iso_date(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    return text[:10] if len(text) >= 10 else text


def _iso_dt(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _as_team(raw: Any) -> str:
    slug = team_slug(raw if isinstance(raw, str) else str(raw or ""))
    if slug in {"calls", "tickets", "live-chat", "sales"}:
        return slug
    return "calls"


def _map_feedback_type(raw: Any) -> str:
    text = str(raw or "").strip().lower().replace("_", "-").replace(" ", "-")
    if text in {"coaching", "audit-feedback", "warning", "follow-up"}:
        return text
    if "audit" in text:
        return "audit-feedback"
    if "warn" in text:
        return "warning"
    if "follow" in text:
        return "follow-up"
    return "coaching"


def _map_feedback_status(raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if text in {"closed", "done", "resolved"}:
        return "closed"
    if text in {"in-progress", "in_progress", "progress", "active"}:
        return "in-progress"
    return "open"


def _map_feedback_stage(status: str, acknowledged: bool) -> str:
    if status == "closed":
        return "closed"
    if not acknowledged:
        return "awaiting-ack"
    if status == "in-progress":
        return "in-progress"
    return "draft"


def _map_request_priority(raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if text in {"low", "medium", "high", "urgent"}:
        return text
    if text in {"critical", "u"}:
        return "urgent"
    return "medium"


def _map_request_status(raw: Any) -> str:
    text = str(raw or "").strip().lower().replace("_", "-")
    if text in {"closed", "done", "resolved"}:
        return "closed"
    if text in {"under-review", "review", "in-progress", "progress"}:
        return "under-review"
    return "open"


def _map_role(raw: Any) -> str:
    text = str(raw or "").strip().lower().replace(" ", "")
    if text in {"superadmin", "super-admin", "super_admin"}:
        return "superadmin"
    if text in {"admin", "administrator"}:
        return "admin"
    if text in {"qa", "quality"}:
        return "qa"
    if text in {"supervisor", "sup"}:
        return "supervisor"
    return "agent"


def _map_department(raw: Any) -> str:
    slug = team_slug(raw if isinstance(raw, str) else str(raw or ""))
    if slug in {"calls", "tickets", "live-chat", "sales", "quality-assurance"}:
        return slug
    if slug in {"super-admin", "superadmin"}:
        return "super-admin"
    return "calls"


def list_agent_feedback(
    *,
    team: str | None = None,
    search: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    schema = schema_name()
    clauses = ["TRUE"]
    params: list[Any] = []
    if team and team != "all":
        from .queries import SLUG_TO_DB_TEAM

        clauses.append("LOWER(COALESCE(team, '')) = LOWER(%s)")
        params.append(SLUG_TO_DB_TEAM.get(team, team))
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append(
            "("
            "COALESCE(agent_name, '') ILIKE %s OR "
            "COALESCE(subject, '') ILIKE %s OR "
            "COALESCE(qa_name, '') ILIKE %s OR "
            "COALESCE(agent_id, '') ILIKE %s"
            ")"
        )
        params.extend([like, like, like, like])

    where_sql = " AND ".join(clauses)
    limit = max(1, min(int(limit), 2000))
    offset = max(0, int(offset))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*)::int AS n FROM {schema}.agent_feedback WHERE {where_sql}",
                params,
            )
            total = (cur.fetchone() or {}).get("n") or 0
            cur.execute(
                f"""
                SELECT *
                FROM {schema}.agent_feedback
                WHERE {where_sql}
                ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            items = []
            for row in cur.fetchall():
                acknowledged = bool(row.get("acknowledged_by_agent"))
                status = _map_feedback_status(row.get("status"))
                note = row.get("feedback_note") or ""
                meta: dict[str, Any] = {}
                action_raw = row.get("action_plan") or ""
                plan_text = str(action_raw)
                if isinstance(action_raw, str) and action_raw.strip().startswith("{"):
                    try:
                        parsed = json.loads(action_raw)
                        if isinstance(parsed, dict):
                            meta = parsed
                            plan_text = str(parsed.get("plan") or "")
                    except json.JSONDecodeError:
                        meta = {}
                stage = str(meta.get("stage") or "") or _map_feedback_stage(status, acknowledged)
                items.append(
                    {
                        "id": str(row["id"]),
                        "agentId": str(row.get("agent_id") or ""),
                        "agentName": row.get("agent_name") or "",
                        "team": _as_team(row.get("team")),
                        "qaName": row.get("qa_name") or "",
                        "planType": _map_feedback_type(row.get("feedback_type")),
                        "priority": str(meta.get("priority") or "medium"),
                        "status": status,
                        "stage": stage,
                        "followUpDate": _iso_date(row.get("due_date")),
                        "subject": row.get("subject") or "",
                        "auditReference": str(meta.get("auditReference") or ""),
                        "coachingSummary": note,
                        "justification": str(meta.get("justification") or ""),
                        "actionPlan": plan_text,
                        "acknowledged": acknowledged,
                        "agentCycle": int(meta.get("agentCycle") or 0),
                        "createdAt": _iso_dt(row.get("created_at")),
                        "updatedAt": _iso_dt(row.get("updated_at") or row.get("created_at")),
                    }
                )

    return {"connected": True, "total": total, "items": items}


def list_supervisor_requests(
    *,
    team: str | None = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    schema = schema_name()
    clauses = ["TRUE"]
    params: list[Any] = []
    if team and team != "all":
        from .queries import SLUG_TO_DB_TEAM

        clauses.append("LOWER(COALESCE(team, '')) = LOWER(%s)")
        params.append(SLUG_TO_DB_TEAM.get(team, team))
    if status and status != "all":
        clauses.append("LOWER(COALESCE(status, '')) LIKE LOWER(%s)")
        params.append(f"%{status.replace('-', '%')}%")
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append(
            "("
            "COALESCE(case_reference, '') ILIKE %s OR "
            "COALESCE(agent_name, '') ILIKE %s OR "
            "COALESCE(supervisor_name, '') ILIKE %s OR "
            "COALESCE(request_note, '') ILIKE %s"
            ")"
        )
        params.extend([like, like, like, like])

    where_sql = " AND ".join(clauses)
    limit = max(1, min(int(limit), 2000))
    offset = max(0, int(offset))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*)::int AS n FROM {schema}.supervisor_requests WHERE {where_sql}",
                params,
            )
            total = (cur.fetchone() or {}).get("n") or 0
            cur.execute(
                f"""
                SELECT *
                FROM {schema}.supervisor_requests
                WHERE {where_sql}
                ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = list(cur.fetchall())
            request_ids = [str(r["id"]) for r in rows]
            replies_by: dict[str, list[dict[str, Any]]] = {rid: [] for rid in request_ids}
            if request_ids:
                try:
                    cur.execute(
                        f"""
                        SELECT *
                        FROM {schema}.supervisor_request_replies
                        WHERE request_id::text = ANY(%s)
                        ORDER BY created_at ASC NULLS LAST
                        """,
                        (request_ids,),
                    )
                    for reply in cur.fetchall():
                        rid = str(reply.get("request_id") or "")
                        if rid not in replies_by:
                            continue
                        replies_by[rid].append(
                            {
                                "id": str(reply.get("id") or ""),
                                "author": reply.get("author_name")
                                or reply.get("author")
                                or reply.get("created_by_name")
                                or "QA",
                                "body": reply.get("reply_text")
                                or reply.get("body")
                                or reply.get("reply")
                                or reply.get("note")
                                or "",
                                "createdAt": _iso_dt(reply.get("created_at")),
                            }
                        )
                except Exception:
                    conn.rollback()

            items = []
            for row in rows:
                rid = str(row["id"])
                items.append(
                    {
                        "id": rid,
                        "caseReference": row.get("case_reference") or "",
                        "caseType": row.get("case_type") or "",
                        "agentId": str(row.get("agent_id") or ""),
                        "agentName": row.get("agent_name") or row.get("display_name") or "",
                        "requesterName": row.get("supervisor_name") or "",
                        "priority": _map_request_priority(row.get("priority")),
                        "team": _as_team(row.get("team")),
                        "note": row.get("request_note") or "",
                        "status": _map_request_status(row.get("status")),
                        "replies": replies_by.get(rid, []),
                        "createdAt": _iso_dt(row.get("created_at")),
                        "updatedAt": _iso_dt(row.get("updated_at") or row.get("created_at")),
                    }
                )

    return {"connected": True, "total": total, "items": items}


def list_coachings(
    *,
    search: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    schema = schema_name()
    clauses = ["TRUE"]
    params: list[Any] = []
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append(
            "("
            "COALESCE(agent_name, '') ILIKE %s OR "
            "COALESCE(qa_name, '') ILIKE %s OR "
            "COALESCE(topic, '') ILIKE %s OR "
            "COALESCE(agent_id, '') ILIKE %s"
            ")"
        )
        params.extend([like, like, like, like])

    where_sql = " AND ".join(clauses)
    limit = max(1, min(int(limit), 2000))
    offset = max(0, int(offset))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*)::int AS n FROM {schema}.coachings WHERE {where_sql}",
                params,
            )
            total = (cur.fetchone() or {}).get("n") or 0
            cur.execute(
                f"""
                SELECT *
                FROM {schema}.coachings
                WHERE {where_sql}
                ORDER BY COALESCE(session_date::text, created_at::text) DESC NULLS LAST
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            items = [
                {
                    "id": str(row["id"]),
                    "agentId": str(row.get("agent_id") or ""),
                    "agentName": row.get("agent_name") or "",
                    "qualityName": row.get("qa_name") or "",
                    "sessionDate": _iso_date(row.get("session_date")),
                    "topic": row.get("topic") or "",
                    "createdAt": _iso_dt(row.get("created_at")),
                    "updatedAt": _iso_dt(row.get("created_at")),
                }
                for row in cur.fetchall()
            ]

    return {"connected": True, "total": total, "items": items}


def list_audit_edit_history(
    *,
    team: str | None = None,
    search: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    schema = schema_name()
    clauses = ["TRUE"]
    params: list[Any] = []
    if team and team != "all":
        from .queries import SLUG_TO_DB_TEAM

        clauses.append("LOWER(COALESCE(team, '')) = LOWER(%s)")
        params.append(SLUG_TO_DB_TEAM.get(team, team))
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append(
            "("
            "COALESCE(agent_name, '') ILIKE %s OR "
            "COALESCE(edited_by_name, '') ILIKE %s OR "
            "COALESCE(created_by_name, '') ILIKE %s OR "
            "COALESCE(audit_id::text, '') ILIKE %s"
            ")"
        )
        params.extend([like, like, like, like])

    where_sql = " AND ".join(clauses)
    limit = max(1, min(int(limit), 2000))
    offset = max(0, int(offset))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*)::int AS n FROM {schema}.audit_edit_history WHERE {where_sql}",
                params,
            )
            total = (cur.fetchone() or {}).get("n") or 0
            cur.execute(
                f"""
                SELECT *
                FROM {schema}.audit_edit_history
                WHERE {where_sql}
                ORDER BY edited_at DESC NULLS LAST
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            items = []
            for row in cur.fetchall():
                changes_raw = row.get("changes")
                changes: list[dict[str, str]] = []
                if isinstance(changes_raw, list):
                    for item in changes_raw:
                        if isinstance(item, dict):
                            changes.append(
                                {
                                    "field": str(item.get("field") or item.get("name") or "Field"),
                                    "from": str(item.get("from") or item.get("before") or "—"),
                                    "to": str(item.get("to") or item.get("after") or "—"),
                                }
                            )
                elif isinstance(changes_raw, str) and changes_raw.strip():
                    try:
                        parsed = json.loads(changes_raw)
                        if isinstance(parsed, list):
                            for item in parsed:
                                if isinstance(item, dict):
                                    changes.append(
                                        {
                                            "field": str(item.get("field") or "Field"),
                                            "from": str(item.get("from") or "—"),
                                            "to": str(item.get("to") or "—"),
                                        }
                                    )
                    except json.JSONDecodeError:
                        changes = [{"field": "Changes", "from": "—", "to": changes_raw[:200]}]

                summary = ", ".join(c["field"] for c in changes[:6]) if changes else "Edited"
                items.append(
                    {
                        "id": str(row["id"]),
                        "auditId": str(row.get("audit_id") or ""),
                        "action": "edit",
                        "editedAt": _iso_dt(row.get("edited_at")),
                        "auditDate": _iso_date(row.get("audit_date")),
                        "team": _as_team(row.get("team")),
                        "agentName": row.get("agent_name") or "",
                        "createdBy": row.get("created_by_name") or "",
                        "editedBy": row.get("edited_by_name") or "",
                        "score": "",
                        "changesSummary": summary,
                        "changes": changes,
                    }
                )

    return {"connected": True, "total": total, "items": items}


def list_managed_users(
    *,
    search: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    schema = schema_name()
    clauses = ["COALESCE(p.is_active, TRUE) = TRUE"]
    params: list[Any] = []
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append(
            "("
            "COALESCE(p.agent_name, '') ILIKE %s OR "
            "COALESCE(p.display_name, '') ILIKE %s OR "
            "COALESCE(p.email, '') ILIKE %s OR "
            "COALESCE(p.agent_id, '') ILIKE %s OR "
            "COALESCE(u.email, '') ILIKE %s"
            ")"
        )
        params.extend([like, like, like, like, like])

    where_sql = " AND ".join(clauses)
    limit = max(1, min(int(limit), 2000))
    offset = max(0, int(offset))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*)::int AS n
                FROM {schema}.profiles p
                LEFT JOIN {schema}.qa_auth_users u ON u.profile_id = p.id
                WHERE {where_sql}
                """,
                params,
            )
            total = (cur.fetchone() or {}).get("n") or 0
            cur.execute(
                f"""
                SELECT
                  p.id,
                  p.agent_name,
                  p.display_name,
                  p.agent_id,
                  p.team,
                  p.department,
                  p.role,
                  p.email AS profile_email,
                  p.created_at,
                  p.is_active,
                  u.email AS auth_email,
                  u.updated_at AS auth_updated_at,
                  u.is_active AS auth_active
                FROM {schema}.profiles p
                LEFT JOIN {schema}.qa_auth_users u ON u.profile_id = p.id
                WHERE {where_sql}
                ORDER BY COALESCE(p.display_name, p.agent_name, p.agent_id) ASC
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            items = []
            for row in cur.fetchall():
                name = row.get("display_name") or row.get("agent_name") or row.get("agent_id") or ""
                items.append(
                    {
                        "id": str(row["id"]),
                        "agentName": row.get("agent_name") or name,
                        "alias": row.get("display_name") or row.get("agent_name") or "",
                        "email": row.get("auth_email") or row.get("profile_email") or "",
                        "employeeId": str(row.get("agent_id") or ""),
                        "vonageId": "",
                        "department": _map_department(row.get("team") or row.get("department")),
                        "role": _map_role(row.get("role")),
                        "createdBy": "",
                        "createdAt": _iso_dt(row.get("created_at")),
                        "updatedAt": _iso_dt(row.get("auth_updated_at") or row.get("created_at")),
                        "active": bool(
                            row.get("auth_active")
                            if row.get("auth_active") is not None
                            else (row.get("is_active") if row.get("is_active") is not None else True)
                        ),
                    }
                )

    return {"connected": True, "total": total, "items": items}


def find_managed_user_by_email(email: str) -> dict[str, Any] | None:
    """Exact match on profile or qa_auth email (active profiles only)."""
    needle = (email or "").strip().lower()
    if not needle or "@" not in needle:
        return None

    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  p.id,
                  p.agent_name,
                  p.display_name,
                  p.agent_id,
                  p.email AS profile_email,
                  p.is_active,
                  u.email AS auth_email,
                  u.is_active AS auth_active
                FROM {schema}.profiles p
                LEFT JOIN {schema}.qa_auth_users u ON u.profile_id = p.id
                WHERE COALESCE(p.is_active, TRUE) = TRUE
                  AND (
                    LOWER(TRIM(COALESCE(u.email, ''))) = %s
                    OR LOWER(TRIM(COALESCE(p.email, ''))) = %s
                  )
                ORDER BY
                  CASE WHEN LOWER(TRIM(COALESCE(u.email, ''))) = %s THEN 0 ELSE 1 END,
                  p.id ASC
                LIMIT 1
                """,
                [needle, needle, needle],
            )
            row = cur.fetchone()
            if not row:
                return None

            name = row.get("display_name") or row.get("agent_name") or row.get("agent_id") or ""
            auth_active = row.get("auth_active")
            profile_active = row.get("is_active")
            active = bool(
                auth_active
                if auth_active is not None
                else (profile_active if profile_active is not None else True)
            )
            if not active:
                return None

            resolved_email = (
                (row.get("auth_email") or row.get("profile_email") or needle) or ""
            ).strip().lower()
            return {
                "id": str(row["id"]),
                "agentName": row.get("agent_name") or name,
                "alias": row.get("display_name") or row.get("agent_name") or "",
                "email": resolved_email or needle,
                "employeeId": str(row.get("agent_id") or ""),
                "active": True,
            }
