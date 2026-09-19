"""Analytics aggregates from db_external_data."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from .db import external_connection, schema_name
from .queries import SLUG_TO_DB_TEAM, team_slug

DEPARTMENTS = [
    {"id": "calls", "title": "Calls"},
    {"id": "tickets", "title": "Tickets"},
    {"id": "live-chat", "title": "Live Chat"},
    {"id": "sales", "title": "Sales"},
]


def _fmt_num(value: float | int | None, *, digits: int = 0) -> str:
    if value is None:
        return "—"
    if digits == 0:
        return f"{int(round(value)):,}"
    return f"{float(value):,.{digits}f}"


def _fmt_pct(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{round(float(value))}"


def _trend(current: float | None, previous: float | None) -> str:
    if current is None or previous is None:
        return "flat"
    if current > previous + 0.5:
        return "up"
    if current < previous - 0.5:
        return "down"
    return "flat"


def _vs_prev(current: float | None, previous: float | None) -> str:
    if current is None or previous is None:
        return "—"
    delta = current - previous
    sign = "+" if delta >= 0 else ""
    return f"{sign}{round(delta)}"


def fetch_analytics(start: date, end: date, team: str = "all") -> dict[str, Any]:
    schema = schema_name()
    span_days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span_days - 1)
    team_key = (team or "all").strip().lower()
    scoped_depts = (
        [dept for dept in DEPARTMENTS if dept["id"] == team_key]
        if team_key in SLUG_TO_DB_TEAM
        else list(DEPARTMENTS)
    )
    if not scoped_depts:
        scoped_depts = list(DEPARTMENTS)

    with external_connection() as conn:
        with conn.cursor() as cur:
            # KPI totals (optionally locked to one team)
            if team_key in SLUG_TO_DB_TEAM:
                db_team = SLUG_TO_DB_TEAM[team_key]
                cur.execute(
                    f"""
                    SELECT
                      COUNT(*)::int AS total_audits,
                      ROUND(AVG(quality_score)::numeric, 1) AS avg_quality,
                      COUNT(*) FILTER (WHERE shared_with_agent IS TRUE)::int AS released
                    FROM {schema}.audits
                    WHERE audit_date::date >= %s AND audit_date::date <= %s
                      AND LOWER(COALESCE(team, '')) = LOWER(%s)
                    """,
                    (start, end, db_team),
                )
            else:
                cur.execute(
                    f"""
                    SELECT
                      COUNT(*)::int AS total_audits,
                      ROUND(AVG(quality_score)::numeric, 1) AS avg_quality,
                      COUNT(*) FILTER (WHERE shared_with_agent IS TRUE)::int AS released
                    FROM {schema}.audits
                    WHERE audit_date::date >= %s AND audit_date::date <= %s
                    """,
                    (start, end),
                )
            totals = cur.fetchone() or {}

            def _safe_volume(sql: str, params: tuple[Any, ...]) -> float | int | None:
                try:
                    cur.execute(sql, params)
                    row = cur.fetchone() or {}
                    return row.get("volume") if "volume" in row else row.get("revenue")
                except Exception:
                    conn.rollback()
                    return None

            calls_vol = None
            tickets_vol = None
            sales_rev = None

            if team_key in ("all", "calls"):
                calls_vol = _safe_volume(
                    f"""
                    SELECT COALESCE(SUM(calls_count), 0)::int AS volume
                    FROM {schema}.calls_records
                    WHERE call_date >= %s AND call_date <= %s
                    """,
                    (start, end),
                )
                if calls_vol is None:
                    cur.execute(
                        f"""
                        SELECT COUNT(*)::int AS volume
                        FROM {schema}.audits
                        WHERE LOWER(COALESCE(team, '')) = LOWER(%s)
                          AND audit_date::date >= %s AND audit_date::date <= %s
                        """,
                        ("Calls", start, end),
                    )
                    calls_vol = (cur.fetchone() or {}).get("volume") or 0

            if team_key in ("all", "tickets"):
                tickets_vol = _safe_volume(
                    f"""
                    SELECT COALESCE(SUM(tickets_count), 0)::int AS volume
                    FROM {schema}.tickets_records
                    WHERE ticket_date >= %s AND ticket_date <= %s
                    """,
                    (start, end),
                )
                if tickets_vol is None:
                    cur.execute(
                        f"""
                        SELECT COUNT(*)::int AS volume
                        FROM {schema}.audits
                        WHERE LOWER(COALESCE(team, '')) = LOWER(%s)
                          AND audit_date::date >= %s AND audit_date::date <= %s
                        """,
                        ("Tickets", start, end),
                    )
                    tickets_vol = (cur.fetchone() or {}).get("volume") or 0

            if team_key in ("all", "sales"):
                sales_rev = _safe_volume(
                    f"""
                    SELECT COALESCE(SUM(amount), 0)::numeric AS revenue
                    FROM {schema}.sales_records
                    WHERE sale_date >= %s AND sale_date <= %s
                    """,
                    (start, end),
                )
                if sales_rev is None:
                    cur.execute(
                        f"""
                        SELECT COUNT(*)::int AS revenue
                        FROM {schema}.audits
                        WHERE LOWER(COALESCE(team, '')) = LOWER(%s)
                          AND audit_date::date >= %s AND audit_date::date <= %s
                        """,
                        ("Sales", start, end),
                    )
                    sales_rev = (cur.fetchone() or {}).get("revenue")

            departments: list[dict[str, Any]] = []
            for dept in scoped_depts:
                db_team = SLUG_TO_DB_TEAM[dept["id"]]
                departments.append(
                    _department_block(
                        cur,
                        conn=conn,
                        schema=schema,
                        dept_id=dept["id"],
                        title=dept["title"],
                        db_team=db_team,
                        start=start,
                        end=end,
                        prev_start=prev_start,
                        prev_end=prev_end,
                    )
                )

    kpis: list[dict[str, str]] = [
        {"id": "total-audits", "label": "Total Audits", "value": _fmt_num(totals.get("total_audits"))},
        {
            "id": "avg-quality",
            "label": "Avg Quality",
            "value": "—" if totals.get("avg_quality") is None else f"{_fmt_pct(totals.get('avg_quality'))}%",
        },
        {"id": "released", "label": "Released", "value": _fmt_num(totals.get("released"))},
    ]
    if team_key in ("all", "calls"):
        kpis.append({"id": "calls-volume", "label": "Calls Volume", "value": _fmt_num(calls_vol)})
    if team_key in ("all", "tickets"):
        kpis.append({"id": "tickets-volume", "label": "Tickets Volume", "value": _fmt_num(tickets_vol)})
    if team_key in ("all", "live-chat"):
        # Live chat has no dedicated volume KPI today; keep parity by omitting extras.
        pass
    if team_key in ("all", "sales"):
        kpis.append(
            {
                "id": "sales-revenue",
                "label": "Sales Revenue",
                "value": "—" if sales_rev is None else f"${_fmt_num(float(sales_rev), digits=0)}",
            }
        )

    return {
        "connected": True,
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "team": team_key,
        "kpis": kpis,
        "departments": departments,
    }



def _department_block(
    cur,
    *,
    conn,
    schema: str,
    dept_id: str,
    title: str,
    db_team: str,
    start: date,
    end: date,
    prev_start: date,
    prev_end: date,
) -> dict[str, Any]:
    cur.execute(
        f"""
        SELECT COUNT(DISTINCT agent_id)::int AS agents
        FROM {schema}.profiles
        WHERE role = 'agent'
          AND COALESCE(is_active, TRUE) = TRUE
          AND LOWER(COALESCE(team, '')) = LOWER(%s)
        """,
        (db_team,),
    )
    agents = (cur.fetchone() or {}).get("agents") or 0

    cur.execute(
        f"""
        SELECT
          COUNT(*)::int AS audits,
          ROUND(AVG(quality_score)::numeric, 1) AS avg_quality,
          ROUND(MIN(quality_score)::numeric, 0) AS min_q,
          ROUND(MAX(quality_score)::numeric, 0) AS max_q
        FROM {schema}.audits
        WHERE LOWER(COALESCE(team, '')) = LOWER(%s)
          AND audit_date::date >= %s AND audit_date::date <= %s
          AND quality_score IS NOT NULL
        """,
        (db_team, start, end),
    )
    current = cur.fetchone() or {}

    cur.execute(
        f"""
        SELECT ROUND(AVG(quality_score)::numeric, 1) AS avg_quality
        FROM {schema}.audits
        WHERE LOWER(COALESCE(team, '')) = LOWER(%s)
          AND audit_date::date >= %s AND audit_date::date <= %s
          AND quality_score IS NOT NULL
        """,
        (db_team, prev_start, prev_end),
    )
    previous = cur.fetchone() or {}

    def _audit_volume(day_start: date, day_end: date) -> int:
        cur.execute(
            f"""
            SELECT COUNT(*)::int AS volume
            FROM {schema}.audits
            WHERE LOWER(COALESCE(team, '')) = LOWER(%s)
              AND audit_date::date >= %s AND audit_date::date <= %s
            """,
            (db_team, day_start, day_end),
        )
        return (cur.fetchone() or {}).get("volume") or 0

    def _try_volume(sql: str, params: tuple[Any, ...]) -> float | int | None:
        try:
            cur.execute(sql, params)
            return (cur.fetchone() or {}).get("volume")
        except Exception:
            conn.rollback()
            return None

    volume: float | int = 0
    prev_volume: float | int = 0
    if dept_id == "calls":
        volume = _try_volume(
            f"""
            SELECT COALESCE(SUM(calls_count), 0)::int AS volume
            FROM {schema}.calls_records
            WHERE call_date >= %s AND call_date <= %s
            """,
            (start, end),
        )
        prev_volume = _try_volume(
            f"""
            SELECT COALESCE(SUM(calls_count), 0)::int AS volume
            FROM {schema}.calls_records
            WHERE call_date >= %s AND call_date <= %s
            """,
            (prev_start, prev_end),
        )
        if volume is None:
            volume = _audit_volume(start, end)
        if prev_volume is None:
            prev_volume = _audit_volume(prev_start, prev_end)
    elif dept_id == "tickets":
        volume = _try_volume(
            f"""
            SELECT COALESCE(SUM(tickets_count), 0)::int AS volume
            FROM {schema}.tickets_records
            WHERE ticket_date >= %s AND ticket_date <= %s
            """,
            (start, end),
        )
        prev_volume = _try_volume(
            f"""
            SELECT COALESCE(SUM(tickets_count), 0)::int AS volume
            FROM {schema}.tickets_records
            WHERE ticket_date >= %s AND ticket_date <= %s
            """,
            (prev_start, prev_end),
        )
        if volume is None:
            volume = _audit_volume(start, end)
        if prev_volume is None:
            prev_volume = _audit_volume(prev_start, prev_end)
    elif dept_id == "sales":
        volume = _try_volume(
            f"""
            SELECT COALESCE(SUM(amount), 0)::numeric AS volume
            FROM {schema}.sales_records
            WHERE sale_date >= %s AND sale_date <= %s
            """,
            (start, end),
        )
        prev_volume = _try_volume(
            f"""
            SELECT COALESCE(SUM(amount), 0)::numeric AS volume
            FROM {schema}.sales_records
            WHERE sale_date >= %s AND sale_date <= %s
            """,
            (prev_start, prev_end),
        )
        if volume is None:
            volume = _audit_volume(start, end)
        if prev_volume is None:
            prev_volume = _audit_volume(prev_start, prev_end)
    else:
        volume = current.get("audits") or 0
        prev_volume = _audit_volume(prev_start, prev_end)

    cur.execute(
        f"""
        SELECT
          COALESCE(NULLIF(p.display_name, ''), NULLIF(a.agent_name, ''), a.agent_id) AS name,
          ROUND(AVG(a.quality_score)::numeric, 1) AS avg_quality
        FROM {schema}.audits a
        LEFT JOIN LATERAL (
          SELECT p.display_name
          FROM {schema}.profiles p
          WHERE COALESCE(p.agent_id, '') = COALESCE(a.agent_id, '')
            AND a.agent_id IS NOT NULL
            AND a.agent_id <> ''
            AND p.role = 'agent'
          ORDER BY
            CASE
              WHEN LOWER(COALESCE(p.agent_name, '')) = LOWER(COALESCE(a.agent_name, ''))
              THEN 0 ELSE 1
            END,
            CASE WHEN COALESCE(p.is_active, TRUE) THEN 0 ELSE 1 END,
            LENGTH(COALESCE(p.agent_name, '')) DESC,
            p.created_at DESC NULLS LAST
          LIMIT 1
        ) p ON TRUE
        WHERE LOWER(COALESCE(a.team, '')) = LOWER(%s)
          AND a.audit_date::date >= %s AND a.audit_date::date <= %s
          AND a.quality_score IS NOT NULL
        GROUP BY 1
        ORDER BY avg_quality DESC, name ASC
        LIMIT 1
        """,
        (db_team, start, end),
    )
    top = cur.fetchone()

    cur.execute(
        f"""
        SELECT audit_date::date AS day, ROUND(AVG(quality_score)::numeric, 1) AS score
        FROM {schema}.audits
        WHERE LOWER(COALESCE(team, '')) = LOWER(%s)
          AND audit_date::date >= %s AND audit_date::date <= %s
          AND quality_score IS NOT NULL
        GROUP BY 1
        ORDER BY 1
        """,
        (db_team, start, end),
    )
    trend_rows = cur.fetchall()
    points = [float(r["score"]) for r in trend_rows if r["score"] is not None]
    labels = [f"{r['day'].strftime('%b')} {r['day'].day}" for r in trend_rows]

    avg_q = float(current["avg_quality"]) if current.get("avg_quality") is not None else None
    prev_q = float(previous["avg_quality"]) if previous.get("avg_quality") is not None else None
    min_q = current.get("min_q")
    max_q = current.get("max_q")
    quality_range = (
        f"{int(min_q)}–{int(max_q)}%"
        if min_q is not None and max_q is not None
        else "—"
    )

    vol_num = float(volume) if volume is not None else None
    prev_vol_num = float(prev_volume) if prev_volume is not None else None

    return {
        "id": dept_id,
        "title": title,
        "agents": _fmt_num(agents),
        "audits": _fmt_num(current.get("audits")),
        "avgQuality": _fmt_pct(avg_q),
        "avgQualityTrend": _trend(avg_q, prev_q),
        "avgQualityVsPrev": _vs_prev(avg_q, prev_q),
        "volume": _fmt_num(vol_num) if dept_id != "sales" else f"${_fmt_num(vol_num)}",
        "volumeTrend": _trend(vol_num, prev_vol_num),
        "volumeVsPrev": _vs_prev(vol_num, prev_vol_num),
        "targetGap": "—",
        "qualityRange": quality_range,
        "topPerformer": (top or {}).get("name") or "—",
        "trendPoints": points,
        "trendLabels": labels,
        "team": team_slug(db_team),
    }
