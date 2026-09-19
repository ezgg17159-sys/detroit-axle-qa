"""Read helpers for audits / monitoring / case_types / team_metrics."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from .db import external_connection, schema_name
from .queries import team_slug


def _best_profile_lateral_sql(schema: str) -> str:
    """Pick one profile per audit when duplicate agent_id rows exist."""
    return f"""
                LEFT JOIN LATERAL (
                  SELECT p.display_name
                  FROM {schema}.profiles p
                  WHERE (
                      a.agent_id IS NOT NULL
                      AND a.agent_id <> ''
                      AND COALESCE(p.agent_id, '') = COALESCE(a.agent_id, '')
                    )
                    OR (
                      (a.agent_id IS NULL OR a.agent_id = '')
                      AND LOWER(COALESCE(p.agent_name, '')) = LOWER(COALESCE(a.agent_name, ''))
                    )
                  ORDER BY
                    CASE
                      WHEN LOWER(COALESCE(p.agent_name, '')) = LOWER(COALESCE(a.agent_name, ''))
                      THEN 0 ELSE 1
                    END,
                    CASE WHEN COALESCE(p.is_active, TRUE) THEN 0 ELSE 1 END,
                    CASE
                      WHEN LOWER(COALESCE(p.team, '')) = LOWER(COALESCE(a.team, ''))
                      THEN 0 ELSE 1
                    END,
                    CASE WHEN NULLIF(BTRIM(COALESCE(p.display_name, '')), '') IS NULL
                      THEN 1 ELSE 0
                    END,
                    LENGTH(COALESCE(p.agent_name, '')) DESC,
                    p.created_at DESC NULLS LAST
                  LIMIT 1
                ) p ON TRUE
    """


def _iso_date(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value)
    return text[:10] if len(text) >= 10 else text


def _iso_dt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _map_result(raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if text in {"pass", "passed", "yes"}:
        return "pass"
    if text in {"fail", "failed", "no"}:
        return "fail"
    if text in {"borderline", "border"}:
        return "borderline"
    if text in {"n/a", "na", "n.a.", "none"}:
        return "n/a"
    return "n/a"


OTHER_INFO_METRIC = "__other_information__"
REEVALUATED_METRIC = "__reevaluated__"


def _other_information_from_score_details(raw: Any) -> str:
    if not isinstance(raw, list):
        return ""
    for item in raw:
        if not isinstance(item, dict):
            continue
        if str(item.get("metric") or "").strip() != OTHER_INFO_METRIC:
            continue
        return str(
            item.get("metric_comment") or item.get("qaNote") or item.get("note") or ""
        )
    return ""


def _reevaluated_from_score_details(raw: Any) -> bool:
    if not isinstance(raw, list):
        return False
    for item in raw:
        if not isinstance(item, dict):
            continue
        if str(item.get("metric") or "").strip() != REEVALUATED_METRIC:
            continue
        result = str(item.get("result") or "").strip().lower()
        return result in {"yes", "true", "1", "done", "pass"}
    return False


def _format_earned(value: Any) -> str:
    if value is None or value == "":
        return ""
    try:
        number = float(value)
    except (TypeError, ValueError):
        text = str(value).strip()
        return text
    if abs(number - round(number)) < 1e-9:
        return str(int(round(number)))
    formatted = f"{number:.2f}".rstrip("0").rstrip(".")
    return formatted


def _metrics_from_score_details(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    rows: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        metric = str(item.get("metric") or f"Metric {index + 1}")
        if metric in {OTHER_INFO_METRIC, REEVALUATED_METRIC} or metric.strip().lower() == "issue was resolved":
            continue
        earned = item.get("earned")
        rows.append(
            {
                "id": str(item.get("id") or f"metric-{index + 1}"),
                "metric": metric,
                "result": _map_result(item.get("result")),
                "earned": _format_earned(earned),
                "qaNote": str(
                    item.get("qaNote")
                    or item.get("metric_comment")
                    or item.get("note")
                    or ""
                ),
            }
        )
    return rows


def _issue_resolved_from_score_details(raw: Any) -> tuple[str, str]:
    if not isinstance(raw, list):
        return "", ""
    for item in raw:
        if not isinstance(item, dict):
            continue
        metric = str(item.get("metric") or "").strip().lower()
        if metric != "issue was resolved":
            continue
        result = str(item.get("result") or "").strip().lower()
        if result in {"yes", "pass", "passed", "true", "1"}:
            resolved = "yes"
        elif result in {"no", "fail", "failed", "false", "0"}:
            resolved = "no"
        else:
            resolved = ""
        note = str(item.get("metric_comment") or item.get("qaNote") or item.get("note") or "")
        return resolved, note
    return "", ""


def _serialize_audit(row: dict[str, Any]) -> dict[str, Any]:
    score = row.get("quality_score")
    score_text = "" if score is None else str(score)
    if score is not None:
        try:
            score_text = str(int(round(float(score))))
        except (TypeError, ValueError):
            score_text = str(score)

    issue_resolved, issue_note = _issue_resolved_from_score_details(row.get("score_details"))
    reevaluated = _reevaluated_from_score_details(row.get("score_details"))
    alias = (
        row.get("display_name")
        or row.get("alias")
        or row.get("agent_id")
        or ""
    )

    return {
        "id": str(row.get("id") or ""),
        "date": _iso_date(row.get("audit_date")),
        "team": team_slug(row.get("team")) or "calls",
        "agentName": row.get("agent_name") or "",
        "alias": alias,
        "agentId": str(row.get("agent_id") or ""),
        "score": score_text,
        "qualityScore": score_text,
        "shared": bool(row.get("shared_with_agent")),
        "evaluate": "done",
        "reevaluated": reevaluated,
        "caseType": row.get("case_type") or "",
        "status": "Shared" if row.get("shared_with_agent") else "Internal",
        "ticketNumber": row.get("ticket_id") or "",
        "orderNumber": row.get("order_number") or "",
        "phoneNumber": row.get("phone_number") or "",
        "comments": row.get("comments") or "",
        "otherInformation": row.get("other_information")
        or _other_information_from_score_details(row.get("score_details"))
        or "",
        "createdBy": row.get("created_by_name") or "",
        "issueResolved": issue_resolved,
        "issueResolvedNote": issue_note,
        "metrics": _metrics_from_score_details(row.get("score_details")),
        "lastInternalAudit": _iso_date(row.get("last_internal_audit")) or "",
        "createdAt": _iso_dt(row.get("created_at")),
    }


def list_audits(
    *,
    start: date | None = None,
    end: date | None = None,
    team: str | None = None,
    search: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    schema = schema_name()
    clauses = ["TRUE"]
    params: list[Any] = []

    if start:
        clauses.append("a.audit_date::date >= %s")
        params.append(start)
    if end:
        clauses.append("a.audit_date::date <= %s")
        params.append(end)
    if team and team != "all":
        from .queries import SLUG_TO_DB_TEAM

        clauses.append("LOWER(COALESCE(a.team, '')) = LOWER(%s)")
        params.append(SLUG_TO_DB_TEAM.get(team, team))
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append(
            "("
            "COALESCE(a.agent_name, '') ILIKE %s OR "
            "COALESCE(a.agent_id, '') ILIKE %s OR "
            "COALESCE(a.case_type, '') ILIKE %s OR "
            "COALESCE(a.ticket_id, '') ILIKE %s OR "
            "COALESCE(a.order_number, '') ILIKE %s OR "
            "COALESCE(a.created_by_name, '') ILIKE %s OR "
            "EXISTS ("
            f"  SELECT 1 FROM {schema}.profiles p_search"
            "  WHERE ("
            "    (COALESCE(p_search.agent_id, '') = COALESCE(a.agent_id, '')"
            "     AND a.agent_id IS NOT NULL AND a.agent_id <> '')"
            "    OR ("
            "      (a.agent_id IS NULL OR a.agent_id = '')"
            "      AND LOWER(COALESCE(p_search.agent_name, ''))"
            "          = LOWER(COALESCE(a.agent_name, ''))"
            "    )"
            "  )"
            "  AND ("
            "    COALESCE(p_search.display_name, '') ILIKE %s"
            "    OR COALESCE(p_search.agent_name, '') ILIKE %s"
            "  )"
            ")"
            ")"
        )
        params.extend([like, like, like, like, like, like, like, like])

    where_sql = " AND ".join(clauses)
    limit = max(1, min(int(limit), 2000))
    offset = max(0, int(offset))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*)::int AS n FROM {schema}.audits a WHERE {where_sql}",
                params,
            )
            total = (cur.fetchone() or {}).get("n") or 0
            cur.execute(
                f"""
                SELECT
                    a.*,
                    p.display_name,
                    (
                        SELECT MAX(a2.audit_date)
                        FROM {schema}.audits a2
                        WHERE COALESCE(a2.agent_id, '') = COALESCE(a.agent_id, '')
                          AND a2.agent_id IS NOT NULL
                          AND a2.agent_id <> ''
                    ) AS last_internal_audit
                FROM {schema}.audits a
                {_best_profile_lateral_sql(schema)}
                WHERE {where_sql}
                ORDER BY a.audit_date DESC NULLS LAST, a.created_at DESC NULLS LAST
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = [_serialize_audit(dict(row)) for row in cur.fetchall()]

    return {"connected": True, "total": total, "limit": limit, "offset": offset, "audits": rows}


