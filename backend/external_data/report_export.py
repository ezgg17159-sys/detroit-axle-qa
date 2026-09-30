"""Build QA report export payload shaped like QA_Report_Full_*.xlsx."""

from __future__ import annotations

from calendar import month_abbr
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from .db import external_connection, schema_name
from .queries import SLUG_TO_DB_TEAM


def _week_index(day: int) -> int:
    """Calendar week-of-month: 1–7 → 1, 8–14 → 2, 15–21 → 3, 22–28 → 4, 29–31 → 5."""
    if day <= 7:
        return 1
    if day <= 14:
        return 2
    if day <= 21:
        return 3
    if day <= 28:
        return 4
    return 5


def _week_span(week: int) -> str:
    return {1: "1-7", 2: "8-14", 3: "15-21", 4: "22-28", 5: "29-31"}[week]


def _week_key(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}-W{_week_index(value.day)}"


def _week_label(value: date) -> str:
    return f"{month_abbr[value.month].upper()} {_week_span(_week_index(value.day))}"


def _weeks_in_range(start: date, end: date) -> list[dict[str, str]]:
    """Unique week buckets (1-7 / 8-14 / …) covered by the date range."""
    weeks: list[dict[str, str]] = []
    seen: set[str] = set()
    cursor = start
    while cursor <= end:
        key = _week_key(cursor)
        if key not in seen:
            seen.add(key)
            weeks.append({"key": key, "label": _week_label(cursor)})
        cursor += timedelta(days=1)
    return weeks


