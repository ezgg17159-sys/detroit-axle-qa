import { useEffect, useMemo, useRef, useState } from "react";

import { DateRangePicker } from "../components/DateRangePicker";
import { defaultAnalyticsRange, type DateRange } from "../lib/dateRange";

type MetricFilter = "quality" | "quantity" | "combined";
type ChannelFilter = "calls" | "tickets" | "live-chat" | "sales";

type RankingRow = {
  rank: string;
  agentName: string;
  alias: string;
  quality: string;
  quantity: string;
  rsd: string;
  volume: string;
  combinedScore: string;
};

const metricOptions: Array<{ id: MetricFilter; label: string }> = [
  { id: "quality", label: "Quality" },
  { id: "quantity", label: "Quantity" },
  { id: "combined", label: "Combined" },
];

const channelOptions: Array<{ id: ChannelFilter; label: string }> = [
  { id: "calls", label: "Calls" },
  { id: "tickets", label: "Tickets" },
  { id: "live-chat", label: "Live Chat" },
  { id: "sales", label: "Sales" },
];

const PAGE_SIZE = 10;

const placeholderRows: RankingRow[] = Array.from({ length: 48 }, (_, index) => ({
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

type SortDir = "asc" | "desc";

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

  let result = 0;
  if (bothNumeric) {
    result = leftNum - rightNum;
  } else {
    result = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  }
  return dir === "asc" ? result : -result;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th scope="col">
      <button
        type="button"
        className={`data-table__sort${active ? ` is-${dir}` : ""}`}
        onClick={onClick}
        aria-label={`Sort by ${label}`}
      >
        <span className="data-table__sort-label">{label}</span>
        <span className="data-table__sort-icons" aria-hidden="true">
          <svg className="is-up" width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path d="M4 0.5L7.5 4.5H0.5L4 0.5Z" fill="currentColor" />
          </svg>
          <svg className="is-down" width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path d="M4 4.5L0.5 0.5H7.5L4 4.5Z" fill="currentColor" />
          </svg>
        </span>
      </button>
    </th>
  );
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
  const [channel, setChannel] = useState<ChannelFilter>("calls");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedRows = useMemo(
    () => [...placeholderRows].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [sortKey, sortDir],
  );

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const topThree = useMemo(() => placeholderRows.slice(0, 3), []);
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
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rank" || key === "agentName" || key === "alias" ? "asc" : "desc");
    }
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
            label="Channel"
            value={channel}
            options={channelOptions}
            onChange={(value) => {
              setChannel(value);
              setPage(1);
            }}
          />
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <section className="rankings-top" aria-label="Top 3 performers">
        {topThree.map((agent, index) => {
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
              key={`top-${place}`}
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
                {pageRows.map((row) => (
                  <tr key={`row-${row.rank}`}>
                    <td>{row.rank}</td>
                    <td>{row.agentName}</td>
                    <td>{row.alias}</td>
                    <td>{row.quality}</td>
                    <td>{row.rsd}</td>
                    <td>{row.volume}</td>
                    <td>{row.combinedScore}</td>
                  </tr>
                ))}
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