def get_audit(audit_id: str) -> dict[str, Any] | None:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    a.*,
                    p.display_name,
                    (
                        SELECT MAX(a2.audit_date)
                        FROM {schema}.audits a2
                        WHERE COALESCE(a2.agent_id, '') = COALESCE(a.agent_id, '')
                          AND a2.agent_id IS NOT NULL
                          AND a2.agent_id <> ''
                    ) AS last_internal_audit
                FROM {schema}.audits a
                {_best_profile_lateral_sql(schema)}
                WHERE a.id = %s
                LIMIT 1
                """,
                (audit_id,),
            )
            row = cur.fetchone()
            return _serialize_audit(dict(row)) if row else None


def list_case_types(*, team: str | None = None) -> list[dict[str, Any]]:
    schema = schema_name()
    clauses = ["TRUE"]
    params: list[Any] = []
    if team and team != "all":
        from .queries import SLUG_TO_DB_TEAM

        clauses.append("LOWER(COALESCE(team, '')) = LOWER(%s)")
        params.append(SLUG_TO_DB_TEAM.get(team, team))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, name, sort_order, team
                FROM {schema}.case_types
                WHERE {" AND ".join(clauses)}
                ORDER BY sort_order ASC NULLS LAST, name ASC
                """,
                params,
            )
            return [
                {
                    "id": str(row["id"]),
                    "name": row["name"] or "",
                    "sortOrder": int(row["sort_order"] or 0),
                    "active": True,
                    "team": team_slug(row.get("team")),
                }
                for row in cur.fetchall()
            ]


