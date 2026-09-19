import { useEffect, useMemo, useRef, useState } from "react";

import { DateRangePicker } from "../components/DateRangePicker";
import { useShellPageLoading } from "../components/PageLoadingContext";
import { SortHeader, type SortDir } from "../components/table/SortHeader";
import { useScopedTeamFilter } from "../hooks/useScopedTeamFilter";
import { defaultAnalyticsRange, toIsoDate, type DateRange } from "../lib/dateRange";
import { fetchRankings, type RankingRow } from "../lib/externalApi";
import { applyDir, compareText, nextSortState } from "../lib/tableSort";
import { TEAM_OPTIONS } from "../lib/audits";

type MetricFilter = "quality" | "quantity" | "combined";
type ChannelFilter = "calls" | "tickets" | "live-chat" | "sales";

const metricOptions: Array<{ id: MetricFilter; label: string }> = [
  { id: "quality", label: "Quality" },
  { id: "quantity", label: "Quantity" },
  { id: "combined", label: "Combined" },
];

const channelOptions: Array<{ id: ChannelFilter; label: string }> = TEAM_OPTIONS.map(
  (option) => ({ id: option.id, label: option.label }),
);

const PAGE_SIZE = 12;

const placeholderRows: RankingRow[] = Array.from({ length: 3 }, (_, index) => ({
  rank: String(index + 1),
  agentName: "—",
  alias: "—",
  quality: "—",
  quantity: "—",
  rsd: "—",
  volume: "—",
  combinedScore: "—",
}));

type SortKey =
  | "rank"
  | "agentName"
  | "alias"
  | "quality"
  | "rsd"
  | "volume"
  | "combinedScore";

const tableColumns: Array<{ key: SortKey; label: string }> = [
  { key: "rank", label: "Rank" },
  { key: "agentName", label: "Agent name" },
  { key: "alias", label: "Alias" },
  { key: "quality", label: "Quality" },
  { key: "rsd", label: "RSD" },
  { key: "volume", label: "Volume" },
  { key: "combinedScore", label: "Combined score" },
];

function compareRows(a: RankingRow, b: RankingRow, key: SortKey, dir: SortDir): number {
  const left = a[key];
  const right = b[key];
  const leftNum = Number(left);
  const rightNum = Number(right);
  const bothNumeric =
    left !== "—" &&
    right !== "—" &&
    !Number.isNaN(leftNum) &&
    !Number.isNaN(rightNum) &&
    left.trim() !== "" &&
    right.trim() !== "";

  const result = bothNumeric ? leftNum - rightNum : compareText(left, right);
  return applyDir(result, dir);
}

