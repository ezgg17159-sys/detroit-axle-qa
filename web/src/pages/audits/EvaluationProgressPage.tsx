import { useEffect, useMemo, useRef, useState } from "react";

import { DateRangePicker } from "../../components/DateRangePicker";
import { TEAM_OPTIONS, formatAuditDate, type AuditTeam } from "../../lib/audits";
import {
  averageInRange,
  buildAvgEmailPayload,
  daysInMonth,
  emailPeriodLabel,
  formatAvgLabel,
  isDayOff,
  isoDate,
  latestAuditDate,
  listProgressAgents,
  monthFromRange,
  queueAvgEmail,
  scoreForDay,
  toggleDayOff,
  type EmailAvgPeriod,
  type ProgressAgent,
} from "../../lib/evaluationProgress";
import { defaultAnalyticsRange, type DateRange } from "../../lib/dateRange";
import { useNotify } from "../../notifications/NotificationContext";

const PAGE_SIZE = 30;

type TeamFilter = "all" | AuditTeam;

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
  const labelId = `eval-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

function scoreTone(score: number | null): string {
  if (score === null) return "";
  if (score >= 90) return " is-high";
  if (score >= 75) return " is-mid";
  return " is-low";
}

export function EvaluationProgressPage() {
  const { notify } = useNotify();
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState<TeamFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [emailPeriod, setEmailPeriod] = useState<EmailAvgPeriod>("week");
  const [offTick, setOffTick] = useState(0);
  const [emailSending, setEmailSending] = useState(false);
  const [page, setPage] = useState(1);

  const { year, month } = monthFromRange(range);
  const dayNumbers = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1),
    [year, month],
  );

  const agents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listProgressAgents().filter((agent) => {
      if (team !== "all" && agent.team !== team) return false;
      if (!q) return true;
      return (
        agent.name.toLowerCase().includes(q) ||
        agent.alias.toLowerCase().includes(q)
      );
    });
  }, [search, team]);

  useEffect(() => {
    setPage(1);
  }, [search, team, range.start, range.end]);

  const totalRows = agents.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageAgents = useMemo(
    () => agents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [agents, currentPage],
  );
  const pageItems = useMemo(
    () => getPageItems(totalPages, currentPage),
    [totalPages, currentPage],
  );
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalRows);

  const pageIds = pageAgents.map((agent) => agent.id);
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const someSelected = pageIds.some((id) => selectedIds.includes(id));

  const toggleRow = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])));
  };

  const handleDayClick = (agent: ProgressAgent, day: number) => {
    const iso = isoDate(year, month, day);
    const nowOff = toggleDayOff(agent.id, iso);
    setOffTick((tick) => tick + 1);
    notify(
      nowOff
        ? `${agent.name}: ${iso} marked off (sick / annual).`
        : `${agent.name}: ${iso} marked on.`,
      { variant: "success" },
    );
  };

  const handleSendEmail = async () => {
    if (selectedIds.length === 0 || emailSending) return;
    setEmailSending(true);
    try {
      const payload = buildAvgEmailPayload(selectedIds, emailPeriod);
      await queueAvgEmail(payload);
      notify(
        `Queued avg QA email for ${selectedIds.length} agent${selectedIds.length === 1 ? "" : "s"} (${emailPeriodLabel(emailPeriod)}). Power Automate setup coming next.`,
        { variant: "info" },
      );
    } catch {
      notify("Could not queue the avg QA email.", { variant: "error" });
    } finally {
      setEmailSending(false);
    }
  };

  // Re-render day/avg cells after off-day toggles
  void offTick;

  return (
    <main className="eval-progress" aria-label="Evaluation progress">
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
                placeholder="Search agents, aliases…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>

          <FilterSelect
            label="Filter by team"
            value={team}
            options={[{ id: "all" as const, label: "All teams" }, ...TEAM_OPTIONS]}
            onChange={setTeam}
          />

          {selectedIds.length > 0 ? (
            <div className="eval-progress__email">
              <span className="eval-progress__email-label">Email avg</span>
              <FilterSelect
                label="Period"
                value={emailPeriod}
                options={[
                  { id: "last-2-days" as const, label: "Last 2 days" },
                  { id: "week" as const, label: "Last week" },
                  { id: "month" as const, label: "Last month" },
                ]}
                onChange={setEmailPeriod}
              />
              <button
                type="button"
                className="eval-progress__email-btn"
                onClick={() => void handleSendEmail()}
                disabled={emailSending}
              >
                {emailSending ? "Sending…" : `Send (${selectedIds.length})`}
              </button>
            </div>
          ) : null}
        </div>

        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <section className="eval-progress__table-wrap" aria-label="Evaluation progress table">
        <div className="data-table-shell">
          <div className="eval-progress__board">
            {pageAgents.length === 0 ? (
              <div className="audits-table__empty eval-progress__empty">
                No agents found for the selected filters.
              </div>
            ) : (
              <div className="eval-progress__board-inner">
                <div className="eval-progress__locked eval-progress__locked--left">
                  <table className="eval-progress__locked-table">
                    <thead>
                      <tr>
                        <th scope="col" className="eval-progress__col-check">
                          <span className="eval-progress__check-wrap">
                            <input
                              type="checkbox"
                              className="audits-table__checkbox"
                              checked={allSelected}
                              ref={(node) => {
                                if (node) node.indeterminate = someSelected && !allSelected;
                              }}
                              onChange={toggleAll}
                              aria-label="Select all agents on this page"
                              disabled={pageAgents.length === 0}
                            />
                          </span>
                        </th>
                        <th scope="col" className="eval-progress__col-name">
                          <span className="eval-progress__th">Agent name</span>
                        </th>
                        <th scope="col" className="eval-progress__col-dayoff">
                          <span className="eval-progress__th">Day off</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageAgents.map((agent) => {
                        const checked = selectedIds.includes(agent.id);
                        return (
                          <tr
                            key={agent.id}
                            className={checked ? "is-selected" : undefined}
                          >
                            <td className="eval-progress__col-check">
                              <span className="eval-progress__check-wrap">
                                <input
                                  type="checkbox"
                                  className="audits-table__checkbox"
                                  checked={checked}
                                  onChange={() => toggleRow(agent.id)}
                                  aria-label={`Select ${agent.name}`}
                                />
                              </span>
                            </td>
                            <td className="eval-progress__col-name">
                              <span className="eval-progress__agent-name">{agent.name}</span>
                            </td>
                            <td className="eval-progress__col-dayoff eval-progress__off-label">
                              {agent.scheduledDayOff || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="eval-progress__days">
                  <table className="eval-progress__days-table">
                    <thead>
                      <tr>
                        {dayNumbers.map((day) => (
                          <th scope="col" key={day} className="eval-progress__col-day">
                            <span className="eval-progress__th eval-progress__th--day">{day}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageAgents.map((agent) => {
                        const checked = selectedIds.includes(agent.id);
                        return (
                          <tr
                            key={agent.id}
                            className={checked ? "is-selected" : undefined}
                          >
                            {dayNumbers.map((day) => {
                              const iso = isoDate(year, month, day);
                              const off = isDayOff(agent.id, iso);
                              const score = off ? null : scoreForDay(agent.id, iso);
                              return (
                                <td key={day} className="eval-progress__col-day">
                                  <button
                                    type="button"
                                    className={`eval-progress__day${off ? " is-off" : scoreTone(score)}`}
                                    onClick={() => handleDayClick(agent, day)}
                                    title={
                                      off
                                        ? `${iso}: off — click to mark on`
                                        : `${iso}${score !== null ? `: ${score}%` : ""} — click to mark off`
                                    }
                                    aria-label={
                                      off
                                        ? `${agent.name} day ${day} off`
                                        : `${agent.name} day ${day} score ${score ?? "none"}`
                                    }
                                  >
                                    {off ? "OFF" : score === null ? "—" : score}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="eval-progress__locked eval-progress__locked--right">
                  <table className="eval-progress__meta-table">
                    <thead>
                      <tr>
                        <th scope="col" className="eval-progress__col-latest">
                          <span className="eval-progress__th">Latest audit date</span>
                        </th>
                        <th scope="col" className="eval-progress__col-avg">
                          <span className="eval-progress__th">Avg</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageAgents.map((agent) => {
                        const checked = selectedIds.includes(agent.id);
                        const latest = latestAuditDate(agent.id);
                        const avg = averageInRange(agent.id, range);
                        return (
                          <tr
                            key={agent.id}
                            className={checked ? "is-selected" : undefined}
                          >
                            <td className="eval-progress__col-latest">{formatAuditDate(latest)}</td>
                            <td className="eval-progress__col-avg eval-progress__avg">
                              {formatAvgLabel(avg)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <footer className="data-table-footer" aria-label="Table pagination">
            <span className="data-table-footer__meta">
              Showing {rangeStart}–{rangeEnd} of {totalRows} · {PAGE_SIZE} per page
              {selectedIds.length > 0 ? ` · ${selectedIds.length} selected for email` : ""}
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
