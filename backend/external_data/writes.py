"""Insert / update / delete helpers for external QA tables."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from typing import Any

from .db import external_connection, schema_name
from .queries import SLUG_TO_DB_TEAM, team_slug
from .records import get_audit, _db_team_label


OTHER_INFO_METRIC = "__other_information__"
REEVALUATED_METRIC = "__reevaluated__"


def _now() -> datetime:
    return datetime.utcnow()


def _parse_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value).strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _parse_score(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace("%", "").strip())
    except (TypeError, ValueError):
        return None


def _build_score_details(
    metrics: list[dict[str, Any]] | None,
    *,
    issue_resolved: str = "",
    issue_resolved_note: str = "",
    other_information: str = "",
    reevaluated: bool = False,
) -> list[dict[str, Any]]:
    details: list[dict[str, Any]] = []
    for item in metrics or []:
        if not isinstance(item, dict):
            continue
        metric = str(item.get("metric") or "").strip()
        if not metric or metric in {OTHER_INFO_METRIC, REEVALUATED_METRIC}:
            continue
        if metric.lower() == "issue was resolved":
            continue
        earned_raw = item.get("earned")
        try:
            earned = float(earned_raw) if earned_raw not in (None, "") else 0
        except (TypeError, ValueError):
            earned = 0
        details.append(
            {
                "id": str(item.get("id") or ""),
                "metric": metric,
                "result": str(item.get("result") or "n/a"),
                "earned": earned,
                "metric_comment": str(item.get("qaNote") or item.get("metric_comment") or ""),
                "counts_toward_score": True,
            }
        )

    if issue_resolved in {"yes", "no"}:
        details.append(
            {
                "metric": "Issue was resolved",
                "result": issue_resolved,
                "earned": 0,
                "metric_comment": issue_resolved_note or "",
                "counts_toward_score": False,
            }
        )

    if other_information.strip():
        details.append(
            {
                "metric": OTHER_INFO_METRIC,
                "result": "n/a",
                "earned": 0,
                "metric_comment": other_information.strip(),
                "counts_toward_score": False,
            }
        )

    if reevaluated:
        details.append(
            {
                "metric": REEVALUATED_METRIC,
                "result": "yes",
                "earned": 0,
                "metric_comment": "",
                "counts_toward_score": False,
            }
        )

    return details


def upsert_audit(
    payload: dict[str, Any],
    *,
    actor: dict[str, Any] | None = None,
) -> dict[str, Any]:
    schema = schema_name()
    actor = actor or {}
    audit_id = str(payload.get("id") or "").strip() or f"audit-{uuid.uuid4().hex[:12]}"
    team_label = _db_team_label(str(payload.get("team") or "calls"))
    audit_date = _parse_date(payload.get("date") or payload.get("auditDate")) or date.today()
    quality = _parse_score(payload.get("qualityScore") or payload.get("score"))
    shared = bool(payload.get("shared"))

    if "reevaluated" in payload:
        reevaluated = bool(payload.get("reevaluated"))
    else:
        existing = get_audit(audit_id)
        reevaluated = bool((existing or {}).get("reevaluated"))

    score_details = _build_score_details(
        payload.get("metrics") if isinstance(payload.get("metrics"), list) else [],
        issue_resolved=str(payload.get("issueResolved") or ""),
        issue_resolved_note=str(payload.get("issueResolvedNote") or ""),
        other_information=str(payload.get("otherInformation") or ""),
        reevaluated=reevaluated,
    )

    created_by_name = (
        str(payload.get("createdBy") or "").strip()
        or str(actor.get("name") or "").strip()
        or "QA System"
    )
    created_by_email = str(actor.get("email") or "").strip() or None
    created_by_user_id = str(actor.get("userId") or "").strip() or None
    created_by_role = str(actor.get("role") or "").strip() or None

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.audits (
                  id, agent_id, agent_name, team, case_type, audit_date, quality_score,
                  comments, score_details, created_at, order_number, phone_number, ticket_id,
                  shared_with_agent, shared_at, created_by_user_id, created_by_name,
                  created_by_email, created_by_role, shared_with_supervisor, shared_with_supervisor_at
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s, %s,
                  %s, %s::jsonb, COALESCE(
                    (SELECT created_at FROM {schema}.audits WHERE id = %s),
                    NOW()
                  ), %s, %s, %s,
                  %s, CASE WHEN %s THEN COALESCE(
                    (SELECT shared_at FROM {schema}.audits WHERE id = %s),
                    NOW()
                  ) ELSE NULL END,
                  COALESCE(
                    (SELECT created_by_user_id FROM {schema}.audits WHERE id = %s),
                    %s
                  ),
                  COALESCE(
                    NULLIF((SELECT created_by_name FROM {schema}.audits WHERE id = %s), ''),
                    %s
                  ),
                  COALESCE(
                    (SELECT created_by_email FROM {schema}.audits WHERE id = %s),
                    %s
                  ),
                  COALESCE(
                    (SELECT created_by_role FROM {schema}.audits WHERE id = %s),
                    %s
                  ),
                  FALSE, NULL
                )
                ON CONFLICT (id) DO UPDATE SET
                  agent_id = EXCLUDED.agent_id,
                  agent_name = EXCLUDED.agent_name,
                  team = EXCLUDED.team,
                  case_type = EXCLUDED.case_type,
                  audit_date = EXCLUDED.audit_date,
                  quality_score = EXCLUDED.quality_score,
                  comments = EXCLUDED.comments,
                  score_details = EXCLUDED.score_details,
                  order_number = EXCLUDED.order_number,
                  phone_number = EXCLUDED.phone_number,
                  ticket_id = EXCLUDED.ticket_id,
                  shared_with_agent = EXCLUDED.shared_with_agent,
                  shared_at = EXCLUDED.shared_at
                """,
                (
                    audit_id,
                    str(payload.get("agentId") or "").strip() or None,
                    str(payload.get("agentName") or "").strip() or None,
                    team_label,
                    str(payload.get("caseType") or "").strip() or None,
                    audit_date,
                    quality,
                    str(payload.get("comments") or "").strip() or None,
                    json.dumps(score_details),
                    audit_id,
                    str(payload.get("orderNumber") or "").strip() or None,
                    str(payload.get("phoneNumber") or "").strip() or None,
                    str(payload.get("ticketNumber") or "").strip() or None,
                    shared,
                    shared,
                    audit_id,
                    audit_id,
                    created_by_user_id,
                    audit_id,
                    created_by_name,
                    audit_id,
                    created_by_email,
                    audit_id,
                    created_by_role,
                ),
            )
        conn.commit()

    saved = get_audit(audit_id)
    if not saved:
        raise RuntimeError("Audit saved but could not be reloaded.")
    return saved


