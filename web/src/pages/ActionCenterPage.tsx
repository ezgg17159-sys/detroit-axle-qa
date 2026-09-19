import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { DateRangePicker } from "../components/DateRangePicker";
import { useShellPageLoading } from "../components/PageLoadingContext";
import { defaultAnalyticsRange, toIsoDate, type DateRange } from "../lib/dateRange";
import { fetchActionCenter } from "../lib/externalApi";
import { getActiveTeamScope } from "../lib/teamScope";
import { navItems } from "../nav/config";

type QueueStatus = "urgent" | "watch" | "stable";

type StatusCounts = Record<QueueStatus, string>;

type QueueCard = {
  id: string;
  title: string;
  counts: StatusCounts;
  href: string;
};

const EMPTY_COUNTS: StatusCounts = {
  urgent: "—",
  watch: "—",
  stable: "—",
};

const DEFAULT_QUEUES: QueueCard[] = [
  {
    id: "supervisor-requests",
    title: "Supervisor Requests",
    counts: { ...EMPTY_COUNTS },
    href: "/requests-and-coaching/supervisor-requests",
  },
  {
    id: "open-feedback",
    title: "Open Feedback",
    counts: { ...EMPTY_COUNTS },
    href: "/monitoring-and-feedbacks/feedbacks",
  },
  {
    id: "active-monitoring",
    title: "Active Monitoring",
    counts: { ...EMPTY_COUNTS },
    href: "/monitoring-and-feedbacks/monitoring",
  },
  {
    id: "unreleased-audits",
    title: "Unreleased Audits",
    counts: { ...EMPTY_COUNTS },
    href: "/audits/audit-list",
  },
];

const DEFAULT_AGING = [
  { id: "requests-aging", label: "Requests aging 3+ days", count: "—" },
  { id: "feedback-overdue", label: "Feedback overdue", count: "—" },
  { id: "monitoring-aging", label: "Monitoring aging 2+ days", count: "—" },
  { id: "unreleased-audits", label: "Unreleased audits 2+ days", count: "—" },
];

const quickLinks = navItems
  .filter((item) => item.basePath !== "/overview")
  .flatMap((item) =>
    item.children.slice(0, 1).map((child) => ({
      id: item.basePath,
      label: item.label,
      to: child.to,
      hint: child.label,
    })),
  );

function StatusPill({
  status,
  value,
}: {
  status: QueueStatus;
  value: string;
}) {
  return (
    <div className={`action-status action-status--${status}`}>
      <span className="action-status__dot" aria-hidden="true" />
      <span className="action-status__label">{status}</span>
      <span className="action-status__value">{value}</span>
    </div>
  );
}

export function ActionCenterPage() {
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [health, setHealth] = useState<StatusCounts>({ ...EMPTY_COUNTS });
  const [queues, setQueues] = useState<QueueCard[]>(DEFAULT_QUEUES);
  const [agingRows, setAgingRows] = useState(DEFAULT_AGING);
  const [loadDetail, setLoadDetail] = useState("");
  const [loading, setLoading] = useState(true);
  useShellPageLoading(loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchActionCenter({
      start: toIsoDate(range.start) || undefined,
      end: toIsoDate(range.end) || undefined,
      team: getActiveTeamScope() || "all",
    })
      .then((payload) => {
        if (cancelled) return;
        if (payload.connected) {
          setHealth({
            urgent: payload.health.urgent ?? "0",
            watch: payload.health.watch ?? "0",
            stable: payload.health.stable ?? "0",
          });
          setQueues(
            payload.queues.length > 0
              ? payload.queues.map((queue) => ({
                  id: queue.id,
                  title: queue.title,
                  href: queue.href,
                  counts: {
                    urgent: queue.counts.urgent ?? "0",
                    watch: queue.counts.watch ?? "0",
                    stable: queue.counts.stable ?? "0",
                  },
                }))
              : DEFAULT_QUEUES,
          );
          setAgingRows(payload.aging.length > 0 ? payload.aging : DEFAULT_AGING);
          setLoadDetail("");
          return;
        }
        setHealth({ ...EMPTY_COUNTS });
        setQueues(DEFAULT_QUEUES);
        setAgingRows(DEFAULT_AGING);
        setLoadDetail(payload.detail || "External database disconnected.");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setHealth({ ...EMPTY_COUNTS });
        setQueues(DEFAULT_QUEUES);
        setAgingRows(DEFAULT_AGING);
        setLoadDetail(error instanceof Error ? error.message : "Unable to load action center.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  return (
    <main className="action-center" aria-label="Action Center">
      <div className="action-center__toolbar">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {loadDetail ? (
        <p className="audits-page__hint" role="status">
          {loadDetail}
        </p>
      ) : null}

      <section className="action-health" aria-label="Immediate action required">
        <div className="action-health__copy">
          <p className="action-health__kicker">Immediate action required</p>
          <h3 className="action-health__title">Prioritize urgent work first</h3>
        </div>
        <div className="action-health__pills">
          <StatusPill status="urgent" value={health.urgent} />
          <StatusPill status="watch" value={health.watch} />
          <StatusPill status="stable" value={health.stable} />
        </div>
      </section>

      <section className="action-queue-grid" aria-label="Action queues">
        {queues.map((card) => (
          <Link key={card.id} to={card.href} className="action-queue-card">
            <header className="action-queue-card__header">
              <h3 className="action-queue-card__title">{card.title}</h3>
              <span className="action-queue-card__cta">Open</span>
            </header>
            <div className="action-queue-card__statuses">
              <StatusPill status="urgent" value={card.counts.urgent} />
              <StatusPill status="watch" value={card.counts.watch} />
              <StatusPill status="stable" value={card.counts.stable} />
            </div>
          </Link>
        ))}
      </section>

      <div className="action-center__lower">
        <section className="action-aging" aria-label="Aging and overdue">
          <header className="action-section-head">
            <h3 className="action-section-head__title">Aging &amp; overdue</h3>
            <p className="action-section-head__subtitle">
              Items past SLA in the selected period
            </p>
          </header>
          <div className="action-aging__list">
            {agingRows.map((row) => (
              <div key={row.id} className="action-aging__row">
                <span className="action-aging__label">{row.label}</span>
                <span className="action-aging__count">{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="action-quicknav" aria-label="Quick navigation">
          <header className="action-section-head">
            <h3 className="action-section-head__title">Quick navigation</h3>
            <p className="action-section-head__subtitle">
              Jump into related workspaces
            </p>
          </header>
          <div className="action-quicknav__grid">
            {quickLinks.map((link) => (
              <Link key={link.id} to={link.to} className="action-quicknav__item">
                <span className="action-quicknav__label">{link.label}</span>
                <span className="action-quicknav__hint">{link.hint}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
