import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useConfirmDelete } from "../../components/ConfirmDeleteContext";
import { DateRangePicker } from "../../components/DateRangePicker";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import {
  BulkDeleteButton,
  RowCheckboxCell,
  SelectAllCheckbox,
} from "../../components/table/TableSelection";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import { useRowSelection } from "../../hooks/useRowSelection";
import { useScopedTeamFilter } from "../../hooks/useScopedTeamFilter";
import {
  CASE_TYPE_OPTIONS,
  TEAM_OPTIONS,
  deleteAudit,
  formatAuditDate,
  getAudit,
  listAudits,
  teamLabel,
  type AuditRecord,
  type AuditTeam,
} from "../../lib/audits";
import {
  defaultAnalyticsRange,
  parseIsoDay,
  rangeFromSearchParams,
  toIsoDate,
  type DateRange,
} from "../../lib/dateRange";
import { fetchAudits, fetchCaseTypes, deleteAuditRemote } from "../../lib/externalApi";
import {
  readAuditListView,
  writeAuditListView,
  type AuditListView,
} from "../../lib/auditListView";
import {
  applyDir,
  compareBool,
  compareNumber,
  compareText,
  nextSortState,
} from "../../lib/tableSort";
import { logAuditDelete } from "../../lib/teamTracking";
import { useNotify } from "../../notifications/NotificationContext";
import { NewAuditModal } from "./NewAuditModal";

const PAGE_SIZE = 30;
const LIST_FILTERS_KEY = "daq_audit_list_filters_v2";

type TeamFilter = "all" | AuditTeam;
type CaseFilter = "all" | string;
type EvaluateFilter = "all" | "done" | "not-done";
type SortKey =
  | "date"
  | "team"
  | "agentName"
  | "alias"
  | "score"
  | "shared"
  | "evaluate"
  | "createdBy";

type StoredListFilters = {
  search: string;
  team: TeamFilter;
  caseType: CaseFilter;
  evaluate: EvaluateFilter;
  start: string;
  end: string;
  page: number;
};

function readStoredListFilters(): StoredListFilters | null {
  try {
    const raw = sessionStorage.getItem(LIST_FILTERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredListFilters>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      team:
        parsed.team === "calls" ||
        parsed.team === "tickets" ||
        parsed.team === "live-chat" ||
        parsed.team === "sales" ||
        parsed.team === "all"
          ? parsed.team
          : "all",
      caseType: typeof parsed.caseType === "string" ? parsed.caseType : "all",
      evaluate:
        parsed.evaluate === "done" ||
        parsed.evaluate === "not-done" ||
        parsed.evaluate === "all"
          ? parsed.evaluate
          : "all",
      start: typeof parsed.start === "string" ? parsed.start : "",
      end: typeof parsed.end === "string" ? parsed.end : "",
      page: typeof parsed.page === "number" && parsed.page > 0 ? parsed.page : 1,
    };
  } catch {
    return null;
  }
}