def delete_audit(audit_id: str) -> dict[str, Any] | None:
    existing = get_audit(audit_id)
    if not existing:
        return None
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DELETE FROM {schema}.audits WHERE id = %s", (audit_id,))
        conn.commit()
    return existing


def insert_audit_edit_history(
    *,
    audit: dict[str, Any],
    action: str,
    changes: list[dict[str, str]],
    edited_by: dict[str, Any] | None = None,
    before_snapshot: dict[str, Any] | None = None,
    after_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    schema = schema_name()
    edited_by = edited_by or {}
    history_id = str(uuid.uuid4())
    team_label = _db_team_label(str(audit.get("team") or "calls"))
    changes_payload = list(changes or [])
    if action == "delete" and not changes_payload:
        changes_payload = [{"field": "Audit", "from": "Present", "to": "Deleted"}]

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.audit_edit_history (
                  id, audit_id, agent_id, agent_name, team, audit_date,
                  created_by_user_id, created_by_name, created_by_email,
                  edited_by_user_id, edited_by_name, edited_by_email,
                  before_snapshot, after_snapshot, changes, edited_at
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s,
                  %s, %s, %s,
                  %s, %s, %s,
                  %s::jsonb, %s::jsonb, %s::jsonb, NOW()
                )
                """,
                (
                    history_id,
                    str(audit.get("id") or ""),
                    str(audit.get("agentId") or "") or None,
                    str(audit.get("agentName") or "") or None,
                    team_label,
                    _parse_date(audit.get("date")),
                    None,
                    str(audit.get("createdBy") or "") or None,
                    None,
                    str(edited_by.get("userId") or "") or None,
                    str(edited_by.get("name") or "QA System"),
                    str(edited_by.get("email") or "") or None,
                    json.dumps(before_snapshot) if before_snapshot is not None else None,
                    json.dumps(after_snapshot if after_snapshot is not None else audit),
                    json.dumps(changes_payload),
                ),
            )
        conn.commit()

    return {
        "id": history_id,
        "auditId": str(audit.get("id") or ""),
        "action": action,
        "changes": changes_payload,
    }


def upsert_monitoring(
    payload: dict[str, Any],
    *,
    actor: dict[str, Any] | None = None,
) -> dict[str, Any]:
    schema = schema_name()
    actor = actor or {}
    item_id = str(payload.get("id") or "").strip() or str(uuid.uuid4())
    status = "resolved" if str(payload.get("status") or "").lower() == "resolved" else "active"
    ack = bool(payload.get("ack"))
    team_label = _db_team_label(str(payload.get("team") or "calls"))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.monitoring_items (
                  id, order_number, comment, agent_id, agent_name, display_name, team,
                  created_by_name, created_by_email, created_by_user_id, created_at, status,
                  acknowledged_by_agent, acknowledged_at, resolved_at,
                  resolved_by_name, resolved_by_email
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, COALESCE(
                    (SELECT created_at FROM {schema}.monitoring_items WHERE id = %s),
                    NOW()
                  ), %s,
                  %s,
                  CASE WHEN %s THEN COALESCE(
                    (SELECT acknowledged_at FROM {schema}.monitoring_items WHERE id = %s),
                    NOW()
                  ) ELSE NULL END,
                  CASE WHEN %s THEN COALESCE(
                    (SELECT resolved_at FROM {schema}.monitoring_items WHERE id = %s),
                    NOW()
                  ) ELSE NULL END,
                  CASE WHEN %s THEN %s ELSE NULL END,
                  CASE WHEN %s THEN %s ELSE NULL END
                )
                ON CONFLICT (id) DO UPDATE SET
                  order_number = EXCLUDED.order_number,
                  comment = EXCLUDED.comment,
                  agent_id = EXCLUDED.agent_id,
                  agent_name = EXCLUDED.agent_name,
                  display_name = EXCLUDED.display_name,
                  team = EXCLUDED.team,
                  status = EXCLUDED.status,
                  acknowledged_by_agent = EXCLUDED.acknowledged_by_agent,
                  acknowledged_at = EXCLUDED.acknowledged_at,
                  resolved_at = EXCLUDED.resolved_at,
                  resolved_by_name = EXCLUDED.resolved_by_name,
                  resolved_by_email = EXCLUDED.resolved_by_email
                RETURNING *
                """,
                (
                    item_id,
                    str(payload.get("order") or "").strip() or None,
                    str(payload.get("comment") or "").strip() or None,
                    str(payload.get("agentId") or "").strip() or None,
                    str(payload.get("agentName") or "").strip() or None,
                    str(payload.get("agentName") or "").strip() or None,
                    team_label,
                    str(actor.get("name") or "QA System"),
                    str(actor.get("email") or "") or None,
                    str(actor.get("userId") or "") or None,
                    item_id,
                    status,
                    ack,
                    ack,
                    item_id,
                    status == "resolved",
                    item_id,
                    status == "resolved",
                    str(actor.get("name") or "QA System"),
                    status == "resolved",
                    str(actor.get("email") or "") or None,
                ),
            )
            row = dict(cur.fetchone() or {})
        conn.commit()

    return {
        "id": str(row.get("id") or item_id),
        "order": row.get("order_number") or "",
        "agentId": str(row.get("agent_id") or ""),
        "agentName": row.get("agent_name") or row.get("display_name") or "",
        "team": team_slug(row.get("team")) or "calls",
        "comment": row.get("comment") or "",
        "status": "resolved" if str(row.get("status") or "").lower() == "resolved" else "active",
        "ack": bool(row.get("acknowledged_by_agent")),
        "createdAt": row.get("created_at").isoformat() if row.get("created_at") else "",
        "resolvedAt": row.get("resolved_at").isoformat() if row.get("resolved_at") else None,
    }


