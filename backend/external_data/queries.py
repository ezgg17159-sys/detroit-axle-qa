"""Queries against db_external_data for Evaluation Progress."""

from __future__ import annotations

import re
import uuid
from calendar import monthrange
from datetime import date
from typing import Any

from .db import external_connection, schema_name

WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

TEAM_TO_SLUG = {
    "calls": "calls",
    "tickets": "tickets",
    "live chat": "live-chat",
    "live-chat": "live-chat",
    "sales": "sales",
    "quality assurance": "quality-assurance",
    "quality-assurance": "quality-assurance",
    "qa": "quality-assurance",
}

SLUG_TO_DB_TEAM = {
    "calls": "Calls",
    "tickets": "Tickets",
    "live-chat": "Live Chat",
    "sales": "Sales",
    "quality-assurance": "Quality Assurance",
}


def team_slug(raw: str | None) -> str:
    if not raw:
        return ""
    return TEAM_TO_SLUG.get(raw.strip().lower(), raw.strip().lower().replace(" ", "-"))


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


def fetch_evaluation_progress(
    *,
    year: int,
    month: int,
    team: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    schema = schema_name()
    start = _month_start(year, month)
    last_day = monthrange(year, month)[1]
    end = date(year, month, last_day)

    team_filter_sql = ""
    params: list[Any] = []
    if team and team != "all":
        db_team = SLUG_TO_DB_TEAM.get(team, team)
        team_filter_sql = "AND LOWER(COALESCE(p.team, '')) = LOWER(%s)"
        params.append(db_team)

    search_sql = ""
    if search and search.strip():
        search_sql = """
            AND (
              COALESCE(p.display_name, '') ILIKE %s
              OR COALESCE(p.agent_name, '') ILIKE %s
              OR COALESCE(p.agent_id, '') ILIKE %s
            )
        """
        like = f"%{search.strip()}%"
        params.extend([like, like, like])

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  p.agent_id,
                  COALESCE(NULLIF(p.display_name, ''), NULLIF(p.agent_name, ''), p.agent_id) AS name,
                  COALESCE(p.agent_id, '') AS alias,
                  p.team
                FROM {schema}.profiles p
                WHERE p.role = 'agent'
                  AND COALESCE(p.is_active, TRUE) = TRUE
                  AND p.agent_id IS NOT NULL
                  AND p.agent_id <> ''
                  {team_filter_sql}
                  {search_sql}
                ORDER BY name ASC
                """,
                params,
            )
            profile_rows = cur.fetchall()

            # Deduplicate by agent_id (keep first / alphabetical name already ordered)
            agents_map: dict[str, dict[str, Any]] = {}
            for row in profile_rows:
                agent_id = row["agent_id"]
                if agent_id in agents_map:
                    continue
                agents_map[agent_id] = {
                    "id": agent_id,
                    "name": row["name"],
                    "alias": row["alias"],
                    "team": team_slug(row["team"]),
                    "scheduledDayOff": "",
                    "latestAuditDate": "",
                    "days": {
                        str(day): {"score": None, "off": False}
                        for day in range(1, last_day + 1)
                    },
                }

            agent_ids = list(agents_map.keys())
            if not agent_ids:
                return {"connected": True, "year": year, "month": month, "agents": []}

            cur.execute(
                f"""
                SELECT agent_id, status
                FROM {schema}.agent_daily_status
                WHERE agent_id = ANY(%s)
                  AND status LIKE 'OFF_WEEKDAY_%%'
                """,
                (agent_ids,),
            )
            for row in cur.fetchall():
                agent = agents_map.get(row["agent_id"])
                if not agent or agent["scheduledDayOff"]:
                    continue
                match = re.search(r"OFF_WEEKDAY_(\d+)", row["status"] or "")
                if not match:
                    continue
                idx = int(match.group(1))
                if 0 <= idx <= 6:
                    agent["scheduledDayOff"] = WEEKDAY_LABELS[idx]

            cur.execute(
                f"""
                SELECT agent_id, status, status_date::date AS status_date
                FROM {schema}.agent_daily_status
                WHERE agent_id = ANY(%s)
                  AND (
                    (status LIKE 'OFF_EVAL_%%' AND status_date::date = %s)
                    OR (status = 'OFF' AND status_date::date >= %s AND status_date::date <= %s)
                  )
                """,
                (agent_ids, start, start, end),
            )
            for row in cur.fetchall():
                agent = agents_map.get(row["agent_id"])
                if not agent:
                    continue
                status = row["status"] or ""
                if status.startswith("OFF_EVAL_"):
                    match = re.search(r"OFF_EVAL_(\d+)", status)
                    if match:
                        day = int(match.group(1))
                        if 1 <= day <= last_day:
                            agent["days"][str(day)]["off"] = True
                elif status == "OFF" and row["status_date"]:
                    day = row["status_date"].day
                    if row["status_date"].month == month and row["status_date"].year == year:
                        agent["days"][str(day)]["off"] = True

            cur.execute(
                f"""
                SELECT
                  agent_id,
                  audit_date::date AS day,
                  ROUND(AVG(quality_score)::numeric, 0) AS score
                FROM {schema}.audits
                WHERE agent_id = ANY(%s)
                  AND audit_date::date >= %s
                  AND audit_date::date <= %s
                  AND quality_score IS NOT NULL
                GROUP BY agent_id, audit_date::date
                """,
                (agent_ids, start, end),
            )
            for row in cur.fetchall():
                agent = agents_map.get(row["agent_id"])
                if not agent or not row["day"]:
                    continue
                day = row["day"].day
                key = str(day)
                if key in agent["days"] and not agent["days"][key]["off"]:
                    agent["days"][key]["score"] = int(row["score"]) if row["score"] is not None else None

            cur.execute(
                f"""
                SELECT agent_id, MAX(audit_date::date) AS latest
                FROM {schema}.audits
                WHERE agent_id = ANY(%s)
                GROUP BY agent_id
                """,
                (agent_ids,),
            )
            for row in cur.fetchall():
                agent = agents_map.get(row["agent_id"])
                if agent and row["latest"]:
                    agent["latestAuditDate"] = row["latest"].isoformat()

    return {
        "connected": True,
        "year": year,
        "month": month,
        "agents": list(agents_map.values()),
    }


def toggle_day_off(agent_id: str, iso_day: str, off: bool, *, user_name: str = "") -> bool:
    """Mark/unmark an evaluation day off. Returns resulting off state."""
    schema = schema_name()
    day = date.fromisoformat(iso_day)
    month_anchor = date(day.year, day.month, 1)
    status = f"OFF_EVAL_{day.day}"

    with external_connection() as conn:
        with conn.cursor() as cur:
            # Resolve team for the agent
            cur.execute(
                f"""
                SELECT team
                FROM {schema}.profiles
                WHERE agent_id = %s
                ORDER BY COALESCE(is_active, FALSE) DESC
                LIMIT 1
                """,
                (agent_id,),
            )
            profile = cur.fetchone()
            team = (profile or {}).get("team") or ""

            if off:
                cur.execute(
                    f"""
                    SELECT id
                    FROM {schema}.agent_daily_status
                    WHERE agent_id = %s
                      AND status = %s
                      AND status_date::date = %s
                    LIMIT 1
                    """,
                    (agent_id, status, month_anchor),
                )
                existing = cur.fetchone()
                if not existing:
                    cur.execute(
                        f"""
                        INSERT INTO {schema}.agent_daily_status
                          (id, agent_id, team, status_date, status, created_by_name, created_at)
                        VALUES
                          (%s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (str(uuid.uuid4()), agent_id, team, month_anchor, status, user_name or "QA System"),
                    )
                return True

            cur.execute(
                f"""
                DELETE FROM {schema}.agent_daily_status
                WHERE agent_id = %s
                  AND status = %s
                  AND status_date::date = %s
                """,
                (agent_id, status, month_anchor),
            )
            return False


def set_scheduled_day_off(agent_id: str, weekday: str, *, user_name: str = "") -> str:
    """Set weekly scheduled day off. `weekday` is Sun..Sat or empty to clear."""
    schema = schema_name()
    label = (weekday or "").strip()
    if label and label not in WEEKDAY_LABELS:
        raise ValueError(f"Invalid weekday “{label}”. Use Sun–Sat or empty.")

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT team
                FROM {schema}.profiles
                WHERE agent_id = %s
                ORDER BY COALESCE(is_active, FALSE) DESC
                LIMIT 1
                """,
                (agent_id,),
            )
            profile = cur.fetchone()
            team = (profile or {}).get("team") or ""

            cur.execute(
                f"""
                DELETE FROM {schema}.agent_daily_status
                WHERE agent_id = %s
                  AND status LIKE 'OFF_WEEKDAY_%%'
                """,
                (agent_id,),
            )

            if not label:
                return ""

            idx = WEEKDAY_LABELS.index(label)
            cur.execute(
                f"""
                INSERT INTO {schema}.agent_daily_status
                  (id, agent_id, team, status_date, status, created_by_name, created_at)
                VALUES
                  (%s, %s, %s, %s, %s, %s, NOW())
                """,
                (
                    str(uuid.uuid4()),
                    agent_id,
                    team,
                    date(1970, 1, 1),
                    f"OFF_WEEKDAY_{idx}",
                    user_name or "QA System",
                ),
            )
            return label
