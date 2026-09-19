"""Team production aggregated from calls / tickets / sales volume tables."""

from __future__ import annotations

from datetime import date
from typing import Any

from .db import external_connection, schema_name
from .queries import team_slug


def _parse_department(raw: str | None) -> str:
    slug = team_slug(raw)
    if slug in {"calls", "tickets", "live-chat", "sales"}:
        return slug
    return "unassigned"


def list_production(
    *,
    start: date | None = None,
    end: date | None = None,
    department: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    schema = schema_name()
    agents: dict[str, dict[str, Any]] = {}

    def ensure(agent_id: str, agent_name: str = "") -> dict[str, Any]:
        key = agent_id or agent_name.strip().lower()
        if not key:
            key = f"unknown-{len(agents) + 1}"
        row = agents.get(key)
        if row is None:
            row = {
                "id": f"prod-{key}",
                "employeeName": agent_name or agent_id or "Unknown",
                "employeeId": agent_id,
                "vonageId": "",
                "department": "unassigned",
                "callsHandled": None,
                "tickets": None,
                "sales": None,
                "periodStart": start.isoformat() if start else None,
                "periodEnd": end.isoformat() if end else None,
                "updatedAt": "",
            }
            agents[key] = row
        elif agent_name and (not row["employeeName"] or row["employeeName"] == row["employeeId"]):
            row["employeeName"] = agent_name
        return row

    with external_connection() as conn:
        with conn.cursor() as cur:
            calls_sql = f"""
                SELECT
                  COALESCE(agent_id, '') AS agent_id,
                  COALESCE(NULLIF(MAX(agent_name), ''), MAX(agent_id), '') AS agent_name,
                  COALESCE(SUM(calls_count), 0)::int AS volume,
                  MAX(created_at) AS updated_at
                FROM {schema}.calls_records
                WHERE TRUE
            """
            calls_params: list[Any] = []
            if start is not None:
                calls_sql += " AND call_date >= %s"
                calls_params.append(start)
            if end is not None:
                calls_sql += " AND call_date <= %s"
                calls_params.append(end)
            calls_sql += " GROUP BY COALESCE(agent_id, '')"

            cur.execute(calls_sql, calls_params)
            for row in cur.fetchall():
                agent_id = str(row.get("agent_id") or "")
                entry = ensure(agent_id, str(row.get("agent_name") or ""))
                entry["callsHandled"] = int(row.get("volume") or 0)
                if row.get("updated_at"):
                    entry["updatedAt"] = str(row["updated_at"])

            tickets_sql = f"""
                SELECT
                  COALESCE(agent_id, '') AS agent_id,
                  COALESCE(NULLIF(MAX(agent_name), ''), MAX(agent_id), '') AS agent_name,
                  COALESCE(SUM(tickets_count), 0)::int AS volume,
                  MAX(created_at) AS updated_at
                FROM {schema}.tickets_records
                WHERE TRUE
            """
            tickets_params: list[Any] = []
            if start is not None:
                tickets_sql += " AND ticket_date >= %s"
                tickets_params.append(start)
            if end is not None:
                tickets_sql += " AND ticket_date <= %s"
                tickets_params.append(end)
            tickets_sql += " GROUP BY COALESCE(agent_id, '')"

            cur.execute(tickets_sql, tickets_params)
            for row in cur.fetchall():
                agent_id = str(row.get("agent_id") or "")
                entry = ensure(agent_id, str(row.get("agent_name") or ""))
                entry["tickets"] = int(row.get("volume") or 0)
                if row.get("updated_at") and (
                    not entry["updatedAt"] or str(row["updated_at"]) > entry["updatedAt"]
                ):
                    entry["updatedAt"] = str(row["updated_at"])

            sales_sql = f"""
                SELECT
                  COALESCE(agent_id, '') AS agent_id,
                  COALESCE(NULLIF(MAX(agent_name), ''), MAX(agent_id), '') AS agent_name,
                  COALESCE(SUM(amount), 0)::float AS volume,
                  MAX(created_at) AS updated_at
                FROM {schema}.sales_records
                WHERE TRUE
            """
            sales_params: list[Any] = []
            if start is not None:
                sales_sql += " AND sale_date >= %s"
                sales_params.append(start)
            if end is not None:
                sales_sql += " AND sale_date <= %s"
                sales_params.append(end)
            sales_sql += " GROUP BY COALESCE(agent_id, '')"

            cur.execute(sales_sql, sales_params)
            for row in cur.fetchall():
                agent_id = str(row.get("agent_id") or "")
                entry = ensure(agent_id, str(row.get("agent_name") or ""))
                entry["sales"] = float(row.get("volume") or 0)
                if row.get("updated_at") and (
                    not entry["updatedAt"] or str(row["updated_at"]) > entry["updatedAt"]
                ):
                    entry["updatedAt"] = str(row["updated_at"])

            agent_ids = [aid for aid in agents.keys() if aid]
            if agent_ids:
                cur.execute(
                    f"""
                    SELECT agent_id, agent_name, display_name, team, department
                    FROM {schema}.profiles
                    WHERE agent_id = ANY(%s)
                    """,
                    (agent_ids,),
                )
                for row in cur.fetchall():
                    agent_id = str(row.get("agent_id") or "")
                    entry = agents.get(agent_id)
                    if not entry:
                        continue
                    name = row.get("display_name") or row.get("agent_name")
                    if name:
                        entry["employeeName"] = str(name)
                    entry["department"] = _parse_department(
                        row.get("team") or row.get("department")
                    )

    rows = list(agents.values())

    if department and department != "all":
        rows = [row for row in rows if row["department"] == department]

    q = (search or "").strip().lower()
    if q:
        rows = [
            row
            for row in rows
            if q in str(row["employeeName"]).lower()
            or q in str(row["employeeId"]).lower()
            or q in str(row["vonageId"]).lower()
            or q in str(row["department"]).lower()
        ]

    rows.sort(key=lambda row: str(row["employeeName"]).lower())
    return {"connected": True, "total": len(rows), "items": rows}