def delete_monitoring(item_id: str) -> bool:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DELETE FROM {schema}.monitoring_items WHERE id = %s", (item_id,))
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def _pack_feedback_action_plan(payload: dict[str, Any]) -> str:
    plan_text = str(payload.get("actionPlan") or "").strip()
    meta = {
        "priority": str(payload.get("priority") or "medium"),
        "stage": str(payload.get("stage") or "draft"),
        "auditReference": str(payload.get("auditReference") or ""),
        "justification": str(payload.get("justification") or ""),
        "agentCycle": int(payload.get("agentCycle") or 0),
        "plan": plan_text,
    }
    return json.dumps(meta)


def _feedback_type_label(plan_type: str) -> str:
    mapping = {
        "coaching": "Coaching",
        "audit-feedback": "Audit Feedback",
        "warning": "Warning",
        "follow-up": "Follow-up",
    }
    return mapping.get(plan_type, plan_type.replace("-", " ").title() or "Coaching")


def _feedback_status_label(status: str) -> str:
    mapping = {
        "open": "Open",
        "in-progress": "In Progress",
        "closed": "Closed",
    }
    return mapping.get(status, status.replace("-", " ").title() or "Open")


def upsert_agent_feedback(payload: dict[str, Any]) -> dict[str, Any]:
    schema = schema_name()
    item_id = str(payload.get("id") or "").strip() or str(uuid.uuid4())
    team_label = _db_team_label(str(payload.get("team") or "calls"))
    due = _parse_date(payload.get("followUpDate"))
    action_plan = _pack_feedback_action_plan(payload)

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.agent_feedback (
                  id, agent_id, agent_name, team, qa_name, feedback_type, subject,
                  feedback_note, action_plan, due_date, status, acknowledged_by_agent,
                  created_at, updated_at
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s,
                  COALESCE((SELECT created_at FROM {schema}.agent_feedback WHERE id = %s), NOW()),
                  NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                  agent_id = EXCLUDED.agent_id,
                  agent_name = EXCLUDED.agent_name,
                  team = EXCLUDED.team,
                  qa_name = EXCLUDED.qa_name,
                  feedback_type = EXCLUDED.feedback_type,
                  subject = EXCLUDED.subject,
                  feedback_note = EXCLUDED.feedback_note,
                  action_plan = EXCLUDED.action_plan,
                  due_date = EXCLUDED.due_date,
                  status = EXCLUDED.status,
                  acknowledged_by_agent = EXCLUDED.acknowledged_by_agent,
                  updated_at = NOW()
                RETURNING *
                """,
                (
                    item_id,
                    str(payload.get("agentId") or "").strip() or None,
                    str(payload.get("agentName") or "").strip() or None,
                    team_label,
                    str(payload.get("qaName") or "").strip() or None,
                    _feedback_type_label(str(payload.get("planType") or "coaching")),
                    str(payload.get("subject") or "").strip() or None,
                    str(payload.get("coachingSummary") or "").strip() or None,
                    action_plan,
                    due,
                    _feedback_status_label(str(payload.get("status") or "open")),
                    bool(payload.get("acknowledged")),
                    item_id,
                ),
            )
            row = dict(cur.fetchone() or {})
        conn.commit()

    meta: dict[str, Any] = {}
    try:
        meta = json.loads(str(row.get("action_plan") or "{}"))
        if not isinstance(meta, dict):
            meta = {}
    except json.JSONDecodeError:
        meta = {}

    return {
        "id": str(row.get("id") or item_id),
        "agentId": str(row.get("agent_id") or ""),
        "agentName": row.get("agent_name") or "",
        "team": team_slug(row.get("team")) or "calls",
        "qaName": row.get("qa_name") or "",
        "planType": str(payload.get("planType") or "coaching"),
        "priority": str(meta.get("priority") or payload.get("priority") or "medium"),
        "status": str(payload.get("status") or "open"),
        "stage": str(meta.get("stage") or payload.get("stage") or "draft"),
        "followUpDate": due.isoformat() if due else "",
        "subject": row.get("subject") or "",
        "auditReference": str(meta.get("auditReference") or ""),
        "coachingSummary": row.get("feedback_note") or "",
        "justification": str(meta.get("justification") or ""),
        "actionPlan": str(meta.get("plan") or payload.get("actionPlan") or ""),
        "acknowledged": bool(row.get("acknowledged_by_agent")),
        "agentCycle": int(meta.get("agentCycle") or 0),
        "createdAt": row.get("created_at").isoformat() if row.get("created_at") else "",
        "updatedAt": row.get("updated_at").isoformat() if row.get("updated_at") else "",
    }


def delete_agent_feedback(item_id: str) -> bool:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DELETE FROM {schema}.agent_feedback WHERE id = %s", (item_id,))
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def upsert_coaching(payload: dict[str, Any], *, actor: dict[str, Any] | None = None) -> dict[str, Any]:
    schema = schema_name()
    actor = actor or {}
    item_id = str(payload.get("id") or "").strip() or str(uuid.uuid4())
    session_date = _parse_date(payload.get("sessionDate")) or date.today()
    team_label = _db_team_label(str(payload.get("team") or "calls"))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.coachings (
                  id, agent_id, agent_name, team, topic, qa_user_id, qa_name, qa_email,
                  session_date, audit_id, created_at
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s, %s, %s,
                  %s, %s,
                  COALESCE((SELECT created_at FROM {schema}.coachings WHERE id = %s), NOW())
                )
                ON CONFLICT (id) DO UPDATE SET
                  agent_id = EXCLUDED.agent_id,
                  agent_name = EXCLUDED.agent_name,
                  team = EXCLUDED.team,
                  topic = EXCLUDED.topic,
                  qa_name = EXCLUDED.qa_name,
                  qa_email = EXCLUDED.qa_email,
                  session_date = EXCLUDED.session_date,
                  audit_id = EXCLUDED.audit_id
                RETURNING *
                """,
                (
                    item_id,
                    str(payload.get("agentId") or "").strip() or None,
                    str(payload.get("agentName") or "").strip() or None,
                    team_label,
                    str(payload.get("topic") or "").strip() or None,
                    str(actor.get("userId") or "") or None,
                    str(payload.get("qualityName") or actor.get("name") or "").strip() or None,
                    str(actor.get("email") or "") or None,
                    session_date,
                    str(payload.get("auditId") or "") or None,
                    item_id,
                ),
            )
            row = dict(cur.fetchone() or {})
        conn.commit()

    created = row.get("created_at")
    return {
        "id": str(row.get("id") or item_id),
        "agentId": str(row.get("agent_id") or ""),
        "agentName": row.get("agent_name") or "",
        "qualityName": row.get("qa_name") or "",
        "sessionDate": session_date.isoformat(),
        "topic": row.get("topic") or "",
        "createdAt": created.isoformat() if created else "",
        "updatedAt": created.isoformat() if created else "",
    }


