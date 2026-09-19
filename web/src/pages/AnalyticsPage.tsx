import { useEffect, useMemo, useState } from "react";

import {
  DepartmentDetailModal,
  type DepartmentDetails,
  type QualityTrend,
} from "../components/DepartmentDetailModal";
import { DateRangePicker } from "../components/DateRangePicker";
import { useShellPageLoading } from "../components/PageLoadingContext";
import { QualityTrendChart } from "../components/QualityTrendChart";
import {
  fetchAnalyticsOverview,
  type AnalyticsDepartment,
  type AnalyticsKpi,
} from "../lib/analytics";
import { defaultAnalyticsRange, type DateRange } from "../lib/dateRange";
import { getActiveTeamScope } from "../lib/teamScope";

const EMPTY_KPIS: AnalyticsKpi[] = [
  { id: "total-audits", label: "Total Audits", value: "—" },
  { id: "avg-quality", label: "Avg Quality", value: "—" },
  { id: "released", label: "Released", value: "—" },
  { id: "calls-volume", label: "Calls Volume", value: "—" },
  { id: "tickets-volume", label: "Tickets Volume", value: "—" },
  { id: "sales-revenue", label: "Sales Revenue", value: "—" },
];

const EMPTY_DEPTS: AnalyticsDepartment[] = [
  {
    id: "calls",
    title: "Calls",
    agents: "—",
    audits: "—",
    avgQuality: "—",
    avgQualityTrend: "flat",
    avgQualityVsPrev: "—",
    volume: "—",
    volumeTrend: "flat",
    volumeVsPrev: "—",
    targetGap: "—",
    qualityRange: "—",
    topPerformer: "—",
    trendPoints: [],
    trendLabels: [],
  },
  {
    id: "tickets",
    title: "Tickets",
    agents: "—",
    audits: "—",
    avgQuality: "—",
    avgQualityTrend: "flat",
    avgQualityVsPrev: "—",
    volume: "—",
    volumeTrend: "flat",
    volumeVsPrev: "—",
    targetGap: "—",
    qualityRange: "—",
    topPerformer: "—",
    trendPoints: [],
    trendLabels: [],
  },
  {
    id: "live-chat",
    title: "Live Chat",
    agents: "—",
    audits: "—",
    avgQuality: "—",
    avgQualityTrend: "flat",
    avgQualityVsPrev: "—",
    volume: "—",
    volumeTrend: "flat",
    volumeVsPrev: "—",
    targetGap: "—",
    qualityRange: "—",
    topPerformer: "—",
    trendPoints: [],
    trendLabels: [],
  },
  {
    id: "sales",
    title: "Sales",
    agents: "—",
    audits: "—",
    avgQuality: "—",
    avgQualityTrend: "flat",
    avgQualityVsPrev: "—",
    volume: "—",
    volumeTrend: "flat",
    volumeVsPrev: "—",
    targetGap: "—",
    qualityRange: "—",
    topPerformer: "—",
    trendPoints: [],
    trendLabels: [],
  },
];

function kpiTemplateForScope(scope: string | null): AnalyticsKpi[] {
  if (!scope) return EMPTY_KPIS;
  const base = EMPTY_KPIS.filter((kpi) =>
    ["total-audits", "avg-quality", "released"].includes(kpi.id),
  );
  if (scope === "calls") {
    return [...base, EMPTY_KPIS.find((k) => k.id === "calls-volume")!];
  }
  if (scope === "tickets") {
    return [...base, EMPTY_KPIS.find((k) => k.id === "tickets-volume")!];
  }
  if (scope === "sales") {
    return [...base, EMPTY_KPIS.find((k) => k.id === "sales-revenue")!];
  }
  return base;
}

function deptTemplateForScope(scope: string | null): AnalyticsDepartment[] {
  if (!scope) return EMPTY_DEPTS;
  return EMPTY_DEPTS.filter((dept) => dept.id === scope);
}

