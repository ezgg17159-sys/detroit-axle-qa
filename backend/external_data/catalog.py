"""Schema discovery and shared list helpers for db_external_data."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from .db import external_connection, schema_name
from .queries import SLUG_TO_DB_TEAM, team_slug


def _iso_date(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value)
    return text[:10] if len(text) >= 10 else text


def list_schema_tables() -> list[dict[str, Any]]:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name ASC
                """,
                (schema,),
            )
            table_names = [row["table_name"] for row in cur.fetchall()]

            result: list[dict[str, Any]] = []
            for name in table_names:
                cur.execute(
                    """
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position ASC
                    """,
                    (schema, name),
                )
                columns = [
                    {"name": col["column_name"], "type": col["data_type"]}
                    for col in cur.fetchall()
                ]
                row_count = None
                try:
                    cur.execute(
                        f'SELECT COUNT(*)::int AS n FROM "{schema}"."{name}"'
                    )
                    row_count = (cur.fetchone() or {}).get("n")
                except Exception:
                    conn.rollback()
                result.append(
                    {
                        "name": name,
                        "columnCount": len(columns),
                        "rowCount": row_count,
                        "columns": columns,
                    }
                )
            return result


def list_agents(*, team: str | None = None, search: str | None = None) -> list[dict[str, Any]]:
    schema = schema_name()
    clauses = [
        "p.role = 'agent'",
        "COALESCE(p.is_active, TRUE) = TRUE",
        "p.agent_id IS NOT NULL",
        "p.agent_id <> ''",
    ]
    params: list[Any] = []

    if team and team != "all":
        db_team = SLUG_TO_DB_TEAM.get(team, team)
        clauses.append("LOWER(COALESCE(p.team, '')) = LOWER(%s)")
        params.append(db_team)

    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append(
            "("
            "COALESCE(p.display_name, '') ILIKE %s "
            "OR COALESCE(p.agent_name, '') ILIKE %s "
            "OR COALESCE(p.agent_id, '') ILIKE %s"
            ")"
        )
        params.extend([like, like, like])

    where_sql = " AND ".join(clauses)

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  p.agent_id,
                  COALESCE(NULLIF(p.display_name, ''), NULLIF(p.agent_name, ''), p.agent_id) AS name,
                  COALESCE(NULLIF(p.agent_name, ''), '') AS agent_name,
                  COALESCE(p.agent_id, '') AS alias,
                  p.team,
                  COALESCE(p.is_active, TRUE) AS is_active,
                  (
                    SELECT a.audit_date
                    FROM {schema}.audits a
                    WHERE COALESCE(a.agent_id, '') = COALESCE(p.agent_id, '')
                      AND a.agent_id IS NOT NULL
                      AND a.agent_id <> ''
                    ORDER BY a.audit_date DESC NULLS LAST, a.created_at DESC NULLS LAST
                    LIMIT 1
                  ) AS last_internal_audit,
                  (
                    SELECT a.quality_score
                    FROM {schema}.audits a
                    WHERE COALESCE(a.agent_id, '') = COALESCE(p.agent_id, '')
                      AND a.agent_id IS NOT NULL
                      AND a.agent_id <> ''
                    ORDER BY a.audit_date DESC NULLS LAST, a.created_at DESC NULLS LAST
                    LIMIT 1
                  ) AS last_internal_audit_score
                FROM {schema}.profiles p
                WHERE {where_sql}
                ORDER BY
                  CASE WHEN COALESCE(p.is_active, TRUE) THEN 0 ELSE 1 END,
                  LENGTH(COALESCE(p.agent_name, '')) DESC,
                  name ASC
                """,
                params,
            )

            seen: set[str] = set()
            agents: list[dict[str, Any]] = []
            for row in cur.fetchall():
                agent_id = str(row["agent_id"])
                if agent_id in seen:
                    continue
                seen.add(agent_id)
                last_audit = _iso_date(row.get("last_internal_audit"))
                score_raw = row.get("last_internal_audit_score")
                score_text = ""
                if score_raw is not None and str(score_raw).strip() != "":
                    try:
                        score_text = str(int(round(float(score_raw))))
                    except (TypeError, ValueError):
                        score_text = str(score_raw).strip()
                agents.append(
                    {
                        "id": agent_id,
                        "name": row["name"] or agent_id,
                        "agentName": row.get("agent_name") or "",
                        "alias": row.get("alias") or agent_id,
                        "team": team_slug(row.get("team")),
                        "active": bool(row.get("is_active", True)),
                        "lastInternalAudit": last_audit,
                        "lastInternalAuditScore": score_text,
                    }
                )
            return agents
