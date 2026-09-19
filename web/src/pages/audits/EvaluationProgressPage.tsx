import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DateRangePicker } from "../../components/DateRangePicker";
import { TableCheck } from "../../components/table/TableSelection";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import { useScopedTeamFilter } from "../../hooks/useScopedTeamFilter";
import { TEAM_OPTIONS, formatAuditDate, getAudit, listAudits, saveAudit, type AuditRecord } from "../../lib/audits";
import {
  averageFromLiveDays,
  averageInRange,
  buildAvgEmailPayload,
  daysInMonth,
  findPendingReevaluations,
  formatAvgLabel,
  isDayOff,
  isoDate,
  latestAuditDate,
  listProgressAgents,
  monthFromRange,
  pendingReevalDaySet,
  queueAvgEmail,
  scoreForDay,
  toggleDayOff,
  type ProgressAgent,
} from "../../lib/evaluationProgress";
import { defaultAnalyticsRange, formatRangeLabel, type DateRange } from "../../lib/dateRange";
import {
  fetchAudits,
  fetchEvaluationProgress,
  postEvaluationDayOff,
  postEvaluationScheduledDayOff,
  saveAuditRemote,
  type EvalProgressAgent,
} from "../../lib/externalApi";
import {
  exportPendingReevalWorkbook,
  parseBulkReevalImport,
} from "../../lib/pendingReevalExport";
import { diffAudit, logAuditEdit } from "../../lib/teamTracking";
import { useNotify } from "../../notifications/NotificationContext";
import { useAuth } from "../../auth/AuthContext";

const PAGE_SIZE = 30;
const WEEKDAY_OPTIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type LiveAgent = ProgressAgent & {
  latestAuditDate?: string;
  days?: EvalProgressAgent["days"];
};

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

const DAY_OFF_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "", label: "—" },
  ...WEEKDAY_OPTIONS.map((day) => ({ id: day, label: day })),
];

