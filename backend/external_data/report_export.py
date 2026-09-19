"""Build QA report export payload shaped like QA_Report_Full_*.xlsx."""

from __future__ import annotations

from calendar import month_abbr
from collections import defaultdict
from datetime import date
from typing import Any

from .db import external_connection, schema_name
from .queries import SLUG_TO_DB_TEAM


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
    return f"{_month_label(start)} – {_month_label(end)} {end.year}"


def _avg(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _labeled_best_worst(
    monthly: dict[str, float | None],
    month_label_by_key: dict[str, str],
) -> tuple[str, str]:
    scored = [(key, value) for key, value in monthly.items() if value is not None]
    if not scored:
        return "-", "-"
    best_k = max(scored, key=lambda item: item[1])[0]
    worst_k = min(scored, key=lambda item: item[1])[0]
    return month_label_by_key.get(best_k, best_k), month_label_by_key.get(worst_k, worst_k)


def _empty_result_bucket() -> dict[str, int]:
    return {"pass": 0, "borderline": 0, "fail": 0, "total": 0}


def _build_criteria_block(
    crit_month: dict[str, dict[str, dict[str, int]]],
    crit_type: dict[str, str],
    *,
    month_keys: list[str],
    month_label_by_key: dict[str, str],
    team_pretty: str,
) -> dict[str, Any]:
    first_key = month_keys[0] if month_keys else ""
    last_key = month_keys[-1] if month_keys else ""
    criteria_rows: list[dict[str, Any]] = []
    overall_pass_rates: list[float] = []

    for metric, by_month in sorted(crit_month.items(), key=lambda item: item[0].lower()):
        totals = _empty_result_bucket()
        monthly_rates: dict[str, float | None] = {}
        for key in month_keys:
            bucket = by_month.get(key) or _empty_result_bucket()
            for field in totals:
                totals[field] += bucket[field]
            monthly_rates[key] = (
                (bucket["pass"] / bucket["total"]) * 100.0 if bucket["total"] else None
            )
        overall_rate = (totals["pass"] / totals["total"] * 100.0) if totals["total"] else None
        if overall_rate is not None:
            overall_pass_rates.append(overall_rate)
        first = monthly_rates.get(first_key)
        last = monthly_rates.get(last_key)
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
                    month_label_by_key[key]: _pct(monthly_rates[key]) for key in month_keys
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
    case_month_counts: dict[str, dict[str, int]],
    case_month_scores: dict[str, dict[str, list[float]]],
    case_total_scores: dict[str, list[float]],
    *,
    month_keys: list[str],
    month_label_by_key: dict[str, str],
) -> dict[str, Any]:
    total_case_evals = sum(sum(counts.values()) for counts in case_month_counts.values()) or 1
    case_rows: list[dict[str, Any]] = []
    for case_name, counts in case_month_counts.items():
        total = sum(counts.values())
        scores = case_total_scores.get(case_name, [])
        overall = _avg(scores)
        monthly_score = {
            key: _avg(case_month_scores[case_name].get(key, [])) for key in month_keys
        }
        best_label = _labeled_best_worst(monthly_score, month_label_by_key)[0]
        if best_label == "-":
            vol_map = {key: float(counts.get(key, 0)) for key in month_keys}
            best_label = _labeled_best_worst(vol_map, month_label_by_key)[0]
        case_rows.append(
            {
                "caseType": case_name,
                "total": total,
                "share": _pct((total / total_case_evals) * 100.0),
                "avgScore": _pct(overall),
                "monthlyEvals": {
                    month_label_by_key[key]: counts.get(key, 0) for key in month_keys
                },
                "monthlyScore": {
                    month_label_by_key[key]: _pct(monthly_score[key]) for key in month_keys
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
) -> dict[str, Any]:
    schema = schema_name()
    agent_ids = [item for item in (agent_ids or []) if item]
    months = _months_in_range(start, end)
    month_keys = [item["key"] for item in months]
    month_label_by_key = {item["key"]: item["label"] for item in months}

    clauses = ["a.audit_date::date >= %s", "a.audit_date::date <= %s"]
    params: list[Any] = [start, end]

    if team and team != "all":
        clauses.append("LOWER(COALESCE(a.team, '')) = LOWER(%s)")
        params.append(SLUG_TO_DB_TEAM.get(team, team))

    if agent_ids:
        clauses.append("COALESCE(a.agent_id, '') IN %s")
        params.append(tuple(agent_ids))

    where_sql = " AND ".join(clauses)

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

    agent_month_scores: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    agent_meta: dict[str, dict[str, str]] = {}
    volume_month: dict[str, int] = defaultdict(int)
    score_month: dict[str, list[float]] = defaultdict(list)
    agent_month_vol: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    crit_month: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(_empty_result_bucket)
    )
    crit_type: dict[str, str] = {}
    agent_crit_month: dict[str, dict[str, dict[str, dict[str, int]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(_empty_result_bucket))
    )
    agent_crit_type: dict[str, dict[str, str]] = defaultdict(dict)

    case_month_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    case_month_scores: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    case_total_scores: dict[str, list[float]] = defaultdict(list)
    agent_case_month_counts: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(int))
    )
    agent_case_month_scores: dict[str, dict[str, dict[str, list[float]]]] = defaultdict(
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
        mkey = _month_key(day)
        volume_month[mkey] += 1

        if agent_id:
            agent_month_vol[agent_id][mkey] += 1
            agent_meta[agent_id] = {"name": name, "alias": alias, "team": team_raw}

        score_f: float | None = None
        score = row.get("quality_score")
        if score is not None:
            try:
                score_f = float(score)
            except (TypeError, ValueError):
                score_f = None

        if score_f is not None:
            score_month[mkey].append(score_f)
            if agent_id:
                agent_month_scores[agent_id][mkey].append(score_f)

        case_type = str(row.get("case_type") or "").strip() or "Unspecified"
        case_month_counts[case_type][mkey] += 1
        if score_f is not None:
            case_month_scores[case_type][mkey].append(score_f)
            case_total_scores[case_type].append(score_f)
        if agent_id:
            agent_case_month_counts[agent_id][case_type][mkey] += 1
            if score_f is not None:
                agent_case_month_scores[agent_id][case_type][mkey].append(score_f)
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
            bucket = crit_month[metric][mkey]
            bucket["total"] += 1
            if result == "pass":
                bucket["pass"] += 1
            elif result == "borderline":
                bucket["borderline"] += 1
            elif result == "fail":
                bucket["fail"] += 1
            crit_type[metric] = type_label

            if agent_id:
                agent_bucket = agent_crit_month[agent_id][metric][mkey]
                agent_bucket["total"] += 1
                if result == "pass":
                    agent_bucket["pass"] += 1
                elif result == "borderline":
                    agent_bucket["borderline"] += 1
                elif result == "fail":
                    agent_bucket["fail"] += 1
                agent_crit_type[agent_id][metric] = type_label

    all_scores = [score for values in score_month.values() for score in values]
    total_audits = len(audits)
    agents_evaluated = len({aid for aid in agent_meta if aid})
    avg_score = _avg(all_scores)

    monthly_avg = {key: _avg(score_month.get(key, [])) for key in month_keys}
    monthly_vol = {key: float(volume_month.get(key, 0)) for key in month_keys}
    first_key = month_keys[0] if month_keys else ""
    last_key = month_keys[-1] if month_keys else ""
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
            "values": {month_label_by_key[key]: _pct(monthly_avg[key]) for key in month_keys},
            "trend": _trend_arrow(monthly_avg.get(first_key), monthly_avg.get(last_key)),
            "bestMonth": _labeled_best_worst(monthly_avg, month_label_by_key)[0],
            "worstMonth": _labeled_best_worst(monthly_avg, month_label_by_key)[1],
        },
        {
            "metric": f"{scope_pretty} — Volume",
            "values": {month_label_by_key[key]: _num(monthly_vol[key]) for key in month_keys},
            "trend": _trend_arrow(monthly_vol.get(first_key), monthly_vol.get(last_key)),
            "bestMonth": _labeled_best_worst(monthly_vol, month_label_by_key)[0],
            "worstMonth": _labeled_best_worst(monthly_vol, month_label_by_key)[1],
        },
    ]

    agents_out: list[dict[str, Any]] = []
    for agent_id, months_map in agent_month_scores.items():
        monthly_avgs = {key: _avg(months_map.get(key, [])) for key in month_keys}
        overall = _avg([value for value in monthly_avgs.values() if value is not None])
        first = monthly_avgs.get(first_key)
        last = monthly_avgs.get(last_key)
        meta = agent_meta.get(agent_id, {"name": agent_id, "alias": agent_id})
        agents_out.append(
            {
                "name": meta["name"],
                "alias": meta["alias"],
                "overallAvg": _pct(overall),
                "monthly": {
                    month_label_by_key[key]: _pct(monthly_avgs[key]) for key in month_keys
                },
                "trend": _trend_arrow(first, last),
                "delta": _delta_pct(first, last),
                "bestMonth": _labeled_best_worst(monthly_avgs, month_label_by_key)[0],
            }
        )
    agents_out.sort(key=lambda row: row["name"].lower())

    criteria = _build_criteria_block(
        crit_month,
        crit_type,
        month_keys=month_keys,
        month_label_by_key=month_label_by_key,
        team_pretty=team_pretty,
    )
    case_types = _build_case_types_block(
        case_month_counts,
        case_month_scores,
        case_total_scores,
        month_keys=month_keys,
        month_label_by_key=month_label_by_key,
    )

    # When specific agents are filtered, break sheets out per agent.
    criteria_by_agent: list[dict[str, Any]] = []
    case_types_by_agent: list[dict[str, Any]] = []
    master_by_agent: list[dict[str, Any]] = []
    if agent_ids:
        ordered_agents = sorted(
            agent_meta.keys(),
            key=lambda aid: agent_meta.get(aid, {}).get("name", aid).lower(),
        )
        for agent_id in ordered_agents:
            meta = agent_meta.get(agent_id, {"name": agent_id, "alias": agent_id})
            agent_criteria = _build_criteria_block(
                agent_crit_month.get(agent_id, {}),
                agent_crit_type.get(agent_id, {}),
                month_keys=month_keys,
                month_label_by_key=month_label_by_key,
                team_pretty=team_pretty,
            )
            agent_cases = _build_case_types_block(
                agent_case_month_counts.get(agent_id, {}),
                agent_case_month_scores.get(agent_id, {}),
                agent_case_total_scores.get(agent_id, {}),
                month_keys=month_keys,
                month_label_by_key=month_label_by_key,
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
                key: float(agent_month_vol.get(agent_id, {}).get(key, 0)) for key in month_keys
            }
            agent_avg_map = {
                key: _avg(agent_month_scores.get(agent_id, {}).get(key, [])) for key in month_keys
            }
            agent_all_scores = [
                score
                for values in agent_month_scores.get(agent_id, {}).values()
                for score in values
            ]
            agent_total = int(sum(agent_vol_map.values()))
            agent_name = meta["name"]
            master_by_agent.append(
                {
                    "agentId": agent_id,
                    "name": agent_name,
                    "alias": meta["alias"],
                    "totalAudits": agent_total,
                    "avgScore": _pct(_avg(agent_all_scores)),
                    "masterTrend": [
                        {
                            "metric": f"{agent_name} — Avg Score",
                            "values": {
                                month_label_by_key[key]: _pct(agent_avg_map[key])
                                for key in month_keys
                            },
                            "trend": _trend_arrow(
                                agent_avg_map.get(first_key), agent_avg_map.get(last_key)
                            ),
                            "bestMonth": _labeled_best_worst(
                                agent_avg_map, month_label_by_key
                            )[0],
                            "worstMonth": _labeled_best_worst(
                                agent_avg_map, month_label_by_key
                            )[1],
                        },
                        {
                            "metric": f"{agent_name} — Volume",
                            "values": {
                                month_label_by_key[key]: _num(agent_vol_map[key])
                                for key in month_keys
                            },
                            "trend": _trend_arrow(
                                agent_vol_map.get(first_key), agent_vol_map.get(last_key)
                            ),
                            "bestMonth": _labeled_best_worst(
                                agent_vol_map, month_label_by_key
                            )[0],
                            "worstMonth": _labeled_best_worst(
                                agent_vol_map, month_label_by_key
                            )[1],
                        },
                    ],
                }
            )

    quantity_rows: list[dict[str, Any]] = []
    ordered_quantity = sorted(
        agent_month_vol.keys(),
        key=lambda aid: agent_meta.get(aid, {}).get("name", aid).lower(),
    )
    for index, agent_id in enumerate(ordered_quantity, start=1):
        meta = agent_meta.get(agent_id, {"name": agent_id, "alias": agent_id})
        monthly = {
            month_label_by_key[key]: agent_month_vol[agent_id].get(key, 0) for key in month_keys
        }
        quantity_rows.append(
            {
                "index": index,
                "name": meta["name"],
                "agentId": meta["alias"] or agent_id,
                "monthly": monthly,
                "total": sum(monthly.values()),
            }
        )

    filter_note = (
        f"{len(agent_ids)} selected agent{'s' if len(agent_ids) != 1 else ''}"
        if agent_ids
        else "all agents in range"
    )

    return {
        "connected": True,
        "meta": {
            "team": team,
            "teamLabel": scope_pretty,
            "teamTitle": scope_title,
            "rangeLabel": _range_label(start, end),
            "months": months,
            "subtitle": (
                f"{scope_pretty} Quality Assurance Analysis  |  {_range_label(start, end)}"
                f"  |  {filter_note}"
            ),
            "agentFilter": agent_ids,
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
