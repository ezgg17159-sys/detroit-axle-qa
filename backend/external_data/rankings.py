"""Agent rankings from audits + volume tables."""

from __future__ import annotations

from datetime import date
from typing import Any

from .db import external_connection, schema_name
from .queries import SLUG_TO_DB_TEAM, team_slug


def _fmt(value: float | None, *, digits: int = 0) -> str:
    if value is None:
        return "—"
    if digits == 0:
        return str(int(round(value)))
    return f"{value:.{digits}f}"


def fetch_rankings(
    *,
    start: date,
    end: date,
    team: str = "calls",
    metric: str = "quality",
) -> dict[str, Any]:
    schema = schema_name()
    db_team = SLUG_TO_DB_TEAM.get(team, team)

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  COALESCE(a.agent_id, '') AS agent_id,
                  COALESCE(NULLIF(MAX(a.agent_name), ''), MAX(a.agent_id), 'Unknown') AS agent_name,
                  COALESCE(NULLIF(MAX(p.display_name), ''), MAX(a.agent_id), '') AS alias,
                  ROUND(AVG(a.quality_score)::numeric, 1) AS quality,
                  COUNT(*)::int AS audit_count,
                  ROUND(
                    (
                      CASE
                        WHEN AVG(a.quality_score) IS NULL OR AVG(a.quality_score) = 0 THEN 0
                        ELSE (STDDEV_POP(a.quality_score) / ABS(AVG(a.quality_score))) * 100
                      END
                    )::numeric,
                    1
                  ) AS rsd
                FROM {schema}.audits a
                LEFT JOIN {schema}.profiles p
                  ON COALESCE(p.agent_id, '') = COALESCE(a.agent_id, '')
                     AND a.agent_id IS NOT NULL
                     AND a.agent_id <> ''
                WHERE a.audit_date::date >= %s
                  AND a.audit_date::date <= %s
                  AND LOWER(COALESCE(a.team, '')) = LOWER(%s)
                  AND a.agent_id IS NOT NULL
                  AND a.agent_id <> ''
                GROUP BY a.agent_id
                """,
                (start, end, db_team),
            )
            audit_rows = cur.fetchall()

            volume_by_agent: dict[str, float] = {}

            def load_volume(sql: str, params: tuple[Any, ...]) -> None:
                nonlocal volume_by_agent
                try:
                    cur.execute(sql, params)
                    for row in cur.fetchall():
                        agent_id = str(row.get("agent_id") or "")
                        if not agent_id:
                            continue
                        volume_by_agent[agent_id] = float(row.get("volume") or 0)
                except Exception:
                    conn.rollback()

            if team == "calls":
                load_volume(
                    f"""
                    SELECT agent_id, COALESCE(SUM(calls_count), 0)::float AS volume
                    FROM {schema}.calls_records
                    WHERE call_date >= %s AND call_date <= %s
                    GROUP BY agent_id
                    """,
                    (start, end),
                )
            elif team == "tickets":
                load_volume(
                    f"""
                    SELECT agent_id, COALESCE(SUM(tickets_count), 0)::float AS volume
                    FROM {schema}.tickets_records
                    WHERE ticket_date >= %s AND ticket_date <= %s
                    GROUP BY agent_id
                    """,
                    (start, end),
                )
            elif team == "sales":
                load_volume(
                    f"""
                    SELECT agent_id, COALESCE(SUM(amount), 0)::float AS volume
                    FROM {schema}.sales_records
                    WHERE sale_date >= %s AND sale_date <= %s
                    GROUP BY agent_id
                    """,
                    (start, end),
                )
            else:
                for row in audit_rows:
                    volume_by_agent[str(row["agent_id"])] = float(row.get("audit_count") or 0)

    rows: list[dict[str, Any]] = []
    for row in audit_rows:
        agent_id = str(row["agent_id"])
        quality = float(row["quality"]) if row.get("quality") is not None else None
        rsd = float(row["rsd"]) if row.get("rsd") is not None else None
        volume = volume_by_agent.get(agent_id)
        quantity = volume
        combined = None
        if quality is not None and quantity is not None and rsd is not None:
            combined = quality + (quantity / 10.0) - rsd

        rows.append(
            {
                "agentId": agent_id,
                "agentName": row.get("agent_name") or "—",
                "alias": row.get("alias") or agent_id,
                "team": team_slug(db_team) or team,
                "quality": quality,
                "quantity": quantity,
                "rsd": rsd,
                "volume": volume,
                "combinedScore": combined,
                "auditCount": int(row.get("audit_count") or 0),
            }
        )

    sort_key = {
        "quality": lambda item: item["quality"] if item["quality"] is not None else -1,
        "quantity": lambda item: item["quantity"] if item["quantity"] is not None else -1,
        "combined": lambda item: item["combinedScore"] if item["combinedScore"] is not None else -1,
    }.get(metric, lambda item: item["quality"] if item["quality"] is not None else -1)

    rows.sort(key=sort_key, reverse=True)

    serialized = []
    for index, item in enumerate(rows, start=1):
        serialized.append(
            {
                "rank": str(index),
                "agentName": item["agentName"],
                "alias": item["alias"],
                "quality": _fmt(item["quality"]),
                "quantity": _fmt(item["quantity"]),
                "rsd": _fmt(item["rsd"], digits=1),
                "volume": _fmt(item["volume"]),
                "combinedScore": _fmt(item["combinedScore"], digits=1),
            }
        )

    return {"connected": True, "team": team, "metric": metric, "rows": serialized}
