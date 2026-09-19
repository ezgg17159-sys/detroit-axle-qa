import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { DateRangePicker } from "../../components/DateRangePicker";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import {
  CASE_TYPE_OPTIONS,
  caseTypeLabel,
  formatAuditDate,
  teamLabel,
  type AuditRecord,
  type CaseType,
} from "../../lib/audits";
import { defaultAnalyticsRange, rangeFromSearchParams, type DateRange } from "../../lib/dateRange";
import {
  auditInRange,
  loadEmployeeAudits,
  resolveEmployeeIdentity,
  type EmployeeIdentity,
} from "../../lib/employeePortal";
import {
  applyDir,
  compareNumber,
  compareText,
  nextSortState,
} from "../../lib/tableSort";

const PAGE_SIZE = 30;

type SortKey = "date" | "team" | "case" | "score" | "status";

function employeeStatusLabel(status: string | undefined): string {
  if (!status) return "—";
  if (status === "Shared" || status === "Internal") return "Evaluated";
  return status;
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
  const labelId = `emp-audit-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

export function EmployeeAuditsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [identity, setIdentity] = useState<EmployeeIdentity | null>(null);

  const [search, setSearch] = useState("");
  const [caseType, setCaseType] = useState<"all" | CaseType>("all");
  const [range, setRange] = useState<DateRange>(() => {
    return rangeFromSearchParams(searchParams) ?? defaultAnalyticsRange();
  });
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [rows, setRows] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  useShellPageLoading(loading);

  useEffect(() => {
    const fromUrl = rangeFromSearchParams(searchParams);
    if (fromUrl) setRange(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    void resolveEmployeeIdentity(user).then((resolved) => {
      if (!cancelled) setIdentity(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!identity) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadEmployeeAudits(identity, { start: range.start, end: range.end })
      .then((audits) => {
        if (!cancelled) setRows(audits);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, range.start, range.end]);

  const caseOptions = useMemo(() => {
    const fromRows = Array.from(
      new Set(rows.map((row) => row.caseType).filter(Boolean)),
    ).map((id) => ({ id, label: caseTypeLabel(id) }));
    const base = CASE_TYPE_OPTIONS.length > 0 ? CASE_TYPE_OPTIONS : fromRows;
    const merged = new Map(base.map((item) => [item.id, item]));
    for (const item of fromRows) merged.set(item.id, item);
    return [{ id: "all" as const, label: "All case types" }, ...Array.from(merged.values())];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (caseType !== "all" && row.caseType !== caseType) return false;
      if (!auditInRange(row.date, range.start, range.end)) return false;
      if (!q) return true;
      return (
        caseTypeLabel(row.caseType).toLowerCase().includes(q) ||
        teamLabel(row.team).toLowerCase().includes(q) ||
        (row.score || "").toLowerCase().includes(q) ||
        (row.qualityScore || "").toLowerCase().includes(q) ||
        (row.status || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, caseType, range.start, range.end]);

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
        case "case":
          result = compareText(caseTypeLabel(a.caseType), caseTypeLabel(b.caseType));
          break;
        case "score":
          result = compareNumber(a.qualityScore || a.score, b.qualityScore || b.score);
          break;
        case "status":
          result = compareText(a.status, b.status);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, caseType, range.start, range.end]);

  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageItems = getPageItems(totalPages, currentPage);
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalRows);

  if (!identity) {
    return loading ? (
      <main className="employee-page" aria-label="My audits" />
    ) : null;
  }

  return (
    <main className="employee-page" aria-label="My audits">
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
                placeholder="Search audits…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>

          <FilterSelect
            label="Filter by case"
            value={caseType}
            options={caseOptions}
            onChange={setCaseType}
          />
        </div>

        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <section className="employee-page__table-wrap" aria-label="My audits table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader
                    label="Date"
                    active={sortKey === "date"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "date", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Team"
                    active={sortKey === "team"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "team", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Case"
                    active={sortKey === "case"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "case", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Score"
                    active={sortKey === "score"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "score", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Status"
                    active={sortKey === "status"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "status", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="audits-table__empty">
                      No audits found for your account in this range.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr
                      key={row.id}
                      className="audits-table__row employee-row-click"
                      tabIndex={0}
                      role="link"
                      aria-label={`Open audit from ${formatAuditDate(row.date)}`}
                      onClick={() => navigate(`/employee/audits/${encodeURIComponent(row.id)}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/employee/audits/${encodeURIComponent(row.id)}`);
                        }
                      }}
                    >
                      <td>{formatAuditDate(row.date)}</td>
                      <td>{teamLabel(row.team)}</td>
                      <td>{caseTypeLabel(row.caseType) || "—"}</td>
                      <td>{row.qualityScore || row.score || "—"}</td>
                      <td>{employeeStatusLabel(row.status)}</td>
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
