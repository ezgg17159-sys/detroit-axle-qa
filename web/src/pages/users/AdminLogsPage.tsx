import { useEffect, useMemo, useRef, useState } from "react";

import { useShellPageLoading } from "../../components/PageLoadingContext";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import { TableRowActions } from "../../components/table/TableRowActions";
import {
  fetchActivityLogs,
  type ActivityLogItem,
} from "../../lib/externalApi";
import {
  applyDir,
  compareText,
  nextSortState,
} from "../../lib/tableSort";

const PAGE_SIZE = 40;

type SortKey = "createdAt" | "actor" | "action" | "entity" | "summary";

const ENTITY_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All types" },
  { id: "audit", label: "Audits" },
  { id: "case-type", label: "Case types" },
  { id: "metric", label: "Metrics" },
  { id: "monitoring", label: "Monitoring" },
  { id: "production", label: "Production" },
  { id: "agent-feedback", label: "Agent feedback" },
  { id: "supervisor-request", label: "Supervisor requests" },
  { id: "coaching", label: "Coaching" },
  { id: "managed-user", label: "Managed users" },
  { id: "role-permissions", label: "Permissions" },
  { id: "day-off", label: "Day off" },
  { id: "scheduled-day-off", label: "Scheduled day off" },
  { id: "power-automate", label: "Power Automate" },
  { id: "auth", label: "Sign-in / auth" },
];

function formatWhen(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function badgeClass(action: string): string {
  const key = action.toLowerCase();
  if (key === "create") return "al-table__badge--create";
  if (key === "update") return "al-table__badge--update";
  if (key === "delete") return "al-table__badge--delete";
  if (key === "login") return "al-table__badge--login";
  if (key === "logout") return "al-table__badge--logout";
  if (key === "login-failed") return "al-table__badge--login-failed";
  return "al-table__badge--update";
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value)?.label ?? value;
  const labelId = `al-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

function LogDetailModal({
  open,
  record,
  onClose,
}: {
  open: boolean;
  record: ActivityLogItem | null;
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

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog al-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="al-view-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="al-details__header">
          <div>
            <p className="al-details__eyebrow">Activity log</p>
            <h2 id="al-view-title" className="al-details__title">
              {record.summary || "Action"}
            </h2>
            <p className="al-details__sub">{formatWhen(record.createdAt)}</p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="al-details__body">
          <div className="al-details__meta">
            <div>
              <span>Actor</span>
              <strong>{record.actorName || "—"}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{record.actorEmail || "—"}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{record.actorRole || "—"}</strong>
            </div>
            <div>
              <span>Action</span>
              <strong>{record.action || "—"}</strong>
            </div>
            <div>
              <span>Entity</span>
              <strong>
                {record.entityType || "—"}
                {record.entityId ? ` · ${record.entityId}` : ""}
              </strong>
            </div>
            <div>
              <span>Team</span>
              <strong>{record.team || "—"}</strong>
            </div>
            <div>
              <span>Request</span>
              <strong>
                {record.requestMethod || "—"} {record.requestPath || ""}
              </strong>
            </div>
            <div>
              <span>IP</span>
              <strong>{record.ipAddress || "—"}</strong>
            </div>
          </div>

          <section aria-label="Request detail">
            <span className="al-details__eyebrow">Detail</span>
            <pre className="al-details__json">
              {JSON.stringify(record.detail ?? {}, null, 2)}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}

export function AdminLogsPage() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [rows, setRows] = useState<ActivityLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<ActivityLogItem | null>(null);

  useShellPageLoading(loading);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchActivityLogs({
        search,
        entityType: entityFilter === "all" ? "" : entityFilter,
        limit: 500,
        offset: 0,
      });
      if (!payload.connected) {
        setRows([]);
        setTotal(0);
        setError(payload.detail || "Activity logs are unavailable.");
        return;
      }
      setRows(payload.items);
      setTotal(payload.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "Failed to load activity logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, entityFilter]);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "createdAt":
          result = compareText(a.createdAt, b.createdAt);
          break;
        case "actor":
          result = compareText(a.actorName || a.actorEmail, b.actorName || b.actorEmail);
          break;
        case "action":
          result = compareText(a.action, b.action);
          break;
        case "entity":
          result = compareText(a.entityType, b.entityType);
          break;
        case "summary":
          result = compareText(a.summary, b.summary);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [rows, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, entityFilter]);

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
    <main className="al-page" aria-label="Activity logs">
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
                placeholder="Search actor, action, entity…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>

          <FilterSelect
            label="Type"
            value={entityFilter}
            options={ENTITY_OPTIONS}
            onChange={setEntityFilter}
          />
        </div>
      </div>

      <section className="al-page__table-wrap" aria-label="Activity logs table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table al-table">
              <thead>
                <tr>
                  <SortHeader
                    label="When"
                    active={sortKey === "createdAt"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "createdAt", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Actor"
                    active={sortKey === "actor"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "actor", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Action"
                    active={sortKey === "action"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "action", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Entity"
                    active={sortKey === "entity"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "entity", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Summary"
                    active={sortKey === "summary"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "summary", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <th scope="col" className="cases-table__actions-col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="audits-table__empty">
                      {loading
                        ? "Loading…"
                        : error || (total === 0 ? "No activity logged yet." : "No matching logs.")}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.id} className="audits-table__row">
                      <td>{formatWhen(row.createdAt)}</td>
                      <td>
                        <div>{row.actorName || "—"}</div>
                        {row.actorEmail || row.actorRole ? (
                          <div className="al-table__sub">{row.actorEmail || row.actorRole}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`al-table__badge ${badgeClass(row.action)}`}>
                          {row.action || "—"}
                        </span>
                      </td>
                      <td>
                        <div>{row.entityType || "—"}</div>
                        {row.entityId ? <div className="al-table__sub">{row.entityId}</div> : null}
                      </td>
                      <td className="al-table__summary" title={row.summary}>
                        {row.summary || "—"}
                      </td>
                      <td className="cases-table__actions-col">
                        <TableRowActions
                          label="Log actions"
                          items={[{ label: "View", onClick: () => setViewing(row) }]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="data-table-footer" aria-label="Table pagination">
            <span className="data-table-footer__meta">
              {totalRows === 0
                ? "0 results"
                : `Showing ${rangeStart}–${rangeEnd} of ${totalRows}${total > totalRows ? ` (${total} total)` : ""} · ${PAGE_SIZE} per page`}
            </span>
            <nav className="data-table-pager" aria-label="Pages">
              <button
                type="button"
                className="data-table-pager__btn"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              {pageItems.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`e-${index}`} className="data-table-pager__ellipsis">
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
            </nav>
          </footer>
        </div>
      </section>

      <LogDetailModal open={Boolean(viewing)} record={viewing} onClose={() => setViewing(null)} />
    </main>
  );
}
