import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { DateRangePicker } from "../../components/DateRangePicker";
import { useConfirmDelete } from "../../components/ConfirmDeleteContext";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import { TableRowActions } from "../../components/table/TableRowActions";
import {
  BulkDeleteButton,
  RowCheckboxCell,
  SelectAllCheckbox,
} from "../../components/table/TableSelection";
import { useRowSelection } from "../../hooks/useRowSelection";
import { useScopedTeamFilter } from "../../hooks/useScopedTeamFilter";
import { listAgents, matchesAgentSearch } from "../../lib/audits";
import {
  coachingInRange,
  createCoachingSession,
  deleteCoachingSession,
  downloadCoachingTemplate,
  emptyCoachingDraft,
  formatSessionDate,
  importCoachingSessions,
  listCoachingSessions,
  listQaNames,
  parseCoachingImportFile,
  todayIsoDate,
  updateCoachingSession,
  type CoachingDraft,
  type CoachingSession,
} from "../../lib/coaching";
import { type DateRange } from "../../lib/dateRange";
import { fetchAgents, fetchCoaching } from "../../lib/externalApi";
import { defaultPortalRange } from "../../lib/portalRange";
import { applyDir, compareText, nextSortState } from "../../lib/tableSort";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import { useNotify } from "../../notifications/NotificationContext";

const PAGE_SIZE = 30;

