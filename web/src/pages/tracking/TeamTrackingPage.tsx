import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import { TableRowActions } from "../../components/table/TableRowActions";
import { formatAuditDate, teamLabel, type AuditTeam } from "../../lib/audits";
import { fetchTeamTracking } from "../../lib/externalApi";
import {
  applyDir,
  compareNumber,
  compareText,
  nextSortState,
} from "../../lib/tableSort";
import {
  formatEditedAt,
  listAuditEditLogs,
  listQaTeamMembers,
  type AuditEditLog,
} from "../../lib/teamTracking";

const PAGE_SIZE = 30;

type SortKey =
  | "editedAt"
  | "auditDate"
  | "team"
  | "agentName"
  | "createdBy"
  | "editedBy"
  | "score"
  | "changes";

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
  const labelId = `tt-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

function RowActions({ onView }: { onView: () => void }) {
  return (
    <TableRowActions
      label="Tracking actions"
      items={[{ label: "View", onClick: onView }]}
    />
  );
}

function ViewLogModal({
  open,
  record,
  onClose,
}: {
  open: boolean;
  record: AuditEditLog | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !record) return null;

  const isDelete = record.action === "delete";

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog tt-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tt-view-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="tt-details__header">
          <div className="tt-details__heading">
            <p className="tt-details__eyebrow">Team tracking</p>
            <h2 id="tt-view-title" className="tt-details__title">
              {record.agentName || "Agent"}
            </h2>
            <p className="tt-details__sub">
              {isDelete ? "Deleted" : "Edited"} {formatEditedAt(record.editedAt)}
            </p>
          </div>
          <div className="tt-details__header-aside">
            <span className={`tt-details__pill${isDelete ? " is-delete" : " is-edit"}`}>
              {isDelete ? "Deleted" : "Edited"}
            </span>
            <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="tt-details__body">
          <div className="tt-details__meta">
            <div>
              <span>{isDelete ? "Deleted by" : "Edited by"}</span>
              <strong>{record.editedBy || "—"}</strong>
            </div>
            <div>
              <span>Created by</span>
              <strong>{record.createdBy || "—"}</strong>
            </div>
            <div>
              <span>Team</span>
              <strong>{teamLabel(record.team)}</strong>
            </div>
            <div>
              <span>Score</span>
              <strong>{record.score || "—"}</strong>
            </div>
            <div>
              <span>Audit date</span>
              <strong>{formatAuditDate(record.auditDate)}</strong>
            </div>
            <div>
              <span>{isDelete ? "Deleted" : "Edited"}</span>
              <strong>{formatEditedAt(record.editedAt)}</strong>
            </div>
          </div>

          <section className="tt-details__changes" aria-label={isDelete ? "Action" : "Changes"}>
            <span className="tt-details__changes-label">
              {isDelete ? "Action" : "Changes"}
            </span>
            {record.changes.length === 0 ? (
              <p className="tt-details__empty">
                {isDelete ? "Audit was deleted." : "No field changes recorded."}
              </p>
            ) : (
              <ul className="tt-details__change-list">
                {record.changes.map((change, index) => (
                  <li key={`${change.field}-${index}`}>
                    <strong>{change.field}</strong>
                    <div className="tt-details__diff">
                      <span className="tt-details__diff-from">{change.from || "—"}</span>
                      <span className="tt-details__diff-arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="tt-details__diff-to">{change.to || "—"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!isDelete ? (
            <Link
              to={`/audits/audit-details/${record.auditId}`}
              className="tt-details__open"
              onClick={onClose}
            >
              Open audit
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M7 17L17 7M17 7H9M17 7v8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TeamTrackingPage() {
  const { user } = useAuth();
  const currentUser = user?.full_name?.trim() || user?.username || "";

  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("editedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [rows, setRows] = useState<AuditEditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AuditEditLog | null>(null);

  useShellPageLoading(loading);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await fetchTeamTracking({ search, limit: 2000 });
      if (payload.connected) {
        const live = payload.items.map((raw) => {
          const row = raw as Partial<AuditEditLog> & { id?: string };
          return {
            id: String(row.id || ""),
            auditId: String(row.auditId || ""),
            action: row.action === "delete" ? "delete" : "edit",
            editedAt: String(row.editedAt || ""),
            auditDate: String(row.auditDate || ""),
            team: (row.team as AuditTeam) || "calls",
            agentName: String(row.agentName || ""),
            createdBy: String(row.createdBy || ""),
            editedBy: String(row.editedBy || ""),
            score: String(row.score || ""),
            changesSummary: String(row.changesSummary || ""),
            changes: Array.isArray(row.changes) ? row.changes : [],
          } satisfies AuditEditLog;
        });
        setRows(live);
      } else {
        setRows(listAuditEditLogs());
      }
    } catch {
      setRows(listAuditEditLogs());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const memberOptions = useMemo(() => {
    const names = new Set(listQaTeamMembers());
    if (currentUser) names.add(currentUser);
    for (const row of rows) {
      if (row.editedBy.trim()) names.add(row.editedBy.trim());
    }
    return [
      { id: "all", label: "All QA members" },
      ...Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ id: name, label: name })),
    ];
  }, [rows, currentUser]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (memberFilter !== "all" && row.editedBy !== memberFilter) return false;
      if (!q) return true;
      return (
        row.agentName.toLowerCase().includes(q) ||
        row.editedBy.toLowerCase().includes(q) ||
        row.createdBy.toLowerCase().includes(q) ||
        row.changesSummary.toLowerCase().includes(q) ||
        teamLabel(row.team).toLowerCase().includes(q) ||
        row.score.toLowerCase().includes(q)
      );
    });
  }, [rows, search, memberFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "editedAt":
          result = compareText(a.editedAt, b.editedAt);
          break;
        case "auditDate":
          result = compareText(a.auditDate, b.auditDate);
          break;
        case "team":
          result = compareText(teamLabel(a.team), teamLabel(b.team));
          break;
        case "agentName":
          result = compareText(a.agentName, b.agentName);
          break;
        case "createdBy":
          result = compareText(a.createdBy, b.createdBy);
          break;
        case "editedBy":
          result = compareText(a.editedBy, b.editedBy);
          break;
        case "score":
          result = compareNumber(a.score, b.score);
          break;
        case "changes":
          result = compareText(
            a.action === "delete" ? "Audit deleted" : a.changesSummary,
            b.action === "delete" ? "Audit deleted" : b.changesSummary,
          );
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, memberFilter]);

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
    <main className="tt-page" aria-label="QA team tracking">
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
                placeholder="Search agent, editor, changes…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>

          <FilterSelect
            label="QA team member"
            value={memberFilter}
            options={memberOptions}
            onChange={setMemberFilter}
          />
        </div>
      </div>

      <section className="tt-page__table-wrap" aria-label="QA team tracking table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table tt-table">
              <thead>
                <tr>
                  <SortHeader
                    label="Date and time"
                    active={sortKey === "editedAt"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "editedAt", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Audit date"
                    active={sortKey === "auditDate"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "auditDate", "desc");
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
                    label="Agent name"
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
                    label="Created by"
                    active={sortKey === "createdBy"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "createdBy", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="By"
                    active={sortKey === "editedBy"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "editedBy", "asc");
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
                    label="Changes"
                    active={sortKey === "changes"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "changes", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <th scope="col" className="cases-table__actions-col">
                    <span className="data-table__th-static">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="audits-table__empty">
                      No audit activity logged yet. Edit or delete an audit to see it here.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.id} className="audits-table__row">
                      <td>{formatEditedAt(row.editedAt)}</td>
                      <td>{formatAuditDate(row.auditDate)}</td>
                      <td>{teamLabel(row.team)}</td>
                      <td>{row.agentName}</td>
                      <td>{row.createdBy || "—"}</td>
                      <td>{row.editedBy}</td>
                      <td>{row.score || "—"}</td>
                      <td className="tt-table__changes">
                        {row.action === "delete" ? (
                          <span className="tt-table__badge tt-table__badge--delete">Audit deleted</span>
                        ) : (
                          row.changesSummary
                        )}
                      </td>
                      <td className="cases-table__actions-col">
                        <RowActions onView={() => setViewing(row)} />
                      </td>
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

      <ViewLogModal
        open={Boolean(viewing)}
        record={viewing}
        onClose={() => setViewing(null)}
      />
    </main>
  );
}
