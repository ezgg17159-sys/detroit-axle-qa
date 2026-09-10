import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DateRangePicker } from "../../components/DateRangePicker";
import {
  CASE_TYPE_OPTIONS,
  TEAM_OPTIONS,
  caseTypeLabel,
  deleteAudit,
  formatAuditDate,
  listAudits,
  teamLabel,
  type AuditRecord,
  type AuditTeam,
  type CaseType,
} from "../../lib/audits";
import { defaultAnalyticsRange, type DateRange } from "../../lib/dateRange";
import { useNotify } from "../../notifications/NotificationContext";
import { NewAuditModal } from "./NewAuditModal";

const PAGE_SIZE = 30;

type TeamFilter = "all" | AuditTeam;
type CaseFilter = "all" | CaseType;

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

export function AuditListPage() {
  const navigate = useNavigate();
  const { notify } = useNotify();
  const [range, setRange] = useState<DateRange>(() => defaultAnalyticsRange());
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState<TeamFilter>("all");
  const [caseType, setCaseType] = useState<CaseFilter>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AuditRecord[]>(() => listAudits());
  const [newAuditOpen, setNewAuditOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => setRows(listAudits());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (team !== "all" && row.team !== team) return false;
      if (caseType !== "all" && row.caseType !== caseType) return false;
      if (!q) return true;
      return (
        row.agentName.toLowerCase().includes(q) ||
        row.alias.toLowerCase().includes(q) ||
        row.ticketNumber.toLowerCase().includes(q) ||
        row.orderNumber.toLowerCase().includes(q)
      );
    });
  }, [rows, search, team, caseType]);

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageItems = getPageItems(totalPages, currentPage);
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalRows);

  const pageIds = pageRows.map((row) => row.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));

  const toggleRow = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const toggleAllPage = () => {
    if (allPageSelected) {
      setSelectedIds((current) => current.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])));
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    selectedIds.forEach((id) => deleteAudit(id));
    setSelectedIds([]);
    setRows(listAudits());
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
            label="Filter by team"
            value={team}
            options={[{ id: "all" as const, label: "All teams" }, ...TEAM_OPTIONS]}
            onChange={(value) => {
              setTeam(value);
              setPage(1);
            }}
          />

          <FilterSelect
            label="Filter by case type"
            value={caseType}
            options={[{ id: "all" as const, label: "All case types" }, ...CASE_TYPE_OPTIONS]}
            onChange={(value) => {
              setCaseType(value);
              setPage(1);
            }}
          />

          <div className="audits-new">
            <span className="audits-new__label" aria-hidden="true">
              New
            </span>
            <button type="button" className="audits-new__btn" onClick={() => setNewAuditOpen(true)}>
              New audit
            </button>
          </div>

          {selectedIds.length > 0 ? (
            <div className="audits-bulk">
              <span className="audits-bulk__label" aria-hidden="true">
                Delete
              </span>
              <button
                type="button"
                className="audits-bulk__delete"
                onClick={handleDeleteSelected}
              >
                Delete ({selectedIds.length})
              </button>
            </div>
          ) : null}
        </div>

        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <section className="audits-table-wrap" aria-label="Audits table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col" className="audits-table__check-col">
                    <span className="data-table__th-static audits-table__check-wrap">
                      <input
                        type="checkbox"
                        className="audits-table__checkbox"
                        checked={allPageSelected}
                        ref={(node) => {
                          if (node) node.indeterminate = somePageSelected && !allPageSelected;
                        }}
                        onChange={toggleAllPage}
                        aria-label="Select all on this page"
                        disabled={pageRows.length === 0}
                      />
                    </span>
                  </th>
                  <th scope="col"><span className="data-table__th-static">Date</span></th>
                  <th scope="col"><span className="data-table__th-static">Team</span></th>
                  <th scope="col"><span className="data-table__th-static">Agent name</span></th>
                  <th scope="col"><span className="data-table__th-static">Alias</span></th>
                  <th scope="col"><span className="data-table__th-static">Score</span></th>
                  <th scope="col"><span className="data-table__th-static">Shared</span></th>
                  <th scope="col"><span className="data-table__th-static">Evaluate</span></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="audits-table__empty">
                      No audits found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const checked = selectedIds.includes(row.id);
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
                        <td
                          className="audits-table__check-col"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <span className="audits-table__check-wrap">
                            <input
                              type="checkbox"
                              className="audits-table__checkbox"
                              checked={checked}
                              onChange={() => toggleRow(row.id)}
                              aria-label={`Select audit for ${row.agentName || row.id}`}
                            />
                          </span>
                        </td>
                        <td>{formatAuditDate(row.date)}</td>
                        <td>{teamLabel(row.team)}</td>
                        <td>{row.agentName || "—"}</td>
                        <td>{row.alias || "—"}</td>
                        <td>{row.score || "—"}</td>
                        <td>{row.shared ? "Yes" : "No"}</td>
                        <td>
                          <span className={`audits-eval audits-eval--${row.evaluate}`}>
                            {row.evaluate === "done" ? "Done" : "Pending"}
                          </span>
                        </td>
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

      <p className="audits-page__hint" aria-hidden="true">
        {team === "all" ? "" : `Filtered to ${teamLabel(team)}`}
        {caseType !== "all" ? ` · ${caseTypeLabel(caseType)}` : ""}
      </p>

      <NewAuditModal
        open={newAuditOpen}
        onClose={() => setNewAuditOpen(false)}
        onSaved={(auditId) => {
          setRows(listAudits());
          navigate(`/audits/audit-details/${auditId}`);
        }}
      />
    </main>
  );
}