def list_team_metrics(*, team: str | None = None) -> list[dict[str, Any]]:
    schema = schema_name()
    clauses = ["TRUE"]
    params: list[Any] = []
    if team and team != "all":
        from .queries import SLUG_TO_DB_TEAM

        clauses.append("LOWER(COALESCE(team, '')) = LOWER(%s)")
        params.append(SLUG_TO_DB_TEAM.get(team, team))

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT *
                FROM {schema}.team_metrics
                WHERE {" AND ".join(clauses)}
                ORDER BY sort_order ASC NULLS LAST, name ASC
                """,
                params,
            )
            rows = []
            for row in cur.fetchall():
                rows.append(
                    {
                        "id": str(row["id"]),
                        "team": team_slug(row.get("team")),
                        "name": row.get("name") or "",
                        "pass": float(row["pass"]) if row.get("pass") is not None else None,
                        "borderline": float(row["borderline"]) if row.get("borderline") is not None else None,
                        "countsTowardScore": bool(row.get("counts_toward_score")),
                        "autoFail": bool(row.get("auto_fail")),
                        "lockedNa": bool(row.get("locked_na")),
                        "sortOrder": int(row.get("sort_order") or 0),
                        "defaultValue": row.get("default_value") or "",
                        "options": row.get("options"),
                    }
                )
            return rows


def _db_team_label(team: str | None) -> str:
    from .queries import SLUG_TO_DB_TEAM

    raw = (team or "").strip()
    if not raw:
        return "Calls"
    return SLUG_TO_DB_TEAM.get(raw, SLUG_TO_DB_TEAM.get(team_slug(raw), raw))


def upsert_case_type(
    *,
    case_id: str,
    name: str,
    sort_order: int = 0,
    team: str | None = None,
) -> dict[str, Any]:
    schema = schema_name()
    team_label = _db_team_label(team)
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.case_types (id, name, sort_order, team)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  sort_order = EXCLUDED.sort_order,
                  team = EXCLUDED.team
                RETURNING id, name, sort_order, team
                """,
                (case_id, name, sort_order, team_label),
            )
            row = cur.fetchone()
        conn.commit()
    return {
        "id": str(row["id"]),
        "name": row["name"] or "",
        "sortOrder": int(row["sort_order"] or 0),
        "active": True,
        "team": team_slug(row.get("team")),
    }