def delete_coaching(item_id: str) -> bool:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DELETE FROM {schema}.coachings WHERE id = %s", (item_id,))
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def _request_status_label(status: str) -> str:
    mapping = {
        "open": "Open",
        "under-review": "Under Review",
        "closed": "Closed",
    }
    return mapping.get(status, status.replace("-", " ").title() or "Open")


def _request_priority_label(priority: str) -> str:
    mapping = {
        "low": "Low",
        "medium": "Medium",
        "high": "High",
        "urgent": "Urgent",
    }
    return mapping.get(priority, priority.title() or "Medium")


def upsert_supervisor_request(payload: dict[str, Any]) -> dict[str, Any]:
    schema = schema_name()
    item_id = str(payload.get("id") or "").strip() or str(uuid.uuid4())
    team_label = _db_team_label(str(payload.get("team") or "calls"))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.supervisor_requests (
                  id, case_reference, agent_id, agent_name, display_name, team, case_type,
                  supervisor_name, priority, request_note, status, created_at, updated_at
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s,
                  COALESCE((SELECT created_at FROM {schema}.supervisor_requests WHERE id = %s), NOW()),
                  NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                  case_reference = EXCLUDED.case_reference,
                  agent_id = EXCLUDED.agent_id,
                  agent_name = EXCLUDED.agent_name,
                  display_name = EXCLUDED.display_name,
                  team = EXCLUDED.team,
                  case_type = EXCLUDED.case_type,
                  supervisor_name = EXCLUDED.supervisor_name,
                  priority = EXCLUDED.priority,
                  request_note = EXCLUDED.request_note,
                  status = EXCLUDED.status,
                  updated_at = NOW()
                RETURNING *
                """,
                (
                    item_id,
                    str(payload.get("caseReference") or "").strip() or None,
                    str(payload.get("agentId") or "").strip() or None,
                    str(payload.get("agentName") or "").strip() or None,
                    str(payload.get("agentName") or "").strip() or None,
                    team_label,
                    str(payload.get("caseType") or "").strip() or None,
                    str(payload.get("requesterName") or "").strip() or None,
                    _request_priority_label(str(payload.get("priority") or "medium")),
                    str(payload.get("note") or "").strip() or None,
                    _request_status_label(str(payload.get("status") or "open")),
                    item_id,
                ),
            )
            row = dict(cur.fetchone() or {})
        conn.commit()

    return {
        "id": str(row.get("id") or item_id),
        "caseReference": row.get("case_reference") or "",
        "caseType": row.get("case_type") or "",
        "agentId": str(row.get("agent_id") or ""),
        "agentName": row.get("agent_name") or row.get("display_name") or "",
        "requesterName": row.get("supervisor_name") or "",
        "priority": str(payload.get("priority") or "medium"),
        "team": team_slug(row.get("team")) or "calls",
        "note": row.get("request_note") or "",
        "status": str(payload.get("status") or "open"),
        "replies": payload.get("replies") if isinstance(payload.get("replies"), list) else [],
        "createdAt": row.get("created_at").isoformat() if row.get("created_at") else "",
        "updatedAt": row.get("updated_at").isoformat() if row.get("updated_at") else "",
    }


def delete_supervisor_request(item_id: str) -> bool:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {schema}.supervisor_request_replies WHERE request_id = %s",
                (item_id,),
            )
            cur.execute(f"DELETE FROM {schema}.supervisor_requests WHERE id = %s", (item_id,))
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def add_supervisor_reply(
    request_id: str,
    *,
    body: str,
    actor: dict[str, Any] | None = None,
) -> dict[str, Any]:
    schema = schema_name()
    actor = actor or {}
    reply_id = str(uuid.uuid4())
    text = body.strip()
    if not text:
        raise ValueError("Reply body is required.")

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.supervisor_request_replies (
                  id, request_id, reply_text, author_id, author_name, author_role, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                RETURNING *
                """,
                (
                    reply_id,
                    request_id,
                    text,
                    str(actor.get("userId") or "") or None,
                    str(actor.get("name") or "QA"),
                    str(actor.get("role") or "qa"),
                ),
            )
            row = dict(cur.fetchone() or {})
            cur.execute(
                f"UPDATE {schema}.supervisor_requests SET updated_at = NOW() WHERE id = %s",
                (request_id,),
            )
        conn.commit()

    return {
        "id": str(row.get("id") or reply_id),
        "author": row.get("author_name") or "QA",
        "body": row.get("reply_text") or text,
        "createdAt": row.get("created_at").isoformat() if row.get("created_at") else "",
    }


