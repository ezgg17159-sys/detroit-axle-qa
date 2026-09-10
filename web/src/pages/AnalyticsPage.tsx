import { useState } from "react";

import {
  DepartmentDetailModal,
  type DepartmentDetails,
  type QualityTrend,
} from "../components/DepartmentDetailModal";
import { DateRangePicker } from "../components/DateRangePicker";
import { QualityTrendChart } from "../components/QualityTrendChart";
import { defaultAnalyticsRange, type DateRange } from "../lib/dateRange";

const miniCards = [
  { id: "total-audits", label: "Total Audits", value: "—" },
  { id: "avg-quality", label: "Avg Quality", value: "—" },
  { id: "released", label: "Released", value: "—" },
  { id: "calls-volume", label: "Calls Volume", value: "—" },
  { id: "tickets-volume", label: "Tickets Volume", value: "—" },
  { id: "sales-revenue", label: "Sales Revenue", value: "—" },
];

const bigCards: DepartmentDetails[] = [
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
  },
];

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

export function AnalyticsPage() {
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [selected, setSelected] = useState<DepartmentDetails | null>(null);

  return (
    <main className="analytics-page" aria-label="Analytics">
      <div className="analytics-page__toolbar">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <section className="analytics-page__body" aria-label="Analytics overview">
        <div className="analytics-mini-grid" role="list" aria-label="Key metrics">
          {miniCards.map((card) => (
            <article key={card.id} className="analytics-mini-card" role="listitem">
              <p className="analytics-mini-card__label">{card.label}</p>
              <p className="analytics-mini-card__value">{card.value}</p>
            </article>
          ))}
        </div>

        <div className="analytics-big-grid" role="list" aria-label="Overview panels">
          {bigCards.map((card) => (
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
                <QualityTrendChart />
              </div>
            </article>
          ))}
        </div>
      </section>

      <DepartmentDetailModal
        department={selected}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