type SortKey = "agentName" | "topic" | "qualityName" | "sessionDate";

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
  const labelId = `coach-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

function AgentSearch({
  selectedId,
  selectedName,
  onSelect,
}: {
  selectedId: string;
  selectedName: string;
  onSelect: (agent: { id: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState(() => listAgents());
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [team] = useScopedTeamFilter("all");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingAgents(true);
    void fetchAgents({ team })
      .then((payload) => {
        if (cancelled) return;
        if (payload.connected && payload.agents.length > 0) {
          setAgents(payload.agents);
        } else {
          setAgents(listAgents());
        }
      })
      .catch(() => {
        if (!cancelled) setAgents(listAgents());
      })
      .finally(() => {
        if (!cancelled) setLoadingAgents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [team]);

  const matches = useMemo(() => {
    if (!query.trim()) return agents;
    return agents.filter((agent) => matchesAgentSearch(agent, query));
  }, [agents, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = selectedName.trim().length > 0;

  return (
    <div className="audits-agent-search" ref={rootRef}>
      <span className="audits-field__label" id="coach-agent-search">
        Agent name
      </span>
      <div className={`audits-search__field${open ? " is-open" : ""}`}>
        <svg className="audits-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          className="audits-search__input"
          type="search"
          aria-labelledby="coach-agent-search"
          placeholder="Search by name or alias…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {selected ? (
        <div className="audits-agent-selected">
          <div className="audits-agent-selected__text">
            <span className="audits-agent-selected__name">{selectedName}</span>
            {selectedId ? <span className="audits-agent-selected__alias">{selectedId}</span> : null}
          </div>
          <button
            type="button"
            className="audits-agent-selected__clear"
            onClick={() => {
              onSelect({ id: "", name: "" });
              setQuery("");
            }}
          >
            Change
          </button>
        </div>
      ) : null}

      {open && !selected ? (
        <div className="audits-agent-search__menu" role="listbox">
          {loadingAgents ? (
            <p className="audits-filter__empty">Loading agents…</p>
          ) : matches.length === 0 ? (
            query.trim() ? (
              <button
                type="button"
                role="option"
                className="audits-agent-search__option"
                onClick={() => {
                  onSelect({ id: "", name: query.trim() });
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="audits-agent-search__name">Use “{query.trim()}”</span>
                <span className="audits-agent-search__meta">Custom name</span>
              </button>
            ) : (
              <p className="audits-filter__empty">Type to search agents</p>
            )
          ) : (
            matches.map((agent) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                className={`audits-agent-search__option${agent.id === selectedId ? " is-active" : ""}`}
                onClick={() => {
                  onSelect({ id: agent.id, name: agent.name });
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="audits-agent-search__name">{agent.name}</span>
                <span className="audits-agent-search__meta">{agent.alias}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function RowActions({
  onEdit,
  onView,
  onDelete,
}: {
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRowActions
      label="Coaching actions"
      items={[
        { label: "View", onClick: onView },
        { label: "Edit", onClick: onEdit },
        { label: "Delete", onClick: onDelete, danger: true },
      ]}
    />
  );
}

function ImportCoachingModal({
  open,
  qualityName,
  onClose,
  onImported,
}: {
  open: boolean;
  qualityName: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const { notify } = useNotify();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewCount, setPreviewCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreviewCount(0);
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

  const loadFile = async (next: File | null) => {
    if (!next) {
      setFile(null);
      setPreviewCount(0);
      return;
    }
    const lower = next.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      notify("Choose a .csv or .xlsx file.", { variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const drafts = await parseCoachingImportFile(next);
      setFile(next);
      setPreviewCount(drafts.length);
      if (drafts.length === 0) {
        notify("No valid coaching rows found in that file.", { variant: "error" });
      }
    } catch {
      notify("Could not read that file.", { variant: "error" });
      setFile(null);
      setPreviewCount(0);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const drafts = await parseCoachingImportFile(file);
      const agents = listAgents().map((agent) => ({ id: agent.id, name: agent.name }));
      const result = await importCoachingSessions(drafts, {
        defaultQualityName: qualityName,
        agents,
      });
      if (result.created === 0) {
        notify(
          result.errors[0] || "Nothing was imported. Check the template columns.",
          { variant: "error" },
        );
        return;
      }
      notify(
        result.skipped > 0
          ? `Imported ${result.created} · skipped ${result.skipped}.`
          : `Imported ${result.created} coaching session${result.created === 1 ? "" : "s"}.`,
        { variant: "success" },
      );
      onImported();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Import failed.", {
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog coach-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="coach-import-title" className="cases-modal__title">
              Import coaching
            </h2>
            <p className="cases-modal__subtitle">
              Download the template, fill rows, then upload a .csv or .xlsx file.
            </p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cases-modal__body coach-import-body">
          <div
            className="coach-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.files?.[0] ?? null;
              void loadFile(dropped);
            }}
          >
            <p className="coach-dropzone__title">Drop a coaching file here</p>
            <p className="coach-dropzone__hint">
              Columns: Agent Name, Agent ID, Quality Name, Session Date, Coaching Topic
            </p>
            <div className="coach-dropzone__actions">
              <button
                type="button"
                className="cases-btn cases-btn--primary"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                Choose file
              </button>
              <button
                type="button"
                className="cases-btn cases-btn--ghost"
                onClick={() => downloadCoachingTemplate()}
              >
                Download template
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(event) => {
                void loadFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </div>

          {file ? (
            <p className="coach-import-meta">
              <strong>{file.name}</strong>
              {previewCount > 0
                ? ` · ${previewCount} row${previewCount === 1 ? "" : "s"} ready`
                : " · no valid rows yet"}
            </p>
          ) : null}
        </div>

        <footer className="coach-import-footer">
          <button type="button" className="cases-btn cases-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="cases-btn cases-btn--primary"
            disabled={!file || previewCount === 0 || busy}
            onClick={() => void handleImport()}
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CoachingFormModal({
  open,
  initial,
  qualityName,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: CoachingSession | null;
  qualityName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useNotify();
  const [draft, setDraft] = useState<CoachingDraft>(() => emptyCoachingDraft(qualityName));
  const editing = Boolean(initial);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        agentId: initial.agentId,
        agentName: initial.agentName,
        qualityName: initial.qualityName || qualityName,
        sessionDate: initial.sessionDate || todayIsoDate(),
        topic: initial.topic,
      });
    } else {
      setDraft(emptyCoachingDraft(qualityName));
    }
  }, [open, initial, qualityName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const patch = (partial: Partial<CoachingDraft>) => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const canSave =
    draft.agentName.trim().length > 0 &&
    draft.topic.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) {
      notify("Agent name and coaching topic are required.", { variant: "error" });
      return;
    }
    const payload = {
      ...draft,
      qualityName: qualityName || draft.qualityName,
      sessionDate: draft.sessionDate || todayIsoDate(),
    };
    try {
      if (initial) {
        await updateCoachingSession(initial.id, payload);
        notify("Coaching session updated.", { variant: "success" });
      } else {
        await createCoachingSession(payload);
        notify("Coaching session added.", { variant: "success" });
      }
      onSaved();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save coaching.", {
        variant: "error",
      });
    }
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog coach-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="coach-form-title" className="cases-modal__title">
              {editing ? "Edit coaching" : "Add coaching"}
            </h2>
            <p className="cases-modal__subtitle">Record a coaching session</p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cases-modal__body">
          <div className="coach-form-grid">
            <div className="coach-span-2">
              <AgentSearch
                selectedId={draft.agentId}
                selectedName={draft.agentName}
                onSelect={(agent) => patch({ agentId: agent.id, agentName: agent.name })}
              />
            </div>

            <label className="cases-field">
              <span className="cases-field__label">Quality name</span>
              <input
                className="cases-field__control cases-field__control--readonly"
                type="text"
                value={qualityName || draft.qualityName}
                readOnly
                aria-readonly="true"
                title="Filled from your account"
              />
            </label>

            <label className="cases-field">
              <span className="cases-field__label">Session date</span>
              <input
                className="cases-field__control cases-field__control--readonly"
                type="text"
                value={formatSessionDate(draft.sessionDate || todayIsoDate())}
                readOnly
                aria-readonly="true"
                title="Set automatically"
              />
            </label>

            <label className="cases-field coach-span-2">
              <span className="cases-field__label">Coaching topic</span>
              <textarea
                className="cases-field__control coach-textarea"
                rows={4}
                value={draft.topic}
                placeholder="What was covered in this session…"
                onChange={(event) => patch({ topic: event.target.value })}
              />
            </label>
          </div>
        </div>

        <footer className="cases-wizard-footer">
          <button
            type="button"
            className="cases-btn cases-btn--primary"
            disabled={!canSave}
            onClick={handleSave}
          >
            {editing ? "Save changes" : "Add coaching"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ViewModal({
  open,
  record,
  onClose,
}: {
  open: boolean;
  record: CoachingSession | null;
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
        className="cases-modal__dialog coach-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-view-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="coach-details__header">
          <div className="coach-details__heading">
            <p className="coach-details__eyebrow">Coaching</p>
            <h2 id="coach-view-title" className="coach-details__title">
              {record.agentName || "Agent"}
            </h2>
            <p className="coach-details__sub">
              {formatSessionDate(record.sessionDate)}
              {record.qualityName ? ` · ${record.qualityName}` : ""}
            </p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="coach-details__body">
          <div className="coach-details__meta">
            <div>
              <span>Agent</span>
              <strong>{record.agentName || "—"}</strong>
            </div>
            <div>
              <span>Quality name</span>
              <strong>{record.qualityName || "—"}</strong>
            </div>
            <div>
              <span>Session date</span>
              <strong>{formatSessionDate(record.sessionDate)}</strong>
            </div>
          </div>

          <section className="coach-details__block" aria-label="Coaching topic">
            <span>Coaching topic</span>
            <p>{record.topic || "No topic recorded."}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function CoachingPage() {
  const { user } = useAuth();
  const { notify } = useNotify();
  const { confirmDelete } = useConfirmDelete();
  const qualityName = user?.full_name?.trim() || user?.username || "";

  const [search, setSearch] = useState("");
  const [qaFilter, setQaFilter] = useState("all");
  const [team] = useScopedTeamFilter("all");
  const [range, setRange] = useState<DateRange>(() => defaultPortalRange());
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("sessionDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [rows, setRows] = useState<CoachingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<CoachingSession | null>(null);
  const [viewing, setViewing] = useState<CoachingSession | null>(null);

  useShellPageLoading(loading);

  useEffect(() => {
    if (!actionsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsOpen]);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await fetchCoaching({ team, search, limit: 2000 });
      if (payload.connected) {
        const live = payload.items.map((raw) => {
          const row = raw as Partial<CoachingSession> & { id?: string };
          return {
            id: String(row.id || ""),
            agentId: String(row.agentId || ""),
            agentName: String(row.agentName || ""),
            qualityName: String(row.qualityName || ""),
            sessionDate: String(row.sessionDate || ""),
            topic: String(row.topic || ""),
            createdAt: String(row.createdAt || ""),
            updatedAt: String(row.updatedAt || row.createdAt || ""),
          } satisfies CoachingSession;
        });
        setRows(live);
      } else {
        setRows(listCoachingSessions());
      }
    } catch {
      setRows(listCoachingSessions());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, team]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, team]);

  const qaOptions = useMemo(() => {
    const names = new Set(listQaNames());
    if (qualityName) names.add(qualityName);
    for (const row of rows) {
      if (row.qualityName.trim()) names.add(row.qualityName.trim());
    }
    return [
      { id: "all", label: "All QAs" },
      ...Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ id: name, label: name })),
    ];
  }, [rows, qualityName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (qaFilter !== "all" && row.qualityName !== qaFilter) return false;
      if (!coachingInRange(row.sessionDate, range.start, range.end)) return false;
      if (!q) return true;
      return (
        row.agentName.toLowerCase().includes(q) ||
        row.topic.toLowerCase().includes(q) ||
        row.qualityName.toLowerCase().includes(q)
      );
    });
  }, [rows, search, qaFilter, range.start, range.end]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "agentName":
          result = compareText(a.agentName, b.agentName);
          break;
        case "topic":
          result = compareText(a.topic, b.topic);
          break;
        case "qualityName":
          result = compareText(a.qualityName, b.qualityName);
          break;
        case "sessionDate":
          result = compareText(a.sessionDate, b.sessionDate);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, qaFilter, range.start, range.end]);

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

  const handleDelete = async (row: CoachingSession) => {
    const ok = await confirmDelete({
      title: `Delete coaching for “${row.agentName}”?`,
      description: row.topic || "This coaching session will be removed.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await deleteCoachingSession(row.id);
    void refresh();
    notify("Coaching session deleted.", { variant: "success" });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const ok = await confirmDelete({
      title: count === 1 ? "Delete 1 coaching session?" : `Delete ${count} coaching sessions?`,
      description:
        count === 1
          ? "This coaching session will be permanently removed."
          : "These coaching sessions will be permanently removed.",
      confirmLabel: count === 1 ? "Delete coaching session" : "Delete coaching sessions",
    });
    if (!ok) return;
    await Promise.all(selectedIds.map((id) => deleteCoachingSession(id)));
    clearSelection();
    void refresh();
    notify(
      count === 1 ? "1 coaching session deleted." : `${count} coaching sessions deleted.`,
      { variant: "success" },
    );
  };

  return (
    <main className="coach-page" aria-label="Coaching">
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
                placeholder="Search agent, topic…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>

          <FilterSelect
            label="QA agent name"
            value={qaFilter}
            options={qaOptions}
            onChange={setQaFilter}
          />

          <BulkDeleteButton
            count={selectedIds.length}
            onClick={() => void handleDeleteSelected()}
            noun="coaching sessions"
          />
        </div>

        <div className="coach-toolbar-right">
          <DateRangePicker value={range} onChange={setRange} />
          <div className="audits-actions" ref={actionsRef}>
            <button
              type="button"
              className={`cases-add-btn coach-actions-trigger${actionsOpen ? " is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((open) => !open)}
            >
              Actions
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <polyline
                  points="6 9 12 15 18 9"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {actionsOpen ? (
              <div className="audits-actions__menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="audits-actions__item"
                  onClick={() => {
                    setActionsOpen(false);
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Add coaching
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="audits-actions__item"
                  onClick={() => {
                    setActionsOpen(false);
                    setImportOpen(true);
                  }}
                >
                  Import coaching
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <section className="coach-page__table-wrap" aria-label="Coaching table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table coach-table">
              <thead>
                <tr>
                  <SelectAllCheckbox
                    allSelected={allPageSelected}
                    someSelected={somePageSelected}
                    onToggle={toggleAllPage}
                    disabled={pageRows.length === 0}
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
                    label="Coaching topic"
                    active={sortKey === "topic"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "topic", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Quality name"
                    active={sortKey === "qualityName"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "qualityName", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Session date"
                    active={sortKey === "sessionDate"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "sessionDate", "desc");
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
                    <td colSpan={6} className="audits-table__empty">
                      No coaching sessions found. Add a session to get started.
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
                          label={`Select coaching for ${row.agentName}`}
                        />
                        <td>{row.agentName}</td>
                        <td className="coach-table__topic">{row.topic}</td>
                        <td>{row.qualityName || "—"}</td>
                        <td>{formatSessionDate(row.sessionDate)}</td>
                        <td className="cases-table__actions-col">
                          <RowActions
                            onEdit={() => {
                              setEditing(row);
                              setFormOpen(true);
                            }}
                            onView={() => setViewing(row)}
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

      <CoachingFormModal
        open={formOpen}
        initial={editing}
        qualityName={qualityName}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => { void refresh(); }}
      />
      <ImportCoachingModal
        open={importOpen}
        qualityName={qualityName}
        onClose={() => setImportOpen(false)}
        onImported={() => { void refresh(); }}
      />
      <ViewModal
        open={Boolean(viewing)}
        record={viewing}
        onClose={() => setViewing(null)}
      />
    </main>
  );
}