def import_production_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    schema = schema_name()
    inserted = {"calls": 0, "tickets": 0, "sales": 0}

    with external_connection() as conn:
        with conn.cursor() as cur:
            for row in rows:
                agent_id = str(row.get("employeeId") or row.get("vonageId") or "").strip()
                agent_name = str(row.get("employeeName") or "").strip()
                start = _parse_date(row.get("periodStart")) or date.today()
                end = _parse_date(row.get("periodEnd")) or start
                if not agent_id and not agent_name:
                    continue

                calls = row.get("callsHandled")
                tickets = row.get("tickets")
                sales = row.get("sales")

                if calls is not None and str(calls) != "":
                    cur.execute(
                        f"""
                        INSERT INTO {schema}.calls_records (
                          id, agent_id, agent_name, calls_count, call_date, date_to, notes, created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (
                            str(uuid.uuid4()),
                            agent_id or None,
                            agent_name or None,
                            int(float(calls)),
                            start,
                            end,
                            "Imported from QA app",
                        ),
                    )
                    inserted["calls"] += 1

                if tickets is not None and str(tickets) != "":
                    cur.execute(
                        f"""
                        INSERT INTO {schema}.tickets_records (
                          id, agent_id, agent_name, tickets_count, ticket_date, date_to, notes, created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (
                            str(uuid.uuid4()),
                            agent_id or None,
                            agent_name or None,
                            int(float(tickets)),
                            start,
                            end,
                            "Imported from QA app",
                        ),
                    )
                    inserted["tickets"] += 1

                if sales is not None and str(sales) != "":
                    cur.execute(
                        f"""
                        INSERT INTO {schema}.sales_records (
                          id, agent_id, agent_name, amount, sale_date, date_to, notes, created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (
                            str(uuid.uuid4()),
                            agent_id or None,
                            agent_name or None,
                            float(sales),
                            start,
                            end,
                            "Imported from QA app",
                        ),
                    )
                    inserted["sales"] += 1
        conn.commit()

    return {"connected": True, "inserted": inserted}


def ensure_permissions_table(cur: Any, schema: str) -> None:
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {schema}.qa_role_permissions (
          role text PRIMARY KEY,
          permissions jsonb NOT NULL DEFAULT '{{}}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )
        """
    )


def get_role_permissions() -> dict[str, Any]:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            ensure_permissions_table(cur, schema)
            cur.execute(
                f"SELECT role, permissions FROM {schema}.qa_role_permissions"
            )
            rows = cur.fetchall()
        conn.commit()

    matrix: dict[str, Any] = {"admin": {}, "qa": {}, "supervisor": {}}
    for row in rows:
        role = str(row.get("role") or "").lower()
        perms = row.get("permissions")
        if role in matrix and isinstance(perms, dict):
            matrix[role] = perms
        elif role in matrix and isinstance(perms, str):
            try:
                parsed = json.loads(perms)
                if isinstance(parsed, dict):
                    matrix[role] = parsed
            except json.JSONDecodeError:
                pass
    return {"connected": True, "permissions": matrix}


def save_role_permissions(matrix: dict[str, Any]) -> dict[str, Any]:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            ensure_permissions_table(cur, schema)
            for role in ("admin", "qa", "supervisor"):
                perms = matrix.get(role) if isinstance(matrix, dict) else {}
                if not isinstance(perms, dict):
                    perms = {}
                cur.execute(
                    f"""
                    INSERT INTO {schema}.qa_role_permissions (role, permissions, updated_at)
                    VALUES (%s, %s::jsonb, NOW())
                    ON CONFLICT (role) DO UPDATE SET
                      permissions = EXCLUDED.permissions,
                      updated_at = NOW()
                    """,
                    (role, json.dumps(perms)),
                )
        conn.commit()
    return get_role_permissions()


def upsert_managed_user(payload: dict[str, Any]) -> dict[str, Any]:
    schema = schema_name()
    profile_id = str(payload.get("id") or "").strip() or str(uuid.uuid4())
    role = str(payload.get("role") or "agent").strip().lower()
    department = str(payload.get("department") or "calls").strip()
    team_label = (
        "Super Admin"
        if department == "super-admin" or role == "superadmin"
        else _db_team_label(department)
    )
    from .email_domains import assert_allowed_email

    # Every managed user who may log in needs a real work email (forgot-password, share-audit).
    email = assert_allowed_email(str(payload.get("email") or ""))
    agent_name = str(payload.get("agentName") or "").strip()
    display_name = str(payload.get("alias") or "").strip() or agent_name
    agent_id = str(payload.get("employeeId") or "").strip() or None

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.profiles (
                  id, role, agent_id, agent_name, team, email, created_at,
                  display_name, department, is_active
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s,
                  COALESCE((SELECT created_at FROM {schema}.profiles WHERE id = %s), NOW()),
                  %s, %s, TRUE
                )
                ON CONFLICT (id) DO UPDATE SET
                  role = EXCLUDED.role,
                  agent_id = EXCLUDED.agent_id,
                  agent_name = EXCLUDED.agent_name,
                  team = EXCLUDED.team,
                  email = EXCLUDED.email,
                  display_name = EXCLUDED.display_name,
                  department = EXCLUDED.department
                RETURNING *
                """,
                (
                    profile_id,
                    role if role != "superadmin" else "admin",
                    agent_id,
                    agent_name or None,
                    team_label,
                    email or None,
                    profile_id,
                    display_name or None,
                    team_label,
                ),
            )
            row = dict(cur.fetchone() or {})

            if email:
                cur.execute(
                    f"""
                    INSERT INTO {schema}.qa_auth_users (
                      profile_id, email, password_hash, is_active, created_at, updated_at,
                      must_change_password
                    )
                    VALUES (
                      %s, %s,
                      COALESCE(
                        (SELECT password_hash FROM {schema}.qa_auth_users WHERE profile_id = %s),
                        ''
                      ),
                      TRUE,
                      COALESCE(
                        (SELECT created_at FROM {schema}.qa_auth_users WHERE profile_id = %s),
                        NOW()
                      ),
                      NOW(),
                      FALSE
                    )
                    ON CONFLICT (profile_id) DO UPDATE SET
                      email = EXCLUDED.email,
                      updated_at = NOW()
                    """,
                    (profile_id, email, profile_id, profile_id),
                )
        conn.commit()

    return {
        "id": str(row.get("id") or profile_id),
        "agentName": row.get("agent_name") or agent_name,
        "alias": row.get("display_name") or display_name,
        "email": email,
        "employeeId": str(row.get("agent_id") or agent_id or ""),
        "vonageId": str(payload.get("vonageId") or ""),
        "department": team_slug(row.get("department") or row.get("team") or department)
        or (department if department != "super-admin" else "super-admin"),
        "role": role,
        "createdBy": str(payload.get("createdBy") or ""),
        "createdAt": row.get("created_at").isoformat() if row.get("created_at") else "",
        "updatedAt": "",
    }


def delete_managed_user(profile_id: str) -> bool:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {schema}.qa_auth_users SET is_active = FALSE, updated_at = NOW() WHERE profile_id = %s",
                (profile_id,),
            )
            cur.execute(
                f"UPDATE {schema}.profiles SET is_active = FALSE WHERE id = %s",
                (profile_id,),
            )
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted
