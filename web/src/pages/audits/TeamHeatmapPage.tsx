import { useEffect, useMemo, useRef, useState } from "react";

import { DateRangePicker } from "../../components/DateRangePicker";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import { useScopedTeamFilter } from "../../hooks/useScopedTeamFilter";
import { TEAM_OPTIONS, type AuditRecord, type AuditTeam } from "../../lib/audits";
import { defaultAnalyticsRange, toIsoDate, type DateRange } from "../../lib/dateRange";
import { fetchAgents, fetchAudits } from "../../lib/externalApi";
import {
  applyDir,
  compareNumber,
  compareText,
  nextSortState,
} from "../../lib/tableSort";
import {
  HEATMAP_METRICS,
  buildHeatmapRows,
  formatHeatmapCell,
  heatmapTone,
  type HeatmapCell,
} from "../../lib/teamHeatmap";

const PAGE_SIZE = 30;

type SortKey = "agentName" | "avg";

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
  const labelId = `heatmap-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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
    <div className="audits-filter" ref={rootRef}>
      <span className="audits-filter__label" id={labelId}>
        {label}
      </span>
      <button
        type="button"
        className={`audits-filter__trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="audits-filter__value">{selected}</span>
        <svg className="audits-filter__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="audits-filter__menu" role="listbox" aria-labelledby={labelId}>
          {options.map((option) => {
            const isActive = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`audits-filter__option${isActive ? " is-active" : ""}`}
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

function HeatCell({ cell }: { cell: HeatmapCell }) {
  return (
    <span className={`team-heatmap__cell${heatmapTone(cell.pct)}`}>
      {formatHeatmapCell(cell)}
    </span>
  );
}

export function TeamHeatmapPage() {
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [search, setSearch] = useState("");
  const [team, setTeam, teamScope] = useScopedTeamFilter("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("agentName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [liveAudits, setLiveAudits] = useState<AuditRecord[] | null>(null);
  const [liveAgents, setLiveAgents] = useState<
    Array<{ id: string; name: string; alias: string; team: AuditTeam }> | null
  >(null);
  const [loadDetail, setLoadDetail] = useState("");
  const [loading, setLoading] = useState(true);
  useShellPageLoading(loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchAudits({
        start: toIsoDate(range.start) || undefined,
        end: toIsoDate(range.end) || undefined,
        team,
        limit: 2000,
      }),
      fetchAgents({ team }),
    ])
      .then(([auditsPayload, agentsPayload]) => {
        if (cancelled) return;
        if (auditsPayload.connected || agentsPayload.connected) {
          setLiveAudits(auditsPayload.audits);
          setLiveAgents(agentsPayload.agents);
          setLoadDetail(
            auditsPayload.connected && agentsPayload.connected
              ? ""
              : auditsPayload.detail || agentsPayload.detail || "",
          );
          return;
        }
        setLiveAudits(null);
        setLiveAgents(null);
        setLoadDetail(
          auditsPayload.detail ||
            agentsPayload.detail ||
            "External database disconnected. Showing local/mock heatmap.",
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLiveAudits(null);
        setLiveAgents(null);
        setLoadDetail(error instanceof Error ? error.message : "Unable to load heatmap.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, team]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buildHeatmapRows(range, {
      audits: liveAudits ?? undefined,
      agents: liveAgents ?? undefined,
      allowMock: false,
    }).filter((row) => {
      if (team !== "all" && row.team !== team) return false;
      if (!q) return true;
      return (
        row.agentName.toLowerCase().includes(q) ||
        row.alias.toLowerCase().includes(q)
      );
    });
  }, [range, search, team, liveAudits, liveAgents]);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "agentName":
          result = compareText(a.agentName, b.agentName);
          break;
        case "avg":
          result = compareNumber(a.avg.pct, b.avg.pct);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [rows, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, team, range.start, range.end]);

  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage],
  );
  const pageItems = useMemo(
    () => getPageItems(totalPages, currentPage),
    [totalPages, currentPage],
  );
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalRows);

  return (
    <main className="team-heatmap" aria-label="Team heatmap">
      <div className="audits-page__toolbar">
        <div className="audits-page__controls">
          <label className="audits-search">
            <span className="audits-search__label">Search</span>
            <span className="audits-search__field">
              <svg className="audits-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                className="audits-search__input"
                type="search"
                placeholder="Search agents…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>

          <FilterSelect
            label={teamScope.locked ? "Team" : "Filter by team"}
            value={team}
            options={
              teamScope.locked
                ? TEAM_OPTIONS.filter((option) => option.id === team)
                : [{ id: "all" as const, label: "All teams" }, ...TEAM_OPTIONS]
            }
            onChange={(value) => {
              if (teamScope.locked) return;
              setTeam(value);
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

      <section className="team-heatmap__table-wrap" aria-label="Team heatmap table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll team-heatmap__scroll">
            <table className="data-table team-heatmap__table">
              <thead>
                <tr>
                  <SortHeader
                    label="Agent name"
                    className="team-heatmap__sticky"
                    active={sortKey === "agentName"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "agentName", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Avg"
                    active={sortKey === "avg"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "avg", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  {HEATMAP_METRICS.map((metric) => (
                    <th scope="col" key={metric.id}>
                      <span className="data-table__th-static">{metric.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={2 + HEATMAP_METRICS.length} className="audits-table__empty">
                      No agents found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.agentId} className="audits-table__row">
                      <td className="team-heatmap__sticky team-heatmap__agent">
                        {row.agentName}
                      </td>
                      <td>
                        <HeatCell cell={row.avg} />
                      </td>
                      {HEATMAP_METRICS.map((metric) => (
                        <td key={metric.id}>
                          <HeatCell cell={row.metrics[metric.id]} />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="data-table-footer" aria-label="Table pagination">
            <span className="data-table-footer__meta">
              Showing {rangeStart}–{rangeEnd} of {totalRows} · {PAGE_SIZE} per page
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
