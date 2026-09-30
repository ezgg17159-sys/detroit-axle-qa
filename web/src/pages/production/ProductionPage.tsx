import { useEffect, useMemo, useRef, useState } from "react";

import { useConfirmDelete } from "../../components/ConfirmDeleteContext";
import { DateRangePicker } from "../../components/DateRangePicker";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import { TableRowActions } from "../../components/table/TableRowActions";
import {
  BulkDeleteButton,
  RowCheckboxCell,
  SelectAllCheckbox,
} from "../../components/table/TableSelection";
import { useRowSelection } from "../../hooks/useRowSelection";
import { startOfDay, type DateRange } from "../../lib/dateRange";
import { fetchProduction } from "../../lib/externalApi";
import {
  PRODUCTION_DEPARTMENTS,
  deleteProduction,
  departmentLabel,
  formatMetric,
  listProduction,
  parseDepartment,
  saveProduction,
  type ProductionDepartment,
  type ProductionRecord,
} from "../../lib/production";
import {
  PRODUCTION_TEMPLATE_CSV,
  applyProductionImport,
  buildImportPreview,
  type ImportPreview,
} from "../../lib/productionImport";
import {
  applyDir,
  compareNumber,
  compareText,
  nextSortState,
} from "../../lib/tableSort";
import { useNotify } from "../../notifications/NotificationContext";

const PAGE_SIZE = 30;

type DeptFilter = "all" | ProductionDepartment;
type SortKey =
  | "name"
  | "empId"
  | "vonageId"
  | "department"
  | "calls"
  | "tickets"
  | "sales";

function defaultProductionRange(): DateRange {
  const end = startOfDay(new Date());
  const start = startOfDay(new Date());
  start.setMonth(start.getMonth() - 6);
  return { start, end };
}