function writeStoredListFilters(filters: StoredListFilters) {
  sessionStorage.setItem(LIST_FILTERS_KEY, JSON.stringify(filters));
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
  const labelId = `audit-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

function mergeLocalAudits(
  live: AuditRecord[],
  range: { start: Date | null; end: Date | null },
): AuditRecord[] {
  const local = listAudits();
  const liveIds = new Set(live.map((row) => row.id));
  const extras = local.filter((row) => {
    if (liveIds.has(row.id)) return false;
    if (!range.start && !range.end) return true;
    if (!row.date) return false;
    const day = new Date(`${row.date}T00:00:00`);
    if (Number.isNaN(day.getTime())) return false;
    if (range.start) {
      const s = new Date(
        range.start.getFullYear(),
        range.start.getMonth(),
        range.start.getDate(),
      );
      if (day < s) return false;
    }
    if (range.end) {
      const e = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
      if (day > e) return false;
    }
    return true;
  });
  return [...extras, ...live];
}

export function AuditListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { notify } = useNotify();
  const { confirmDelete } = useConfirmDelete();
  const storedFilters = useMemo(() => readStoredListFilters(), []);
  const [range, setRange] = useState<DateRange>(() => {
    const fromUrl = rangeFromSearchParams(searchParams);
    if (fromUrl) return fromUrl;
    const start = parseIsoDay(storedFilters?.start);
    const end = parseIsoDay(storedFilters?.end);
    if (start && end) return { start, end };
    return defaultAnalyticsRange();
  });
  const [search, setSearch] = useState(() => {
    return searchParams.get("search")?.trim() || storedFilters?.search || "";
  });
  const [team, setTeam, teamScope] = useScopedTeamFilter(
    storedFilters?.team ?? "all",
  );
  const [caseType, setCaseType] = useState<CaseFilter>(
    () => storedFilters?.caseType ?? "all",
  );
  const [evaluate, setEvaluate] = useState<EvaluateFilter>(
    () => storedFilters?.evaluate ?? "all",
  );
  const [listView, setListView] = useState<AuditListView>(() => readAuditListView());
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(() => storedFilters?.page ?? 1);
  const [rows, setRows] = useState<AuditRecord[]>([]);
  const [loadDetail, setLoadDetail] = useState("");
  const [loading, setLoading] = useState(true);
  useShellPageLoading(loading);
  const [caseOptions, setCaseOptions] = useState<Array<{ id: string; label: string }>>(
    CASE_TYPE_OPTIONS.map((item) => ({ id: item.id, label: item.label })),
  );
  const [newAuditOpen, setNewAuditOpen] = useState(false);
  const deletedBy = user?.full_name?.trim() || user?.username || "—";

  useEffect(() => {
    const fromUrl = rangeFromSearchParams(searchParams);
    if (fromUrl) setRange(fromUrl);
    const q = searchParams.get("search");
    if (q != null && q.trim()) setSearch(q.trim());
  }, [searchParams]);

  useEffect(() => {
    writeAuditListView(listView);
  }, [listView]);

  useEffect(() => {
    writeStoredListFilters({
      search,
      team,
      caseType,
      evaluate,
      start: toIsoDate(range.start),
      end: toIsoDate(range.end),
      page,
    });
  }, [search, team, caseType, evaluate, range.start, range.end, page]);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await fetchAudits({
        start: toIsoDate(range.start) || undefined,
        end: toIsoDate(range.end) || undefined,
        team,
        search,
        limit: 2000,
        offset: 0,
      });
      if (payload.connected) {
        setLoadDetail("");
        setRows(mergeLocalAudits(payload.audits, { start: range.start, end: range.end }));
      } else {
        setLoadDetail(payload.detail || "External database disconnected. Showing local audits.");
        setRows(listAudits());
      }
    } catch (error) {
      setLoadDetail(error instanceof Error ? error.message : "Unable to load audits.");
      setRows(listAudits());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when filters change
  }, [range.start, range.end, team, search]);

  useEffect(() => {
    void fetchCaseTypes({ team: team === "all" ? "all" : team })
      .then((payload) => {
        if (!payload.connected || payload.caseTypes.length === 0) return;
        setCaseOptions(
          payload.caseTypes.map((row) => ({
            id: row.name || row.id,
            label: row.name || row.id,
          })),
        );
      })
      .catch(() => {
        /* keep defaults */
      });
  }, [team]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, team, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (caseType !== "all" && row.caseType !== caseType) return false;
      if (evaluate === "done" && !row.reevaluated) return false;
      if (evaluate === "not-done" && row.reevaluated) return false;
      if (q) {
        const haystack = [
          row.agentName,
          row.alias,
          row.agentId,
          row.caseType,
          row.ticketNumber,
          row.orderNumber,
          listView === "audit" ? row.createdBy : "",
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        if (!haystack.some((value) => value.includes(q))) return false;
      }
      if (!range.start && !range.end) return true;
      if (!row.date) return false;
      const day = new Date(`${row.date}T00:00:00`);
      if (Number.isNaN(day.getTime())) return false;
      if (range.start) {
        const s = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
        if (day < s) return false;
      }
      if (range.end) {
        const e = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
        if (day > e) return false;
      }
      return true;
    });
  }, [rows, caseType, evaluate, range.start, range.end, search, listView]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "date":
          result = compareText(a.date, b.date);
          break;
        case "team":
          result = compareText(teamLabel(a.team), teamLabel(b.team));
          break;
        case "agentName":
          result = compareText(a.agentName, b.agentName);
          break;
        case "alias":
          result = compareText(a.alias, b.alias);
          break;
        case "score":
          result = compareNumber(a.score || a.qualityScore, b.score || b.qualityScore);
          break;
        case "shared":
          result = compareBool(a.shared, b.shared);
          break;
        case "evaluate":
          result = compareBool(a.reevaluated, b.reevaluated);
          break;
        case "createdBy":
          result = compareText(a.createdBy, b.createdBy);
          break;
        default:
          result = 0;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const skipPageResetRef = useRef(true);
  useEffect(() => {
    if (skipPageResetRef.current) {
      skipPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [search, team, caseType, evaluate, range.start, range.end]);

  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageItems = getPageItems(totalPages, currentPage);
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalRows);

  const pageIds = useMemo(() => pageRows.map((row) => row.id), [pageRows]);
  const {
    selectedIds,
    isSelected,
    allPageSelected,
    somePageSelected,
    toggleRow,
    toggleAllPage,
    clearSelection,
  } = useRowSelection(pageIds);

  const toggleSort = (key: SortKey) => {
    const preferred: SortDir =
      key === "score" || key === "date" || key === "evaluate" || key === "shared"
        ? "desc"
        : "asc";
    const next = nextSortState(sortKey, sortDir, key, preferred);
    setSortKey(next.key);
    setSortDir(next.dir);
    setPage(1);
  };

  const showCreatedBy = listView === "audit";
  const tableColSpan = showCreatedBy ? 9 : 8;

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const ok = await confirmDelete({
      title: count === 1 ? "Delete 1 audit?" : `Delete ${count} audits?`,
      description:
        count === 1
          ? "This audit will be permanently removed from the list."
          : "These audits will be permanently removed from the list.",
      confirmLabel: count === 1 ? "Delete audit" : "Delete audits",
    });
    if (!ok) return;
    const failed: string[] = [];
    for (const id of selectedIds) {
      const audit = rows.find((row) => row.id === id) ?? getAudit(id);
      try {
        await deleteAuditRemote(id);
        if (audit) logAuditDelete(audit, deletedBy);
        deleteAudit(id);
      } catch {
        failed.push(id);
      }
    }
    clearSelection();
    setRows((current) => current.filter((row) => !selectedIds.includes(row.id) || failed.includes(row.id)));
    void refresh();
    if (failed.length === selectedIds.length) {
      notify("Could not delete audits.", { variant: "error" });
      return;
    }
    if (failed.length > 0) {
      notify(`Deleted ${selectedIds.length - failed.length}; ${failed.length} failed.`, {
        variant: "error",
      });
      return;
    }
    notify(
      count === 1 ? "1 audit deleted." : `${count} audits deleted.`,
      { variant: "success" },
    );
  };

  return (
    <main className="audits-page" aria-label="Audit list">
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
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
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
              setPage(1);
            }}
          />

          <FilterSelect
            label="Filter by case type"
            value={caseType}
            options={[{ id: "all", label: "All case types" }, ...caseOptions]}
            onChange={(value) => {
              setCaseType(value);
              setPage(1);
            }}
          />

          <FilterSelect
            label="Filter by evaluate"
            value={evaluate}
            options={[
              { id: "all" as const, label: "All evaluate" },
              { id: "done" as const, label: "Done" },
              { id: "not-done" as const, label: "Not Done" },
            ]}
            onChange={(value) => {
              setEvaluate(value);
              setPage(1);
            }}
          />

          <FilterSelect
            label="View"
            value={listView}
            options={[
              { id: "audit" as const, label: "Audit view" },
              { id: "coaching" as const, label: "Coaching view" },
            ]}
            onChange={(value) => {
              setListView(value);
              if (value === "coaching" && sortKey === "createdBy") {
                setSortKey("date");
                setSortDir("desc");
              }
              setPage(1);
            }}
          />

          <BulkDeleteButton count={selectedIds.length} onClick={() => void handleDeleteSelected()} noun="audits" />
        </div>

        <div className="audits-toolbar-right">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            className="cases-add-btn"
            onClick={() => setNewAuditOpen(true)}
          >
            Add audit
          </button>
        </div>
      </div>

      {loadDetail ? (
        <p className="audits-page__hint" role="status">
          {loadDetail}
        </p>
      ) : null}

      <section className="audits-table-wrap" aria-label="Audits table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SelectAllCheckbox
                    allSelected={allPageSelected}
                    someSelected={somePageSelected}
                    onToggle={toggleAllPage}
                    disabled={pageRows.length === 0}
                  />
                  <SortHeader label="Date" active={sortKey === "date"} dir={sortDir} onClick={() => toggleSort("date")} />
                  <SortHeader label="Team" active={sortKey === "team"} dir={sortDir} onClick={() => toggleSort("team")} />
                  <SortHeader label="Agent name" active={sortKey === "agentName"} dir={sortDir} onClick={() => toggleSort("agentName")} />
                  <SortHeader label="Alias" active={sortKey === "alias"} dir={sortDir} onClick={() => toggleSort("alias")} />
                  <SortHeader label="Score" active={sortKey === "score"} dir={sortDir} onClick={() => toggleSort("score")} />
                  <SortHeader label="Shared" active={sortKey === "shared"} dir={sortDir} onClick={() => toggleSort("shared")} />
                  <SortHeader label="Evaluate" active={sortKey === "evaluate"} dir={sortDir} onClick={() => toggleSort("evaluate")} />
                  {showCreatedBy ? (
                    <SortHeader
                      label="Created by"
                      active={sortKey === "createdBy"}
                      dir={sortDir}
                      onClick={() => toggleSort("createdBy")}
                    />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="audits-table__empty">
                      No audits found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const checked = isSelected(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={`audits-table__row${checked ? " is-selected" : ""}`}
                        tabIndex={0}
                        onClick={() => navigate(`/audits/audit-details/${row.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(`/audits/audit-details/${row.id}`);
                          }
                        }}
                      >
                        <RowCheckboxCell
                          checked={checked}
                          onToggle={() => toggleRow(row.id)}
                          label={`Select audit for ${row.agentName || row.id}`}
                        />
                        <td>{formatAuditDate(row.date)}</td>
                        <td>{teamLabel(row.team)}</td>
                        <td>{row.agentName || "—"}</td>
                        <td>{row.alias || "—"}</td>
                        <td>{row.score || "—"}</td>
                        <td>{row.shared ? "Yes" : "No"}</td>
                        <td>
                          <span
                            className={`audits-eval audits-eval--${
                              row.reevaluated ? "done" : "pending"
                            }`}
                          >
                            {row.reevaluated ? "Done" : "Not Done"}
                          </span>
                        </td>
                        {showCreatedBy ? <td>{row.createdBy || "—"}</td> : null}
                      </tr>
                    );
                  })
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

      <NewAuditModal
        open={newAuditOpen}
        onClose={() => setNewAuditOpen(false)}
        onSaved={(auditId) => {
          void refresh().then(() => navigate(`/audits/audit-details/${auditId}`));
        }}
      />
    </main>
  );
}
