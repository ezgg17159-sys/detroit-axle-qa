import { useEffect, useMemo, useRef, useState } from "react";

import { useConfirmDelete } from "../../components/ConfirmDeleteContext";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import { TableRowActions } from "../../components/table/TableRowActions";
import {
  BulkDeleteButton,
  RowCheckboxCell,
  SelectAllCheckbox,
} from "../../components/table/TableSelection";
import { useRowSelection } from "../../hooks/useRowSelection";
import { useScopedTeamFilter } from "../../hooks/useScopedTeamFilter";
import { TEAM_OPTIONS, teamLabel, type AuditTeam } from "../../lib/audits";
import { deleteCaseType, listCaseTypes, type CaseTypeRecord } from "../../lib/caseTypes";
import { deleteCaseTypeRemote, fetchCaseTypes } from "../../lib/externalApi";
import {
  applyDir,
  compareBool,
  compareText,
  nextSortState,
} from "../../lib/tableSort";
import { useNotify } from "../../notifications/NotificationContext";
import { CaseTypeFormModal } from "./CaseTypeFormModal";

const PAGE_SIZE = 30;

type SortKey = "name" | "team" | "active";

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
  const labelId = `case-types-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

function FlagCell({ on }: { on: boolean }) {
  return (
    <span className={`cases-flag${on ? " is-on" : ""}`}>
      {on ? "Yes" : "No"}
    </span>
  );
}

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRowActions
      label="Case actions"
      items={[
        { label: "Edit", onClick: onEdit },
        { label: "Delete", onClick: onDelete, danger: true },
      ]}
    />
  );
}

export function CaseTypesPage() {
  const { notify } = useNotify();
  const { confirmDelete } = useConfirmDelete();
  const [search, setSearch] = useState("");
  const [team, setTeam, teamScope] = useScopedTeamFilter("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [rows, setRows] = useState<CaseTypeRecord[]>([]);
  const [liveIds, setLiveIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CaseTypeRecord | null>(null);

  useShellPageLoading(loading);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await fetchCaseTypes({ team: team === "all" ? "all" : team });
      if (payload.connected) {
        const live = payload.caseTypes;
        const liveIdSet = new Set(live.map((row) => row.id));
        setLiveIds(liveIdSet);
        setRows(live);
      } else {
        setLiveIds(new Set());
        setRows(listCaseTypes());
      }
    } catch {
      setLiveIds(new Set());
      setRows(listCaseTypes());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (team !== "all" && row.team && row.team !== team) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.team ? teamLabel(row.team as AuditTeam).toLowerCase().includes(q) : false)
      );
    });
  }, [rows, search, team]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "name":
          result = compareText(a.name, b.name);
          break;
        case "team":
          result = compareText(
            a.team ? teamLabel(a.team as AuditTeam) : "",
            b.team ? teamLabel(b.team as AuditTeam) : "",
          );
          break;
        case "active":
          result = compareBool(a.active, b.active);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, team]);

  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage],
  );
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
  const pageItems = useMemo(
    () => getPageItems(totalPages, currentPage),
    [totalPages, currentPage],
  );
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalRows);

  const handleDelete = async (row: CaseTypeRecord) => {
    const ok = await confirmDelete({
      title: `Delete “${row.name}”?`,
      description: "This case will be removed from Cases and Metrics.",
      confirmLabel: "Delete case",
    });
    if (!ok) return;
    try {
      if (liveIds.has(row.id)) {
        await deleteCaseTypeRemote(row.id);
      } else {
        deleteCaseType(row.id);
      }
      void refresh();
      notify(`Deleted “${row.name}”.`, { variant: "success" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete case type.", {
        variant: "error",
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const ok = await confirmDelete({
      title: count === 1 ? "Delete 1 case type?" : `Delete ${count} case types?`,
      description:
        count === 1
          ? "This case type will be removed from Cases and Metrics."
          : "These case types will be removed from Cases and Metrics.",
      confirmLabel: count === 1 ? "Delete case type" : "Delete case types",
    });
    if (!ok) return;
    try {
      for (const id of selectedIds) {
        if (liveIds.has(id)) await deleteCaseTypeRemote(id);
        else deleteCaseType(id);
      }
      clearSelection();
      void refresh();
      notify(
        count === 1 ? "1 case type deleted." : `${count} case types deleted.`,
        { variant: "success" },
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete case types.", {
        variant: "error",
      });
    }
  };

  return (
    <main className="cases-page" aria-label="Cases">
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
                placeholder="Search cases…"
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

          <BulkDeleteButton count={selectedIds.length} onClick={() => void handleDeleteSelected()} noun="case types" />
        </div>

        <button
          type="button"
          className="cases-add-btn"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          Add case
        </button>
      </div>

      <section className="cases-page__table-wrap" aria-label="Cases table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table cases-table">
              <thead>
                <tr>
                  <SelectAllCheckbox
                    allSelected={allPageSelected}
                    someSelected={somePageSelected}
                    onToggle={toggleAllPage}
                    disabled={pageRows.length === 0}
                  />
                  <SortHeader
                    label="Name"
                    active={sortKey === "name"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "name", "asc");
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
                    label="Active"
                    active={sortKey === "active"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "active", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <th scope="col" className="cases-table__actions-col">
                    <span className="data-table__th-static">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="audits-table__empty">
                      {loading ? "Loading cases…" : "No cases found. Add a case to get started."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`audits-table__row${isSelected(row.id) ? " is-selected" : ""}`}
                    >
                      <RowCheckboxCell
                        checked={isSelected(row.id)}
                        onToggle={() => toggleRow(row.id)}
                        label={`Select case type ${row.name}`}
                      />
                      <td>{row.name}</td>
                      <td>{row.team ? teamLabel(row.team as AuditTeam) : "—"}</td>
                      <td><FlagCell on={row.active} /></td>
                      <td className="cases-table__actions-col">
                        <RowActions
                          onEdit={() => {
                            setEditing(row);
                            setModalOpen(true);
                          }}
                          onDelete={() => void handleDelete(row)}
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

      <CaseTypeFormModal
        open={modalOpen}
        initial={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          void refresh();
        }}
      />
    </main>
  );
}
