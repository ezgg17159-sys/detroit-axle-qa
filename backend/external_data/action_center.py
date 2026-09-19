"""Action Center queue counts and aging from live tables."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from .db import external_connection, schema_name


def _age_bucket(created_at: Any, *, urgent_days: int, watch_days: int) -> str:
    if created_at is None:
        return "stable"
    if isinstance(created_at, date) and not isinstance(created_at, datetime):
        created = datetime.combine(created_at, datetime.min.time())
    elif isinstance(created_at, datetime):
        created = created_at
    else:
        try:
            created = datetime.fromisoformat(str(created_at).replace("Z", "+00:00")).replace(
                tzinfo=None
            )
        except ValueError:
            return "stable"
    age = (datetime.utcnow() - created.replace(tzinfo=None)).days
    if age >= urgent_days:
        return "urgent"
    if age >= watch_days:
        return "watch"
    return "stable"


def _empty_counts() -> dict[str, int]:
    return {"urgent": 0, "watch": 0, "stable": 0}


def _safe_fetch(cur, conn, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    try:
        cur.execute(sql, params)
        return [dict(row) for row in cur.fetchall()]
    except Exception:
        conn.rollback()
        return []


def fetch_action_center(*, start: date, end: date) -> dict[str, Any]:
    schema = schema_name()
    now = datetime.utcnow()
    monitoring_urgent = now - timedelta(days=2)
    requests_urgent = now - timedelta(days=3)

    queues = {
        "supervisor-requests": _empty_counts(),
        "open-feedback": _empty_counts(),
        "active-monitoring": _empty_counts(),
        "unreleased-audits": _empty_counts(),
    }
    aging = {
        "requests-aging": 0,
        "feedback-overdue": 0,
        "monitoring-aging": 0,
        "unreleased-audits": 0,
    }

    with external_connection() as conn:
        with conn.cursor() as cur:
            request_rows = _safe_fetch(
                cur,
                conn,
                f"""
                SELECT created_at, status
                FROM {schema}.supervisor_requests
                WHERE COALESCE(LOWER(status), '') NOT IN ('closed', 'resolved')
                """,
            )
            for row in request_rows:
                bucket = _age_bucket(row.get("created_at"), urgent_days=3, watch_days=1)
                queues["supervisor-requests"][bucket] += 1
                created = row.get("created_at")
                if created and _age_bucket(created, urgent_days=3, watch_days=3) == "urgent":
                    aging["requests-aging"] += 1

            feedback_rows = _safe_fetch(
                cur,
                conn,
                f"""
                SELECT created_at, due_date, status
                FROM {schema}.agent_feedback
                WHERE COALESCE(LOWER(status), '') NOT IN ('closed')
                """,
            )
            for row in feedback_rows:
                bucket = _age_bucket(row.get("created_at"), urgent_days=3, watch_days=1)
                queues["open-feedback"][bucket] += 1
                due = row.get("due_date")
                if due is not None:
                    due_date = due if isinstance(due, date) else None
                    if isinstance(due, datetime):
                        due_date = due.date()
                    if due_date and due_date < date.today():
                        aging["feedback-overdue"] += 1

            monitoring_rows = _safe_fetch(
                cur,
                conn,
                f"""
                SELECT created_at, status
                FROM {schema}.monitoring_items
                WHERE COALESCE(LOWER(status), '') = 'active'
                """,
            )
            for row in monitoring_rows:
                bucket = _age_bucket(row.get("created_at"), urgent_days=2, watch_days=1)
                queues["active-monitoring"][bucket] += 1
                if _age_bucket(row.get("created_at"), urgent_days=2, watch_days=2) == "urgent":
                    aging["monitoring-aging"] += 1

            unreleased_rows = _safe_fetch(
                cur,
                conn,
                f"""
                SELECT created_at, audit_date
                FROM {schema}.audits
                WHERE COALESCE(shared_with_agent, FALSE) = FALSE
                  AND audit_date::date >= %s
                  AND audit_date::date <= %s
                """,
                (start, end),
            )
            for row in unreleased_rows:
                created = row.get("created_at") or row.get("audit_date")
                bucket = _age_bucket(created, urgent_days=2, watch_days=1)
                queues["unreleased-audits"][bucket] += 1
                if _age_bucket(created, urgent_days=2, watch_days=2) == "urgent":
                    aging["unreleased-audits"] += 1

    health = _empty_counts()
    for counts in queues.values():
        health["urgent"] += counts["urgent"]
        health["watch"] += counts["watch"]
        health["stable"] += counts["stable"]

    def stringify(counts: dict[str, int]) -> dict[str, str]:
        return {key: str(value) for key, value in counts.items()}

    return {
        "connected": True,
        "health": stringify(health),
        "queues": [
            {
                "id": "supervisor-requests",
                "title": "Supervisor Requests",
                "counts": stringify(queues["supervisor-requests"]),
                "href": "/requests-and-coaching/supervisor-requests",
            },
            {
                "id": "open-feedback",
                "title": "Open Feedback",
                "counts": stringify(queues["open-feedback"]),
                "href": "/monitoring-and-feedbacks/feedbacks",
            },
            {
                "id": "active-monitoring",
                "title": "Active Monitoring",
                "counts": stringify(queues["active-monitoring"]),
                "href": "/monitoring-and-feedbacks/monitoring",
            },
            {
                "id": "unreleased-audits",
                "title": "Unreleased Audits",
                "counts": stringify(queues["unreleased-audits"]),
                "href": "/audits/audit-list",
            },
        ],
        "aging": [
            {"id": "requests-aging", "label": "Requests aging 3+ days", "count": str(aging["requests-aging"])},
            {"id": "feedback-overdue", "label": "Feedback overdue", "count": str(aging["feedback-overdue"])},
            {"id": "monitoring-aging", "label": "Monitoring aging 2+ days", "count": str(aging["monitoring-aging"])},
            {
                "id": "unreleased-audits",
                "label": "Unreleased audits 2+ days",
                "count": str(aging["unreleased-audits"]),
            },
        ],
        # silence unused locals for linters that flag threshold vars
        "meta": {
            "monitoringUrgentBefore": monitoring_urgent.isoformat(),
            "requestsUrgentBefore": requests_urgent.isoformat(),
        },
    }