function getPageItems(totalPages: number, current: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);

  if (start > 2) items.push("ellipsis");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value)?.label ?? value;
  const labelId = `rankings-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="rankings-filter" ref={rootRef}>
      <span className="rankings-filter__label" id={labelId}>
        {label}
      </span>
      <button
        type="button"
        className={`rankings-filter__trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="rankings-filter__value">{selected}</span>
        <svg
          className="rankings-filter__chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <polyline
            points="6 9 12 15 18 9"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="rankings-filter__menu" role="listbox" aria-labelledby={labelId}>
          {options.map((option) => {
            const isActive = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`rankings-filter__option${isActive ? " is-active" : ""}`}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function RankingsPage() {
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [metric, setMetric] = useState<MetricFilter>("quality");
  const [channel, setChannel, teamScope] = useScopedTeamFilter("calls");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loadDetail, setLoadDetail] = useState("");
  const [loading, setLoading] = useState(true);
  useShellPageLoading(loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchRankings({
      start: toIsoDate(range.start) || undefined,
      end: toIsoDate(range.end) || undefined,
      team: channel === "all" ? "calls" : channel,
      metric,
    })
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.rows);
        setLoadDetail(
          payload.connected
            ? payload.rows.length === 0
              ? "No ranking data for this range."
              : ""
            : payload.detail || "External database disconnected.",
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRows([]);
        setLoadDetail(error instanceof Error ? error.message : "Unable to load rankings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, channel, metric]);

  useEffect(() => {
    setPage(1);
  }, [range.start, range.end, channel, metric]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [rows, sortKey, sortDir],
  );

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const topThree = useMemo(() => rows.slice(0, 3), [rows]);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [currentPage, sortedRows]);

  const pageItems = useMemo(
    () => getPageItems(totalPages, currentPage),
    [totalPages, currentPage],
  );

  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalRows);

  const metricLabel =
    metric === "quality" ? "Avg Quality" : metric === "quantity" ? "Avg Quantity" : "Combined";

  const toggleSort = (key: SortKey) => {
    const preferred: SortDir =
      key === "rank" || key === "agentName" || key === "alias" ? "asc" : "desc";
    const next = nextSortState(sortKey, sortDir, key, preferred);
    setSortKey(next.key);
    setSortDir(next.dir);
    setPage(1);
  };
  return (
    <main className="rankings-page" aria-label="Rankings">
      <div className="rankings-page__toolbar">
        <div className="rankings-page__filters">
          <FilterSelect
            label="Metric"
            value={metric}
            options={metricOptions}
            onChange={(value) => {
              setMetric(value);
              setPage(1);
            }}
          />
          <FilterSelect
            label={teamScope.locked ? "Channel" : "Channel"}
            value={channel === "all" ? "calls" : channel}
            options={
              teamScope.locked && teamScope.scope
                ? channelOptions.filter((option) => option.id === teamScope.scope)
                : channelOptions
            }
            onChange={(value) => {
              if (teamScope.locked) return;
              setChannel(value);
              setPage(1);
            }}
          />
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {loadDetail ? (
        <p className="audits-page__hint" role="status">
          {loadDetail}
        </p>
      ) : null}

      <section className="rankings-top" aria-label="Top 3 performers">
        {(topThree.length > 0 ? topThree : placeholderRows.slice(0, 3)).map((agent, index) => {
          const place = index + 1;
          const metricValue =
            metric === "quantity"
              ? agent.quantity
              : metric === "combined"
                ? agent.combinedScore
                : agent.quality;
          const metricSuffix = metric === "quality" ? "%" : "";

          return (
            <article
              key={`top-${place}-${agent.agentName}`}
              className={`rankings-podium rankings-podium--${place}`}
            >
              <div className="rankings-podium__header">
                <h3 className="rankings-podium__title">
                  <span className="rankings-podium__place">#{agent.rank}</span>
                  <span className="rankings-podium__sep" aria-hidden="true">
                    {" "}
                    -{" "}
                  </span>
                  <span className="rankings-podium__name">{agent.agentName}</span>
                </h3>
                {place === 1 ? (
                  <span className="rankings-podium__badge">Top performer</span>
                ) : null}
              </div>
              <div className="rankings-podium__footer">
                <div className="rankings-podium__stat">
                  <span className="rankings-podium__stat-label">{metricLabel}</span>
                  <span className="rankings-podium__stat-value">
                    {metricValue}
                    {metricSuffix}
                  </span>
                </div>
                <div className="rankings-podium__divider" aria-hidden="true" />
                <div className="rankings-podium__stat">
                  <span className="rankings-podium__stat-label">Volume</span>
                  <span className="rankings-podium__stat-value">{agent.volume}</span>
                </div>
                <div className="rankings-podium__divider" aria-hidden="true" />
                <div className="rankings-podium__stat">
                  <span className="rankings-podium__stat-label">RSD</span>
                  <span className="rankings-podium__stat-value">{agent.rsd}</span>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rankings-table-wrap" aria-label="Rankings table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {tableColumns.map((column) => (
                    <SortHeader
                      key={column.key}
                      label={column.label}
                      active={sortKey === column.key}
                      dir={sortDir}
                      onClick={() => toggleSort(column.key)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="audits-table__empty">
                      No ranking rows for the selected filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={`row-${row.rank}-${row.agentName}`}>
                      <td>{row.rank}</td>
                      <td>{row.agentName}</td>
                      <td>{row.alias}</td>
                      <td>{row.quality}</td>
                      <td>{row.rsd}</td>
                      <td>{row.volume}</td>
                      <td>{row.combinedScore}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="data-table-footer" aria-label="Table pagination">
            <span className="data-table-footer__meta">
              Showing {rangeStart}–{rangeEnd} of {totalRows}
            </span>
            <nav className="data-table-pager" aria-label="Pages">
              <button
                type="button"
                className="data-table-pager__btn"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                ‹
              </button>
              {pageItems.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="data-table-pager__ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={`data-table-pager__btn${item === currentPage ? " is-active" : ""}`}
                    aria-label={`Page ${item}`}
                    aria-current={item === currentPage ? "page" : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                className="data-table-pager__btn"
                aria-label="Next page"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                ›
              </button>
            </nav>
          </footer>
        </div>
      </section>
    </main>
  );
}