function TrendArrow({ trend }: { trend: QualityTrend }) {
  if (trend === "flat") {
    return (
      <svg className="analytics-trend-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  const up = trend === "up";
  return (
    <svg
      className="analytics-trend-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d={up ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M19 12l-7 7-7-7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function mergeKpis(live: AnalyticsKpi[], scope: string | null): AnalyticsKpi[] {
  const template = kpiTemplateForScope(scope);
  if (live.length === 0) return template;
  const byId = new Map(live.map((row) => [row.id, row]));
  return template.map((fallback) => byId.get(fallback.id) ?? fallback);
}

function mergeDepartments(
  live: AnalyticsDepartment[],
  scope: string | null,
): AnalyticsDepartment[] {
  const template = deptTemplateForScope(scope);
  if (live.length === 0) return template;
  const byId = new Map(live.map((row) => [row.id, row]));
  return template.map((fallback) => {
    const row = byId.get(fallback.id);
    if (!row) return fallback;
    return {
      ...fallback,
      ...row,
      trendPoints: row.trendPoints ?? [],
      trendLabels: row.trendLabels ?? [],
    };
  });
}

export function AnalyticsPage() {
  const teamScope = getActiveTeamScope();
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [selected, setSelected] = useState<DepartmentDetails | null>(null);
  const [kpis, setKpis] = useState<AnalyticsKpi[]>(() => kpiTemplateForScope(teamScope));
  const [departments, setDepartments] = useState<AnalyticsDepartment[]>(() =>
    deptTemplateForScope(teamScope),
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [detail, setDetail] = useState("");
  useShellPageLoading(status === "loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    fetchAnalyticsOverview(range)
      .then((payload) => {
        if (cancelled) return;
        setKpis(mergeKpis(payload.kpis, teamScope));
        setDepartments(mergeDepartments(payload.departments, teamScope));
        setDetail(payload.connected ? "" : payload.detail || "External database disconnected.");
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setKpis(kpiTemplateForScope(teamScope));
        setDepartments(deptTemplateForScope(teamScope));
        setDetail(error instanceof Error ? error.message : "Unable to load analytics.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, teamScope]);

  const selectedLive = useMemo(() => {
    if (!selected) return null;
    return departments.find((row) => row.id === selected.id) ?? selected;
  }, [selected, departments]);

  return (
    <main className="analytics-page" aria-label="Analytics">
      <div className="analytics-page__toolbar">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {detail ? (
        <p className="analytics-page__status" role="status">
          {detail}
        </p>
      ) : null}

      <section className="analytics-page__body" aria-label="Analytics overview">
        <div className="analytics-mini-grid" role="list" aria-label="Key metrics">
          {kpis.map((card) => (
            <article key={card.id} className="analytics-mini-card" role="listitem">
              <p className="analytics-mini-card__label">{card.label}</p>
              <p className="analytics-mini-card__value">{card.value}</p>
            </article>
          ))}
        </div>

        <div className="analytics-big-grid" role="list" aria-label="Overview panels">
          {departments.map((card) => (
            <article
              key={card.id}
              className="analytics-big-card analytics-big-card--clickable"
              role="button"
              tabIndex={0}
              aria-label={`Open ${card.title} details`}
              onClick={() => setSelected(card)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(card);
                }
              }}
            >
              <header className="analytics-big-card__header">
                <h2 className="analytics-big-card__title">
                  {card.title}{" "}
                  <span className="analytics-big-card__meta">
                    ({card.audits} Audits - {card.agents} Agents)
                  </span>
                </h2>
                <p
                  className={`analytics-big-card__quality analytics-big-card__quality--${card.avgQualityTrend}`}
                >
                  <span>Avg Quality - {card.avgQuality}%</span>
                  <TrendArrow trend={card.avgQualityTrend} />
                </p>
              </header>
              <p className="analytics-big-card__performer">
                Top Performer{" "}
                <span className="analytics-big-card__performer-name">
                  ({card.topPerformer})
                </span>
              </p>
              <div className="analytics-big-card__body">
                <QualityTrendChart points={card.trendPoints} labels={card.trendLabels} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <DepartmentDetailModal
        department={selectedLive}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