function toIsoDay(date: Date | null): string | undefined {
  if (!date) return undefined;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
  const labelId = `prod-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

function RowActions({
  onEditDept,
  onDelete,
}: {
  onEditDept: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRowActions
      label="Production actions"
      items={[
        { label: "Set department", onClick: onEditDept },
        { label: "Delete", onClick: onDelete, danger: true },
      ]}
    />
  );
}

function ImportModal({
  open,
  range,
  onClose,
  onImported,
}: {
  open: boolean;
  range: DateRange;
  onClose: () => void;
  onImported: () => void;
}) {
  const { notify } = useNotify();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setPreview(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const period = {
    start: range.start ? range.start.toISOString().slice(0, 10) : null,
    end: range.end ? range.end.toISOString().slice(0, 10) : null,
  };

  const addFiles = async (list: FileList | File[]) => {
    const next = Array.from(list).filter((file) => {
      const lower = file.name.toLowerCase();
      return lower.endsWith(".csv") || lower.endsWith(".xlsx") || lower.endsWith(".xls");
    });
    if (next.length === 0) {
      notify("Choose .csv or .xlsx files.", { variant: "error" });
      return;
    }
    const merged = [...files];
    for (const file of next) {
      if (!merged.some((item) => item.name === file.name && item.size === file.size)) {
        merged.push(file);
      }
    }
    setFiles(merged);
    setBusy(true);
    try {
      const built = await buildImportPreview(merged, period);
      setPreview(built);
    } catch {
      notify("Could not parse the selected files.", { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([PRODUCTION_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "production-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async () => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    try {
      const result = await applyProductionImport(files, period);
      notify(
        `Imported ${result.created} new · ${result.updated} updated.`,
        { variant: "success" },
      );
      onImported();
      onClose();
    } catch {
      notify("Import failed.", { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog production-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="production-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="production-import-title" className="cases-modal__title">
              Import production
            </h2>
            <p className="cases-modal__subtitle">
              Upload Calls Excel + Tickets CSV together — rows merge by Vonage ID, Emp ID, then name.
            </p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cases-modal__body production-import-body">
          <div
            className="production-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void addFiles(event.dataTransfer.files);
            }}
          >
            <p className="production-dropzone__title">Drop .csv / .xlsx files here</p>
            <p className="production-dropzone__hint">Or browse — you can select multiple files at once.</p>
            <div className="production-dropzone__actions">
              <button
                type="button"
                className="cases-btn cases-btn--primary"
                onClick={() => inputRef.current?.click()}
              >
                Choose files
              </button>
              <button type="button" className="cases-btn cases-btn--ghost" onClick={downloadTemplate}>
                Download template
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>

          {files.length > 0 ? (
            <ul className="production-file-list">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`}>
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="production-file-list__remove"
                    onClick={() => {
                      const next = files.filter((item) => item !== file);
                      setFiles(next);
                      if (next.length === 0) {
                        setPreview(null);
                        return;
                      }
                      void buildImportPreview(next, period).then(setPreview);
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {busy ? <p className="production-import-meta">Parsing…</p> : null}

          {preview ? (
            <div className="production-preview">
              <p className="production-import-meta">
                {preview.summary.totalParsed} employees · {preview.summary.wouldCreate} new ·{" "}
                {preview.summary.wouldUpdate} update
                {preview.summary.nameOnlyMatches > 0
                  ? ` · ${preview.summary.nameOnlyMatches} name-only matches`
                  : ""}
              </p>
              {preview.warnings.length > 0 ? (
                <ul className="production-warnings">
                  {preview.warnings.slice(0, 8).map((warning, index) => (
                    <li key={`${warning.source}-${warning.row}-${index}`}>
                      {warning.source}
                      {warning.row ? ` row ${warning.row}` : ""}: {warning.message}
                    </li>
                  ))}
                  {preview.warnings.length > 8 ? (
                    <li>+{preview.warnings.length - 8} more…</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="cases-wizard-footer">
          <button
            type="button"
            className="cases-btn cases-btn--primary"
            disabled={files.length === 0 || busy || !preview || preview.summary.totalParsed === 0}
            onClick={() => void handleConfirm()}
          >
            Confirm import
          </button>
        </footer>
      </div>
    </div>
  );
}

function DepartmentModal({
  open,
  record,
  onClose,
  onSaved,
}: {
  open: boolean;
  record: ProductionRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useNotify();
  const [department, setDepartment] = useState<ProductionDepartment>("unassigned");

  useEffect(() => {
    if (open && record) setDepartment(record.department);
  }, [open, record]);

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
        className="cases-modal__dialog cases-modal__dialog--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prod-dept-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="prod-dept-title" className="cases-modal__title">
              Set department
            </h2>
            <p className="cases-modal__subtitle">{record.employeeName}</p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="cases-modal__body">
          <div className="cases-wizard-panel">
            <FilterSelect
              label="Department"
              value={department}
              options={PRODUCTION_DEPARTMENTS}
              onChange={setDepartment}
            />
          </div>
        </div>
        <footer className="cases-wizard-footer">
          <button
            type="button"
            className="cases-btn cases-btn--primary"
            onClick={() => {
              saveProduction({ ...record, department });
              notify("Department updated.", { variant: "success" });
              onSaved();
              onClose();
            }}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

export function ProductionPage() {
  const { notify } = useNotify();
  const { confirmDelete } = useConfirmDelete();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<DeptFilter>("all");
  const [range, setRange] = useState<DateRange>(() => defaultProductionRange());
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [rows, setRows] = useState<ProductionRecord[]>([]);
  const [liveIds, setLiveIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionRecord | null>(null);

  useShellPageLoading(loading);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await fetchProduction({
        start: toIsoDay(range.start),
        end: toIsoDay(range.end),
        department: department === "all" ? "all" : department,
        search,
      });
      if (payload.connected) {
        const live = payload.items.map((row) => ({
          id: row.id,
          employeeName: row.employeeName,
          employeeId: row.employeeId,
          vonageId: row.vonageId,
          department: parseDepartment(row.department) ?? "unassigned",
          callsHandled: row.callsHandled,
          tickets: row.tickets,
          sales: row.sales,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          updatedAt: row.updatedAt,
        }));
        const liveIdSet = new Set(live.map((row) => row.id));
        setLiveIds(liveIdSet);
        setRows(live);
      } else {
        setLiveIds(new Set());
        setRows(listProduction());
      }
    } catch {
      setLiveIds(new Set());
      setRows(listProduction());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, department, search]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, department, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (department !== "all" && row.department !== department) return false;
      if (!q) return true;
      return (
        row.employeeName.toLowerCase().includes(q) ||
        row.employeeId.toLowerCase().includes(q) ||
        row.vonageId.toLowerCase().includes(q) ||
        departmentLabel(row.department).toLowerCase().includes(q)
      );
    });
  }, [rows, search, department]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "name":
          result = compareText(a.employeeName, b.employeeName);
          break;
        case "empId":
          result = compareText(a.employeeId, b.employeeId);
          break;
        case "vonageId":
          result = compareText(a.vonageId, b.vonageId);
          break;
        case "department":
          result = compareText(departmentLabel(a.department), departmentLabel(b.department));
          break;
        case "calls":
          result = compareNumber(a.callsHandled, b.callsHandled);
          break;
        case "tickets":
          result = compareNumber(a.tickets, b.tickets);
          break;
        case "sales":
          result = compareNumber(a.sales, b.sales);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, department, range.start, range.end]);

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

  const handleDelete = async (row: ProductionRecord) => {
    if (liveIds.has(row.id)) {
      notify("Live production rows can’t be deleted here.", { variant: "error" });
      return;
    }
    const ok = await confirmDelete({
      title: `Delete “${row.employeeName}”?`,
      description: "This production row will be removed from the table.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    deleteProduction(row.id);
    void refresh();
    notify(`Deleted “${row.employeeName}”.`, { variant: "success" });
  };

  const handleDeleteSelected = async () => {
    const deletable = selectedIds.filter((id) => !liveIds.has(id));
    if (deletable.length === 0) {
      notify("Selected production rows are from the live database and can’t be deleted here.", {
        variant: "error",
      });
      return;
    }
    const count = deletable.length;
    const ok = await confirmDelete({
      title: count === 1 ? "Delete 1 production record?" : `Delete ${count} production records?`,
      description:
        count === 1
          ? "This production record will be permanently removed from the list."
          : "These production records will be permanently removed from the list.",
      confirmLabel: count === 1 ? "Delete production record" : "Delete production records",
    });
    if (!ok) return;
    deletable.forEach((id) => deleteProduction(id));
    clearSelection();
    void refresh();
    notify(
      count === 1 ? "1 production record deleted." : `${count} production records deleted.`,
      { variant: "success" },
    );
  };

  return (
    <main className="production-page" aria-label="Production">
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
                placeholder="Search name, Emp ID, Vonage…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>

          <FilterSelect
            label="Department"
            value={department}
            options={[
              { id: "all" as const, label: "All departments" },
              ...PRODUCTION_DEPARTMENTS,
            ]}
            onChange={setDepartment}
          />

          <BulkDeleteButton
            count={selectedIds.length}
            onClick={() => void handleDeleteSelected()}
            noun="production records"
          />
        </div>

        <div className="production-toolbar-right">
          <DateRangePicker value={range} onChange={setRange} />
          <button type="button" className="cases-add-btn" onClick={() => setImportOpen(true)}>
            Import
          </button>
        </div>
      </div>

      <section className="production-page__table-wrap" aria-label="Production table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table production-table">
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
                    label="Emp ID"
                    active={sortKey === "empId"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "empId", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Vonage ID"
                    active={sortKey === "vonageId"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "vonageId", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Department"
                    active={sortKey === "department"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "department", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Calls"
                    active={sortKey === "calls"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "calls", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Tickets"
                    active={sortKey === "tickets"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "tickets", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Sales"
                    active={sortKey === "sales"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "sales", "desc");
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
                      {loading
                        ? "Loading production…"
                        : "No production records for this date range. Try expanding the range, or import Calls / Tickets files."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const checked = isSelected(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={`audits-table__row${checked ? " is-selected" : ""}`}
                      >
                        <RowCheckboxCell
                          checked={checked}
                          onToggle={() => toggleRow(row.id)}
                          label={`Select production record for ${row.employeeName}`}
                        />
                        <td>{row.employeeName}</td>
                        <td>{row.employeeId || "—"}</td>
                        <td>{row.vonageId || "—"}</td>
                        <td>{departmentLabel(row.department)}</td>
                        <td>{formatMetric(row.callsHandled)}</td>
                        <td>{formatMetric(row.tickets)}</td>
                        <td>{formatMetric(row.sales)}</td>
                        <td className="cases-table__actions-col">
                          <RowActions
                            onEditDept={() => setEditing(row)}
                            onDelete={() => void handleDelete(row)}
                          />
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

      <ImportModal
        open={importOpen}
        range={range}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void refresh();
        }}
      />
      <DepartmentModal
        open={Boolean(editing)}
        record={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          void refresh();
        }}
      />
    </main>
  );
}