def delete_case_type(case_id: str) -> bool:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {schema}.case_types WHERE id = %s",
                (case_id,),
            )
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def upsert_team_metric(
    *,
    metric_id: str,
    name: str,
    team: str | None = None,
    pass_points: float | None = None,
    borderline_points: float | None = None,
    counts_toward_score: bool = True,
    auto_fail: bool = False,
    sort_order: int = 0,
) -> dict[str, Any]:
    schema = schema_name()
    team_label = _db_team_label(team)
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {schema}.team_metrics (
                  id, team, name, pass, borderline,
                  counts_toward_score, auto_fail, sort_order, locked_na
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, FALSE)
                ON CONFLICT (id) DO UPDATE SET
                  team = EXCLUDED.team,
                  name = EXCLUDED.name,
                  pass = EXCLUDED.pass,
                  borderline = EXCLUDED.borderline,
                  counts_toward_score = EXCLUDED.counts_toward_score,
                  auto_fail = EXCLUDED.auto_fail,
                  sort_order = EXCLUDED.sort_order
                RETURNING *
                """,
                (
                    metric_id,
                    team_label,
                    name,
                    pass_points,
                    borderline_points,
                    counts_toward_score,
                    auto_fail,
                    sort_order,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return {
        "id": str(row["id"]),
        "team": team_slug(row.get("team")),
        "name": row.get("name") or "",
        "pass": float(row["pass"]) if row.get("pass") is not None else None,
        "borderline": float(row["borderline"]) if row.get("borderline") is not None else None,
        "countsTowardScore": bool(row.get("counts_toward_score")),
        "autoFail": bool(row.get("auto_fail")),
        "lockedNa": bool(row.get("locked_na")),
        "sortOrder": int(row.get("sort_order") or 0),
        "defaultValue": row.get("default_value") or "",
        "options": row.get("options"),
    }


def delete_team_metric(metric_id: str) -> bool:
    schema = schema_name()
    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {schema}.team_metrics WHERE id = %s",
                (metric_id,),
            )
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted


def list_monitoring(
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
        clauses.append("LOWER(COALESCE(status, '')) = LOWER(%s)")
        params.append(status)
    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append(
            "("
            "COALESCE(order_number, '') ILIKE %s OR "
            "COALESCE(agent_name, '') ILIKE %s OR "
            "COALESCE(comment, '') ILIKE %s OR "
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
                f"SELECT COUNT(*)::int AS n FROM {schema}.monitoring_items WHERE {where_sql}",
                params,
            )
            total = (cur.fetchone() or {}).get("n") or 0
            cur.execute(
                f"""
                SELECT *
                FROM {schema}.monitoring_items
                WHERE {where_sql}
                ORDER BY COALESCE(created_at, resolved_at) DESC NULLS LAST
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = []
            for row in cur.fetchall():
                raw_status = str(row.get("status") or "").strip().lower()
                mapped = "resolved" if raw_status == "resolved" else "active"
                created = _iso_dt(row.get("created_at")) or _iso_dt(row.get("resolved_at"))
                rows.append(
                    {
                        "id": str(row["id"]),
                        "order": row.get("order_number") or "",
                        "agentId": str(row.get("agent_id") or ""),
                        "agentName": row.get("agent_name") or row.get("display_name") or "",
                        "team": team_slug(row.get("team")) or "calls",
                        "comment": row.get("comment") or "",
                        "status": mapped,
                        "ack": bool(row.get("acknowledged_by_agent")),
                        "createdAt": created,
                        "resolvedAt": _iso_dt(row.get("resolved_at")) or None,
                    }
                )

    return {
        "connected": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": rows,
    }