def _month_key(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def _month_label(value: date) -> str:
    return month_abbr[value.month].upper()


def _months_in_range(start: date, end: date) -> list[dict[str, str]]:
    months: list[dict[str, str]] = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        months.append(
            {
                "key": f"{year:04d}-{month:02d}",
                "label": month_abbr[month].upper(),
            }
        )
        if month == 12:
            year += 1
            month = 1
        else:
            month += 1
    return months


def _normalize_period(period: str | None) -> str:
    raw = (period or "weeks").strip().lower()
    return "months" if raw in {"month", "months", "monthly"} else "weeks"


def _pct(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "-"
    return f"{value:.{digits}f}%"


def _num(value: float | int | None) -> str:
    if value is None:
        return "-"
    if isinstance(value, float) and not value.is_integer():
        return f"{value:.1f}"
    return str(int(round(float(value))))


def _trend_arrow(first: float | None, last: float | None) -> str:
    if first is None or last is None:
        return "→"
    delta = last - first
    if abs(delta) < 0.05:
        return "→"
    return "↑" if delta > 0 else "↓"


def _delta_pct(first: float | None, last: float | None) -> str:
    if first is None or last is None:
        return "0.0%"
    return f"{(last - first):.1f}%"


def _map_result(raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if text in {"pass", "passed", "yes"}:
        return "pass"
    if text in {"fail", "failed", "no"}:
        return "fail"
    if text in {"borderline", "border"}:
        return "borderline"
    return "n/a"


def _team_title(team: str) -> str:
    if team == "all":
        return "ALL TEAMS"
    return SLUG_TO_DB_TEAM.get(team, team).upper()


def _team_pretty(team: str) -> str:
    if team == "all":
        return "All Teams"
    return SLUG_TO_DB_TEAM.get(team, team)


def _range_label(start: date, end: date) -> str:
    return (
        f"{month_abbr[start.month].upper()} {start.day} – "
        f"{month_abbr[end.month].upper()} {end.day} {end.year}"
    )


def _avg(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _labeled_best_worst(
    weekly: dict[str, float | None],
    week_label_by_key: dict[str, str],
) -> tuple[str, str]:
    scored = [(key, value) for key, value in weekly.items() if value is not None]
    if not scored:
        return "-", "-"
    best_k = max(scored, key=lambda item: item[1])[0]
    worst_k = min(scored, key=lambda item: item[1])[0]
    return week_label_by_key.get(best_k, best_k), week_label_by_key.get(worst_k, worst_k)


def _empty_result_bucket() -> dict[str, int]:
    return {"pass": 0, "borderline": 0, "fail": 0, "total": 0}


def _build_criteria_block(
    crit_week: dict[str, dict[str, dict[str, int]]],
    crit_type: dict[str, str],
    *,
    week_keys: list[str],
    week_label_by_key: dict[str, str],
    team_pretty: str,
) -> dict[str, Any]:
    first_key = week_keys[0] if week_keys else ""
    last_key = week_keys[-1] if week_keys else ""
    criteria_rows: list[dict[str, Any]] = []
    overall_pass_rates: list[float] = []

    for metric, by_week in sorted(crit_week.items(), key=lambda item: item[0].lower()):
        totals = _empty_result_bucket()
        weekly_rates: dict[str, float | None] = {}
        for key in week_keys:
            bucket = by_week.get(key) or _empty_result_bucket()
            for field in totals:
                totals[field] += bucket[field]
            weekly_rates[key] = (
                (bucket["pass"] / bucket["total"]) * 100.0 if bucket["total"] else None
            )
        overall_rate = (totals["pass"] / totals["total"] * 100.0) if totals["total"] else None
        if overall_rate is not None:
            overall_pass_rates.append(overall_rate)
        first = weekly_rates.get(first_key)
        last = weekly_rates.get(last_key)
        criteria_rows.append(
            {
                "criterion": metric,
                "type": crit_type.get(metric, team_pretty),
                "passRate": _pct(overall_rate),
                "pass": totals["pass"],
                "border": totals["borderline"],
                "fail": totals["fail"],
                "total": totals["total"],
                "monthly": {
                    week_label_by_key[key]: _pct(weekly_rates[key]) for key in week_keys
                },
                "trend": _trend_arrow(first, last),
                "delta": _delta_pct(first, last),
                "_sortRate": overall_rate if overall_rate is not None else 999.0,
            }
        )

    weakest = "-"
    if criteria_rows:
        weakest_row = min(criteria_rows, key=lambda row: row["_sortRate"])
        if weakest_row["_sortRate"] < 999:
            weakest = weakest_row["criterion"]
    for row in criteria_rows:
        row.pop("_sortRate", None)

    return {
        "avgPassRate": _pct(_avg(overall_pass_rates)),
        "weakest": weakest,
        "rows": criteria_rows,
    }


def _build_case_types_block(
    case_week_counts: dict[str, dict[str, int]],
    case_week_scores: dict[str, dict[str, list[float]]],
    case_total_scores: dict[str, list[float]],
    *,
    week_keys: list[str],
    week_label_by_key: dict[str, str],
) -> dict[str, Any]:
    total_case_evals = sum(sum(counts.values()) for counts in case_week_counts.values()) or 1
    case_rows: list[dict[str, Any]] = []
    for case_name, counts in case_week_counts.items():
        total = sum(counts.values())
        scores = case_total_scores.get(case_name, [])
        overall = _avg(scores)
        weekly_score = {
            key: _avg(case_week_scores[case_name].get(key, [])) for key in week_keys
        }
        best_label = _labeled_best_worst(weekly_score, week_label_by_key)[0]
        if best_label == "-":
            vol_map = {key: float(counts.get(key, 0)) for key in week_keys}
            best_label = _labeled_best_worst(vol_map, week_label_by_key)[0]
        case_rows.append(
            {
                "caseType": case_name,
                "total": total,
                "share": _pct((total / total_case_evals) * 100.0),
                "avgScore": _pct(overall),
                "monthlyEvals": {
                    week_label_by_key[key]: counts.get(key, 0) for key in week_keys
                },
                "monthlyScore": {
                    week_label_by_key[key]: _pct(weekly_score[key]) for key in week_keys
                },
                "bestMonth": best_label,
                "_total": total,
            }
        )
    case_rows.sort(key=lambda row: (-row["_total"], row["caseType"].lower()))
    top_case = case_rows[0]["caseType"] if case_rows else "-"
    for row in case_rows:
        row.pop("_total", None)
    return {
        "count": len(case_rows),
        "top": top_case,
        "rows": case_rows,
    }


def fetch_report_export(
    *,
    start: date,
    end: date,
    team: str = "all",
    agent_ids: list[str] | None = None,
    period: str = "weeks",
) -> dict[str, Any]:
    schema = schema_name()
    agent_ids = [item for item in (agent_ids or []) if item]
    period_mode = _normalize_period(period)
    if period_mode == "months":
        periods = _months_in_range(start, end)
        period_key = _month_key
    else:
        periods = _weeks_in_range(start, end)
        period_key = _week_key
    week_keys = [item["key"] for item in periods]
    week_label_by_key = {item["key"]: item["label"] for item in periods}

    clauses = ["a.audit_date::date >= %s", "a.audit_date::date <= %s"]
    params: list[Any] = [start, end]

    if team and team != "all":
        clauses.append("LOWER(COALESCE(a.team, '')) = LOWER(%s)")
        params.append(SLUG_TO_DB_TEAM.get(team, team))

    if agent_ids:
        clauses.append("COALESCE(a.agent_id, '') IN %s")
        params.append(tuple(agent_ids))

    where_sql = " AND ".join(clauses)

    # Team baseline (full team in range — not limited to selected agents).
    team_clauses = ["a.audit_date::date >= %s", "a.audit_date::date <= %s"]
    team_params: list[Any] = [start, end]
    if team and team != "all":
        team_clauses.append("LOWER(COALESCE(a.team, '')) = LOWER(%s)")
        team_params.append(SLUG_TO_DB_TEAM.get(team, team))
    team_where_sql = " AND ".join(team_clauses)

    with external_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  a.agent_id,
                  COALESCE(NULLIF(p.display_name, ''), NULLIF(a.agent_name, ''), a.agent_id) AS agent_name,
                  COALESCE(a.agent_id, '') AS alias,
                  COALESCE(a.team, '') AS team,
                  COALESCE(a.case_type, '') AS case_type,
                  a.audit_date::date AS audit_day,
                  a.quality_score,
                  a.score_details
                FROM {schema}.audits a
                LEFT JOIN LATERAL (
                  SELECT p.display_name
                  FROM {schema}.profiles p
                  WHERE COALESCE(p.agent_id, '') = COALESCE(a.agent_id, '')
                    AND a.agent_id IS NOT NULL
                    AND a.agent_id <> ''
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
                    LENGTH(COALESCE(p.agent_name, '')) DESC,
                    p.created_at DESC NULLS LAST
                  LIMIT 1
                ) p ON TRUE
                WHERE {where_sql}
                ORDER BY a.audit_date ASC
                """,
                params,
            )
            audits = cur.fetchall()

            cur.execute(
                f"""
                SELECT
                  COALESCE(a.team, '') AS team,
                  a.audit_date::date AS audit_day,
                  a.quality_score
                FROM {schema}.audits a
                WHERE {team_where_sql}
                  AND a.quality_score IS NOT NULL
                """,
                team_params,
            )
            team_score_rows = cur.fetchall()

    team_all_scores: dict[str, list[float]] = defaultdict(list)
    team_week_scores: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in team_score_rows:
        team_raw = str(row.get("team") or "").strip() or "Unknown"
        day = row.get("audit_day")
        if not isinstance(day, date):
            continue
        try:
            score_f = float(row.get("quality_score"))
        except (TypeError, ValueError):
            continue
        team_all_scores[team_raw.lower()].append(score_f)
        team_week_scores[team_raw.lower()][period_key(day)].append(score_f)

    pooled_scores = [score for values in team_all_scores.values() for score in values]
    pooled_week: dict[str, list[float]] = defaultdict(list)
    for by_week in team_week_scores.values():
        for key, values in by_week.items():
            pooled_week[key].extend(values)

    agent_week_scores: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    agent_meta: dict[str, dict[str, str]] = {}
    volume_week: dict[str, int] = defaultdict(int)
    score_week: dict[str, list[float]] = defaultdict(list)
    agent_week_vol: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    crit_week: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(_empty_result_bucket)
    )
    crit_type: dict[str, str] = {}
    agent_crit_week: dict[str, dict[str, dict[str, dict[str, int]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(_empty_result_bucket))
    )
    agent_crit_type: dict[str, dict[str, str]] = defaultdict(dict)

    case_week_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    case_week_scores: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    case_total_scores: dict[str, list[float]] = defaultdict(list)
    agent_case_week_counts: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(int))
    )
    agent_case_week_scores: dict[str, dict[str, dict[str, list[float]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )
    agent_case_total_scores: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for row in audits:
        agent_id = str(row.get("agent_id") or "")
        name = str(row.get("agent_name") or agent_id or "—")
        alias = str(row.get("alias") or agent_id or "")
        team_raw = str(row.get("team") or "")
        day = row.get("audit_day")
        if not isinstance(day, date):
            continue
        wkey = period_key(day)
        volume_week[wkey] += 1

        if agent_id:
            agent_week_vol[agent_id][wkey] += 1
            agent_meta[agent_id] = {"name": name, "alias": alias, "team": team_raw}

        score_f: float | None = None
        score = row.get("quality_score")
        if score is not None:
            try:
                score_f = float(score)
            except (TypeError, ValueError):
                score_f = None

        if score_f is not None:
            score_week[wkey].append(score_f)
            if agent_id:
                agent_week_scores[agent_id][wkey].append(score_f)

        case_type = str(row.get("case_type") or "").strip() or "Unspecified"
        case_week_counts[case_type][wkey] += 1
        if score_f is not None:
            case_week_scores[case_type][wkey].append(score_f)
            case_total_scores[case_type].append(score_f)
        if agent_id:
            agent_case_week_counts[agent_id][case_type][wkey] += 1
            if score_f is not None:
                agent_case_week_scores[agent_id][case_type][wkey].append(score_f)
                agent_case_total_scores[agent_id][case_type].append(score_f)

        details = row.get("score_details")
        if not isinstance(details, list):
            continue
        type_label = team_raw or _team_pretty(team)
        for item in details:
            if not isinstance(item, dict):
                continue
            metric = str(item.get("metric") or "").strip()
            if not metric:
                continue
            result = _map_result(item.get("result"))
            if result == "n/a":
                continue
            bucket = crit_week[metric][wkey]
            bucket["total"] += 1
            if result == "pass":
                bucket["pass"] += 1
            elif result == "borderline":
                bucket["borderline"] += 1
            elif result == "fail":
                bucket["fail"] += 1
            crit_type[metric] = type_label

            if agent_id:
                agent_bucket = agent_crit_week[agent_id][metric][wkey]
                agent_bucket["total"] += 1
                if result == "pass":
                    agent_bucket["pass"] += 1
                elif result == "borderline":
                    agent_bucket["borderline"] += 1
                elif result == "fail":
                    agent_bucket["fail"] += 1
                agent_crit_type[agent_id][metric] = type_label

    all_scores = [score for values in score_week.values() for score in values]
    total_audits = len(audits)
    agents_evaluated = len({aid for aid in agent_meta if aid})
    avg_score = _avg(all_scores)

    weekly_avg = {key: _avg(score_week.get(key, [])) for key in week_keys}
    weekly_vol = {key: float(volume_week.get(key, 0)) for key in week_keys}
    first_key = week_keys[0] if week_keys else ""
    last_key = week_keys[-1] if week_keys else ""
    team_pretty = _team_pretty(team)
    if agent_ids:
        n = len(agent_ids)
        scope_pretty = f"{n} Selected Agent{'s' if n != 1 else ''}"
        scope_title = "SELECTED AGENTS"
    else:
        scope_pretty = team_pretty
        scope_title = _team_title(team)

    master_trend = [
        {
            "metric": f"{scope_pretty} — Avg Score",
            "values": {week_label_by_key[key]: _pct(weekly_avg[key]) for key in week_keys},
            "trend": _trend_arrow(weekly_avg.get(first_key), weekly_avg.get(last_key)),
            "bestMonth": _labeled_best_worst(weekly_avg, week_label_by_key)[0],
            "worstMonth": _labeled_best_worst(weekly_avg, week_label_by_key)[1],
        },
        {
            "metric": f"{scope_pretty} — Volume",
            "values": {week_label_by_key[key]: _num(weekly_vol[key]) for key in week_keys},
            "trend": _trend_arrow(weekly_vol.get(first_key), weekly_vol.get(last_key)),
            "bestMonth": _labeled_best_worst(weekly_vol, week_label_by_key)[0],
            "worstMonth": _labeled_best_worst(weekly_vol, week_label_by_key)[1],
        },
    ]

    def _team_avg_for(agent_team: str) -> float | None:
        key = (agent_team or "").strip().lower()
        if key and key in team_all_scores:
            return _avg(team_all_scores[key])
        return _avg(pooled_scores)

    def _team_week_avg_for(agent_team: str, wkey: str) -> float | None:
        key = (agent_team or "").strip().lower()
        if key and key in team_week_scores:
            return _avg(team_week_scores[key].get(wkey, []))
        return _avg(pooled_week.get(wkey, []))

    agents_out: list[dict[str, Any]] = []
    for agent_id, weeks_map in agent_week_scores.items():
        weekly_avgs = {key: _avg(weeks_map.get(key, [])) for key in week_keys}
        overall = _avg([value for value in weekly_avgs.values() if value is not None])
        first = weekly_avgs.get(first_key)
        last = weekly_avgs.get(last_key)
        meta = agent_meta.get(agent_id, {"name": agent_id, "alias": agent_id, "team": ""})
        team_avg = _team_avg_for(meta.get("team", ""))
        agents_out.append(
            {
                "name": meta["name"],
                "alias": meta["alias"],
                "team": meta.get("team", ""),
                "overallAvg": _pct(overall),
                "teamAvg": _pct(team_avg),
                "vsTeam": (
                    _delta_pct(team_avg, overall)
                    if overall is not None and team_avg is not None
                    else "-"
                ),
                "monthly": {
                    week_label_by_key[key]: _pct(weekly_avgs[key]) for key in week_keys
                },
                "teamWeekly": {
                    week_label_by_key[key]: _pct(
                        _team_week_avg_for(meta.get("team", ""), key)
                    )
                    for key in week_keys
                },
                "trend": _trend_arrow(first, last),
                "delta": _delta_pct(first, last),
                "bestMonth": _labeled_best_worst(weekly_avgs, week_label_by_key)[0],
            }
        )
    agents_out.sort(key=lambda row: row["name"].lower())

    criteria = _build_criteria_block(
        crit_week,
        crit_type,
        week_keys=week_keys,
        week_label_by_key=week_label_by_key,
        team_pretty=team_pretty,
    )
    case_types = _build_case_types_block(
        case_week_counts,
        case_week_scores,
        case_total_scores,
        week_keys=week_keys,
        week_label_by_key=week_label_by_key,
    )

    criteria_by_agent: list[dict[str, Any]] = []
    case_types_by_agent: list[dict[str, Any]] = []
    master_by_agent: list[dict[str, Any]] = []
    if agent_ids:
        ordered_agents = sorted(
            agent_meta.keys(),
            key=lambda aid: agent_meta.get(aid, {}).get("name", aid).lower(),
        )
        for agent_id in ordered_agents:
            meta = agent_meta.get(agent_id, {"name": agent_id, "alias": agent_id, "team": ""})
            agent_criteria = _build_criteria_block(
                agent_crit_week.get(agent_id, {}),
                agent_crit_type.get(agent_id, {}),
                week_keys=week_keys,
                week_label_by_key=week_label_by_key,
                team_pretty=team_pretty,
            )
            agent_cases = _build_case_types_block(
                agent_case_week_counts.get(agent_id, {}),
                agent_case_week_scores.get(agent_id, {}),
                agent_case_total_scores.get(agent_id, {}),
                week_keys=week_keys,
                week_label_by_key=week_label_by_key,
            )
            criteria_by_agent.append(
                {
                    "agentId": agent_id,
                    "name": meta["name"],
                    "alias": meta["alias"],
                    **agent_criteria,
                }
            )
            case_types_by_agent.append(
                {
                    "agentId": agent_id,
                    "name": meta["name"],
                    "alias": meta["alias"],
                    **agent_cases,
                }
            )

            agent_vol_map = {
                key: float(agent_week_vol.get(agent_id, {}).get(key, 0)) for key in week_keys
            }
            agent_avg_map = {
                key: _avg(agent_week_scores.get(agent_id, {}).get(key, [])) for key in week_keys
            }
            agent_all_scores = [
                score
                for values in agent_week_scores.get(agent_id, {}).values()
                for score in values
            ]
            agent_total = int(sum(agent_vol_map.values()))
            agent_name = meta["name"]
            team_avg = _team_avg_for(meta.get("team", ""))
            agent_avg = _avg(agent_all_scores)
            team_week_map = {
                key: _team_week_avg_for(meta.get("team", ""), key) for key in week_keys
            }
            master_by_agent.append(
                {
                    "agentId": agent_id,
                    "name": agent_name,
                    "alias": meta["alias"],
                    "team": meta.get("team", ""),
                    "totalAudits": agent_total,
                    "avgScore": _pct(agent_avg),
                    "teamAvg": _pct(team_avg),
                    "vsTeam": (
                        _delta_pct(team_avg, agent_avg)
                        if agent_avg is not None and team_avg is not None
                        else "-"
                    ),
                    "masterTrend": [
                        {
                            "metric": f"{agent_name} — Avg Score",
                            "values": {
                                week_label_by_key[key]: _pct(agent_avg_map[key])
                                for key in week_keys
                            },
                            "trend": _trend_arrow(
                                agent_avg_map.get(first_key), agent_avg_map.get(last_key)
                            ),
                            "bestMonth": _labeled_best_worst(
                                agent_avg_map, week_label_by_key
                            )[0],
                            "worstMonth": _labeled_best_worst(
                                agent_avg_map, week_label_by_key
                            )[1],
                        },
                        {
                            "metric": f"{agent_name} — Team Avg",
                            "values": {
                                week_label_by_key[key]: _pct(team_week_map[key])
                                for key in week_keys
                            },
                            "trend": _trend_arrow(
                                team_week_map.get(first_key), team_week_map.get(last_key)
                            ),
                            "bestMonth": _labeled_best_worst(
                                team_week_map, week_label_by_key
                            )[0],
                            "worstMonth": _labeled_best_worst(
                                team_week_map, week_label_by_key
                            )[1],
                        },
                        {
                            "metric": f"{agent_name} — Volume",
                            "values": {
                                week_label_by_key[key]: _num(agent_vol_map[key])
                                for key in week_keys
                            },
                            "trend": _trend_arrow(
                                agent_vol_map.get(first_key), agent_vol_map.get(last_key)
                            ),
                            "bestMonth": _labeled_best_worst(
                                agent_vol_map, week_label_by_key
                            )[0],
                            "worstMonth": _labeled_best_worst(
                                agent_vol_map, week_label_by_key
                            )[1],
                        },
                    ],
                }
            )

    quantity_rows: list[dict[str, Any]] = []
    ordered_quantity = sorted(
        agent_week_vol.keys(),
        key=lambda aid: agent_meta.get(aid, {}).get("name", aid).lower(),
    )
    for index, agent_id in enumerate(ordered_quantity, start=1):
        meta = agent_meta.get(agent_id, {"name": agent_id, "alias": agent_id})
        weekly = {
            week_label_by_key[key]: agent_week_vol[agent_id].get(key, 0) for key in week_keys
        }
        quantity_rows.append(
            {
                "index": index,
                "name": meta["name"],
                "agentId": meta["alias"] or agent_id,
                "monthly": weekly,
                "total": sum(weekly.values()),
            }
        )

    filter_note = (
        f"{len(agent_ids)} selected agent{'s' if len(agent_ids) != 1 else ''}"
        if agent_ids
        else "all agents in range"
    )
    if period_mode == "months":
        period_note = "Monthly columns"
        trend_label = "MONTHLY"
    else:
        period_note = "Weeks 1-7 / 8-14 / 15-21 / 22-28 / 29-31"
        trend_label = "WEEKLY"

    return {
        "connected": True,
        "meta": {
            "team": team,
            "teamLabel": scope_pretty,
            "teamTitle": scope_title,
            "rangeLabel": _range_label(start, end),
            "period": period_mode,
            "months": periods,
            "subtitle": (
                f"{scope_pretty} Quality Assurance Analysis  |  {_range_label(start, end)}"
                f"  |  {period_note}  |  {filter_note}"
            ),
            "agentFilter": agent_ids,
            "trendLabel": trend_label,
        },
        "summary": {
            "totalAudits": total_audits,
            "avgScore": _pct(avg_score),
            "agentsEvaluated": agents_evaluated,
        },
        "masterTrend": master_trend,
        "masterByAgent": master_by_agent,
        "agents": agents_out,
        "criteria": {
            **criteria,
            "byAgent": criteria_by_agent,
        },
        "caseTypes": {
            **case_types,
            "byAgent": case_types_by_agent,
        },
        "quantity": quantity_rows,
    }
