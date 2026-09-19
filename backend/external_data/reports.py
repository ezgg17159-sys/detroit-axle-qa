"""Reports KPIs and performance trend from audits."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal

from .db import external_connection, schema_name
from .queries import SLUG_TO_DB_TEAM

Granularity = Literal["day", "week", "month"]


def _fmt(value: float | None, *, digits: int = 0, suffix: str = "") -> str:
    if value is None:
        return "—"
    if digits == 0:
        return f"{int(round(value)):,}{suffix}"
    return f"{value:.{digits}f}{suffix}"


def _pick_granularity(start: date, end: date) -> Granularity:
    days = max((end - start).days + 1, 1)
    if days <= 45:
        return "day"
    if days <= 180:
        return "week"
    return "month"


def _bucket_start(day: date, granularity: Granularity) -> date:
    if granularity == "day":
        return day
    if granularity == "week":
        return day - timedelta(days=day.weekday())
    return day.replace(day=1)


def _next_bucket(day: date, granularity: Granularity) -> date:
    if granularity == "day":
        return day + timedelta(days=1)
    if granularity == "week":
        return day + timedelta(days=7)
    if day.month == 12:
        return date(day.year + 1, 1, 1)
    return date(day.year, day.month + 1, 1)


def _format_label(day: date, granularity: Granularity) -> str:
    if granularity == "day":
        return f"{day.strftime('%b')} {day.day}"
    if granularity == "week":
        return f"{day.strftime('%b')} {day.day}"
    return day.strftime("%b %Y")


def _build_trend(
    rows: list[dict[str, Any]],
    *,
    start: date,
    end: date,
) -> tuple[list[float], list[str]]:
    granularity = _pick_granularity(start, end)
    by_bucket: dict[date, list[float]] = {}
    for row in rows:
        day = row.get("day")
        score = row.get("score")
        if day is None or score is None:
            continue
        if hasattr(day, "date"):
            day = day.date()
        bucket = _bucket_start(day, granularity)
        by_bucket.setdefault(bucket, []).append(float(score))

    if not by_bucket:
        return [], []

    points: list[float] = []
    labels: list[str] = []
    cursor = _bucket_start(start, granularity)
    last = _bucket_start(end, granularity)
    while cursor <= last:
        values = by_bucket.get(cursor)
        if values:
            avg = sum(values) / len(values)
            points.append(round(avg, 1))
            labels.append(_format_label(cursor, granularity))
        cursor = _next_bucket(cursor, granularity)

    return points, labels


def fetch_reports(
    *,
    start: date,
    end: date,
    team: str = "all",
    agent_ids: list[str] | None = None,
) -> dict[str, Any]:
    schema = schema_name()
    agent_ids = [item for item in (agent_ids or []) if item]

    clauses = ["a.audit_date::date >= %s", "a.audit_date::date <= %s"]
    params: list[Any] = [start, end]

    if team and team != "all":
        clauses.append("LOWER(COALESCE(a.team, '')) = LOWER(%s)")
        params.append(SLUG_TO_DB_TEAM.get(team, team))

    if agent_ids:
        clauses.append("a.agent_id = ANY(%s)")
        params.append(agent_ids)

    where_sql = " AND ".join(clauses)

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*)::int AS total_audits
                FROM {schema}.audits a
                WHERE {where_sql}
                """,
                params,
            )
            total = (cur.fetchone() or {}).get("total_audits") or 0

            cur.execute(
                f"""
                SELECT
                  LOWER(COALESCE(a.team, '')) AS team_key,
                  ROUND(AVG(a.quality_score)::numeric, 1) AS avg_quality
                FROM {schema}.audits a
                WHERE {where_sql}
                GROUP BY LOWER(COALESCE(a.team, ''))
                """,
                params,
            )
            by_team = {
                str(row["team_key"] or "").lower(): float(row["avg_quality"])
                for row in cur.fetchall()
                if row.get("avg_quality") is not None
            }

            cur.execute(
                f"""
                SELECT
                  a.audit_date::date AS day,
                  ROUND(AVG(a.quality_score)::numeric, 1) AS score
                FROM {schema}.audits a
                WHERE {where_sql}
                  AND a.quality_score IS NOT NULL
                GROUP BY a.audit_date::date
                ORDER BY day ASC
                """,
                params,
            )
            trend_rows = cur.fetchall()

    def team_avg(title: str) -> float | None:
        return by_team.get(title.lower())

    kpis = [
        {"id": "total-audits", "label": "Total Audits", "value": _fmt(float(total))},
        {
            "id": "calls",
            "label": "Calls Avg",
            "value": _fmt(team_avg("calls"), digits=0, suffix="%"),
        },
        {
            "id": "tickets",
            "label": "Tickets Avg",
            "value": _fmt(team_avg("tickets"), digits=0, suffix="%"),
        },
        {
            "id": "live-chat",
            "label": "Live Chat Avg",
            "value": _fmt(team_avg("live chat"), digits=0, suffix="%"),
        },
        {
            "id": "sales",
            "label": "Sales Avg",
            "value": _fmt(team_avg("sales"), digits=0, suffix="%"),
        },
    ]

    points, labels = _build_trend(trend_rows, start=start, end=end)

    return {
        "connected": True,
        "kpis": kpis,
        "trendPoints": points,
        "trendLabels": labels,
        "trendGranularity": _pick_granularity(start, end),
    }