function DayOffSelect({
  agentName,
  value,
  onChange,
}: {
  agentName: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = DAY_OFF_OPTIONS.find((option) => option.id === value)?.label ?? "—";
  const labelId = `dayoff-${agentName.toLowerCase().replace(/\s+/g, "-")}`;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 84;
      const menuHeight = menuRef.current?.offsetHeight ?? 220;
      const gap = 4;
      let top = rect.bottom + gap;
      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - gap);
      }
      let left = rect.left + rect.width / 2 - menuWidth / 2;
      left = Math.min(Math.max(8, left), window.innerWidth - menuWidth - 8);
      setMenuPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
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
    <div className={`eval-progress__dayoff${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`eval-progress__dayoff-trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span id={labelId} className="eval-progress__dayoff-value">
          {selected}
        </span>
        <svg
          className="eval-progress__dayoff-chevron"
          width="10"
          height="10"
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
      {open && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="eval-progress__dayoff-menu"
              role="listbox"
              aria-label={`Day off for ${agentName}`}
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {DAY_OFF_OPTIONS.map((option) => {
                const isActive = option.id === value;
                return (
                  <button
                    key={option.id || "none"}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`eval-progress__dayoff-option${isActive ? " is-active" : ""}`}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function scoreTone(score: number | null): string {
  if (score === null) return "";
  if (score >= 90) return " is-high";
  if (score >= 75) return " is-mid";
  return " is-low";
}

function liveDayCell(agent: LiveAgent, day: number): { score: number | null; off: boolean } {
  const cell = agent.days?.[String(day)];
  if (!cell) return { score: null, off: false };
  return {
    score: typeof cell.score === "number" ? cell.score : null,
    off: Boolean(cell.off),
  };
}

function liveAverage(
  agent: LiveAgent,
  range: DateRange,
  year: number,
  monthIndex: number,
): number | null {
  return averageFromLiveDays(agent.days, range, year, monthIndex);
}

export function EvaluationProgressPage() {
  const { notify } = useNotify();
  const { user } = useAuth();
  const editorName = user?.full_name?.trim() || user?.username || "—";
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [search, setSearch] = useState("");
  const [team, setTeam, teamScope] = useScopedTeamFilter("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [emailSending, setEmailSending] = useState(false);
  const [reevalOpen, setReevalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [agents, setAgents] = useState<LiveAgent[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [loadDetail, setLoadDetail] = useState("");
  const [loading, setLoading] = useState(true);
  useShellPageLoading(loading);
  const boardInnerRef = useRef<HTMLDivElement>(null);

  const { year, month } = monthFromRange(range);
  const dayNumbers = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1),
    [year, month],
  );
  const monthStartIso = useMemo(() => isoDate(year, month, 1), [year, month]);
  const monthEndIso = useMemo(
    () => isoDate(year, month, daysInMonth(year, month)),
    [year, month],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchEvaluationProgress({
        year,
        month: month + 1,
        team,
        search,
      }),
      fetchAudits({
        start: monthStartIso,
        end: monthEndIso,
        team,
        search,
        limit: 5000,
        offset: 0,
      }),
    ])
      .then(([progress, auditPayload]) => {
        if (cancelled) return;
        if (progress.connected) {
          setLiveConnected(true);
          setLoadDetail("");
          setAgents(
            progress.agents.map((row) => ({
              id: row.id,
              name: row.name,
              alias: row.alias,
              team: row.team,
              scheduledDayOff: row.scheduledDayOff || "",
              latestAuditDate: row.latestAuditDate || "",
              days: row.days,
            })),
          );
        } else {
          setLiveConnected(false);
          setLoadDetail(progress.detail || "External database disconnected. Showing local data.");
          setAgents(listProgressAgents());
        }
        if (auditPayload.connected) {
          setAudits(auditPayload.audits);
        } else {
          setAudits(listAudits());
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLiveConnected(false);
        setLoadDetail(error instanceof Error ? error.message : "Unable to load evaluation progress.");
        setAgents(listProgressAgents());
        setAudits(listAudits());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month, monthStartIso, monthEndIso, team, search]);

  useEffect(() => {
    setPage(1);
  }, [search, team, range.start, range.end]);

  const pendingReevals = useMemo(
    () => findPendingReevaluations(selectedIds, range, agents, audits),
    [selectedIds, range, agents, audits],
  );
  const pendingDayKeys = useMemo(() => pendingReevalDaySet(pendingReevals), [pendingReevals]);
  const canSendEmail =
    selectedIds.length > 0 &&
    Boolean(range.start && range.end) &&
    pendingReevals.length === 0 &&
    !emailSending;

  useEffect(() => {
    if (pendingReevals.length === 0) setReevalOpen(false);
  }, [pendingReevals.length]);

  const totalRows = agents.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageAgents = useMemo(
    () => agents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [agents, currentPage],
  );

  useLayoutEffect(() => {
    const root = boardInnerRef.current;
    if (!root || pageAgents.length === 0) return;

    const sync = () => {
      const leftRows = [
        ...root.querySelectorAll<HTMLElement>(".eval-progress__locked--left tbody tr"),
      ];
      const dayRows = [
        ...root.querySelectorAll<HTMLElement>(".eval-progress__days tbody tr"),
      ];
      const rightRows = [
        ...root.querySelectorAll<HTMLElement>(".eval-progress__locked--right tbody tr"),
      ];
      const count = Math.min(leftRows.length, dayRows.length, rightRows.length);

      for (let index = 0; index < count; index += 1) {
        const group = [leftRows[index], dayRows[index], rightRows[index]];
        group.forEach((row) => {
          row.style.height = "";
        });
        const height = Math.max(...group.map((row) => row.getBoundingClientRect().height));
        group.forEach((row) => {
          row.style.height = `${Math.ceil(height)}px`;
        });
      }

      const heads = [
        ...root.querySelectorAll<HTMLElement>(
          ".eval-progress__locked--left thead tr, .eval-progress__days thead tr, .eval-progress__locked--right thead tr",
        ),
      ];
      heads.forEach((row) => {
        row.style.height = "";
      });
      if (heads.length) {
        const headHeight = Math.max(...heads.map((row) => row.getBoundingClientRect().height));
        heads.forEach((row) => {
          row.style.height = `${Math.ceil(headHeight)}px`;
        });
      }
    };

    sync();
    const frame = window.requestAnimationFrame(sync);
    return () => window.cancelAnimationFrame(frame);
  }, [pageAgents, liveConnected, year, month]);

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

  const handleDayClick = async (agent: LiveAgent, day: number) => {
    const iso = isoDate(year, month, day);
    const current = liveConnected
      ? liveDayCell(agent, day)
      : {
          off: isDayOff(agent.id, iso),
          score: scoreForDay(agent.id, iso),
        };
    if (!current.off && current.score !== null) return;
    if (liveConnected) {
      const nextOff = !current.off;
      try {
        const result = await postEvaluationDayOff({
          agentId: agent.id,
          date: iso,
          off: nextOff,
        });
        setAgents((rows) =>
          rows.map((row) => {
            if (row.id !== agent.id) return row;
            return {
              ...row,
              days: {
                ...(row.days ?? {}),
                [String(day)]: {
                  score: current.score,
                  off: result.off,
                },
              },
            };
          }),
        );
        notify(
          result.off
            ? `${agent.name}: ${iso} marked off (sick / annual).`
            : `${agent.name}: ${iso} marked on.`,
          { variant: "success" },
        );
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not update day off.", {
          variant: "error",
        });
      }
      return;
    }

    const nowOff = toggleDayOff(agent.id, iso);
    setAgents((rows) => [...rows]);
    notify(
      nowOff
        ? `${agent.name}: ${iso} marked off (sick / annual).`
        : `${agent.name}: ${iso} marked on.`,
      { variant: "success" },
    );
  };

  const handleScheduledDayOffChange = async (agent: LiveAgent, weekday: string) => {
    const previous = agent.scheduledDayOff || "";
    setAgents((rows) =>
      rows.map((row) => (row.id === agent.id ? { ...row, scheduledDayOff: weekday } : row)),
    );

    if (!liveConnected) {
      notify(
        weekday
          ? `${agent.name}: weekly day off set to ${weekday}.`
          : `${agent.name}: weekly day off cleared.`,
        { variant: "success" },
      );
      return;
    }

    try {
      const result = await postEvaluationScheduledDayOff({
        agentId: agent.id,
        weekday,
      });
      setAgents((rows) =>
        rows.map((row) =>
          row.id === agent.id ? { ...row, scheduledDayOff: result.weekday } : row,
        ),
      );
      notify(
        result.weekday
          ? `${agent.name}: weekly day off set to ${result.weekday}.`
          : `${agent.name}: weekly day off cleared.`,
        { variant: "success" },
      );
    } catch (error) {
      setAgents((rows) =>
        rows.map((row) => (row.id === agent.id ? { ...row, scheduledDayOff: previous } : row)),
      );
      notify(
        error instanceof Error ? error.message : "Could not update scheduled day off.",
        { variant: "error" },
      );
    }
  };

  const handleSendEmail = async () => {
    if (selectedIds.length === 0 || emailSending) return;
    if (!range.start || !range.end) {
      notify("Select a date range before sending the avg QA email.", { variant: "error" });
      return;
    }
    const pending = findPendingReevaluations(selectedIds, range, agents, audits);
    if (pending.length > 0) {
      setReevalOpen(true);
      return;
    }
    setEmailSending(true);
    try {
      const payload = buildAvgEmailPayload(selectedIds, range, agents);
      await queueAvgEmail(payload);
      notify(
        `Queued avg QA email for ${selectedIds.length} agent${selectedIds.length === 1 ? "" : "s"} (${formatRangeLabel(range)}).`,
        { variant: "success" },
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not queue the avg QA email.",
        { variant: "error" },
      );
    } finally {
      setEmailSending(false);
    }
  };

  const handleExportPending = async () => {
    if (exporting || pendingReevals.length === 0) return;
    setExporting(true);
    try {
      await exportPendingReevalWorkbook({
        pending: pendingReevals,
        audits,
        range,
        selectedAgentIds: selectedIds,
      });
      notify("Pending re-evaluate workbook downloaded.", { variant: "success" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not export workbook.", {
        variant: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  const refreshAudits = async () => {
    try {
      const auditPayload = await fetchAudits({
        start: monthStartIso,
        end: monthEndIso,
        team,
        search,
        limit: 5000,
        offset: 0,
      });
      setAudits(auditPayload.connected ? auditPayload.audits : listAudits());
    } catch {
      setAudits(listAudits());
    }
  };

  const handleImportBulkReeval = async (file: File) => {
    if (importing) return;
    setImporting(true);
    try {
      const { selectedIds: markIds } = await parseBulkReevalImport(file);
      let updated = 0;
      let failed = 0;
      for (const id of markIds) {
        const existing =
          audits.find((row) => row.id === id) ?? getAudit(id);
        if (!existing) {
          failed += 1;
          continue;
        }
        if (existing.reevaluated) {
          updated += 1;
          continue;
        }
        const next: AuditRecord = { ...existing, reevaluated: true };
        try {
          const changes = diffAudit(existing, next);
          const saved = await saveAuditRemote(next, { changes });
          const merged = { ...saved, reevaluated: true };
          saveAudit(merged);
          logAuditEdit(existing, merged, editorName);
          updated += 1;
        } catch {
          failed += 1;
        }
      }
      await refreshAudits();
      notify(
        failed > 0
          ? `Marked ${updated} audit${updated === 1 ? "" : "s"} as re-evaluated. ${failed} failed.`
          : `Marked ${updated} audit${updated === 1 ? "" : "s"} as re-evaluated.`,
        { variant: failed > 0 ? "error" : "success" },
      );
      if (updated > 0) setReevalOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not import workbook.", {
        variant: "error",
      });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

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
                placeholder="Search agents, aliases..."
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

          {selectedIds.length > 0 ? (
            <div className="eval-progress__email">
              <span className="eval-progress__email-label">Email avg (selected range)</span>
              {pendingReevals.length > 0 ? (
                <button
                  type="button"
                  className="eval-progress__email-btn eval-progress__email-btn--warn"
                  onClick={() => setReevalOpen(true)}
                >
                  Re-evaluate first ({pendingReevals.length})
                </button>
              ) : (
                <button
                  type="button"
                  className="eval-progress__email-btn"
                  onClick={() => void handleSendEmail()}
                  disabled={!canSendEmail}
                >
                  {emailSending ? "Sending..." : `Send (${selectedIds.length})`}
                </button>
              )}
            </div>
          ) : null}
        </div>

        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {loadDetail ? (
        <p className="audits-page__hint" role="status">
          {loadDetail}
        </p>
      ) : null}

      {reevalOpen && pendingReevals.length > 0
        ? createPortal(
            <div
              className="cases-modal"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setReevalOpen(false);
              }}
            >
              <div
                className="cases-modal__dialog eval-progress__reeval-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reeval-modal-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="cases-modal__header">
                  <div>
                    <h2 id="reeval-modal-title" className="cases-modal__title">
                      Re-evaluation required
                    </h2>
                    <p className="cases-modal__subtitle">
                      {pendingReevals.length} agent
                      {pendingReevals.length === 1 ? "" : "s"} still need re-evaluation before
                      email can be sent.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cases-modal__close"
                    aria-label="Close"
                    onClick={() => setReevalOpen(false)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </header>
                <div className="cases-modal__body eval-progress__reeval-body">
                  <ul className="eval-progress__reeval-list">
                    {pendingReevals.map((row) => (
                      <li key={row.agentId}>
                        <strong>{row.name}</strong>
                        <span>
                          {" — "}
                          {row.days.map((day) => formatAuditDate(day)).join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <footer className="eval-progress__reeval-footer">
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleImportBulkReeval(file);
                    }}
                  />
                  <button
                    type="button"
                    className="eval-progress__reeval-secondary"
                    disabled={importing}
                    onClick={() => importInputRef.current?.click()}
                  >
                    {importing ? "Importing..." : "Import xlsx"}
                  </button>
                  <button
                    type="button"
                    className="eval-progress__email-btn"
                    disabled={exporting}
                    onClick={() => void handleExportPending()}
                  >
                    {exporting ? "Exporting..." : "Export xlsx"}
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}

      <section className="eval-progress__table-wrap" aria-label="Evaluation progress table">
        <div className="data-table-shell">
          <div className="eval-progress__board">
            {pageAgents.length === 0 ? (
              <div className="audits-table__empty eval-progress__empty">
                No agents found for the selected filters.
              </div>
            ) : (
              <div className="eval-progress__board-inner" ref={boardInnerRef}>
                <div className="eval-progress__locked eval-progress__locked--left">
                  <table className="eval-progress__locked-table">
                    <thead>
                      <tr>
                        <th scope="col" className="eval-progress__col-check">
                          <span className="eval-progress__check-wrap">
                            <TableCheck
                              checked={allSelected}
                              indeterminate={someSelected && !allSelected}
                              onChange={toggleAll}
                              label="Select all agents on this page"
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
                                <TableCheck
                                  checked={checked}
                                  onChange={() => toggleRow(agent.id)}
                                  label={`Select ${agent.name}`}
                                />
                              </span>
                            </td>
                            <td className="eval-progress__col-name">
                              <span className="eval-progress__agent-name">{agent.name}</span>
                            </td>
                            <td className="eval-progress__col-dayoff">
                              <DayOffSelect
                                agentName={agent.name}
                                value={agent.scheduledDayOff || ""}
                                onChange={(weekday) =>
                                  void handleScheduledDayOffChange(agent, weekday)
                                }
                              />
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
                              const cell = liveConnected
                                ? liveDayCell(agent, day)
                                : {
                                    off: isDayOff(agent.id, iso),
                                    score: scoreForDay(agent.id, iso),
                                  };
                              const { off, score } = cell;
                              const needsReeval = pendingDayKeys.has(`${agent.id}:${iso}`);
                              const hasScore = !off && score !== null;
                              return (
                                <td key={day} className="eval-progress__col-day">
                                  <button
                                    type="button"
                                    className={`eval-progress__day${off ? " is-off" : scoreTone(score)}${needsReeval ? " is-needs-reeval" : ""}${hasScore ? " is-locked" : ""}`}
                                    onClick={() => void handleDayClick(agent, day)}
                                    disabled={hasScore}
                                    title={
                                      hasScore
                                        ? needsReeval
                                          ? `${iso}: ${score}% — needs re-evaluation`
                                          : `${iso}: ${score}%`
                                        : off
                                          ? `${iso}: off - click to mark on`
                                          : `${iso} - click to mark off`
                                    }
                                    aria-label={
                                      hasScore
                                        ? `${agent.name} day ${day} score ${score}`
                                        : off
                                          ? `${agent.name} day ${day} off`
                                          : `${agent.name} day ${day} empty`
                                    }
                                  >
                                    {off ? "OFF" : score === null ? "-" : score}
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
                        const latest = liveConnected
                          ? agent.latestAuditDate || ""
                          : latestAuditDate(agent.id);
                        const avg = liveConnected
                          ? liveAverage(agent, range, year, month)
                          : averageInRange(agent.id, range);
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
              Showing {rangeStart}-{rangeEnd} of {totalRows} | {PAGE_SIZE} per page
              {selectedIds.length > 0 ? ` | ${selectedIds.length} selected for email` : ""}
            </span>
            <nav className="data-table-pager" aria-label="Pages">
              <button
                type="button"
                className="data-table-pager__btn"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {"<"}
              </button>
              {pageItems.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="data-table-pager__ellipsis">
                    ...
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
                {">"}
              </button>
            </nav>
          </footer>
        </div>
      </section>
    </main>
  );
}
