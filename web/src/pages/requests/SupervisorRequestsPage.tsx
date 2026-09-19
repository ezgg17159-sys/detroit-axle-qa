import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { useConfirmDelete } from "../../components/ConfirmDeleteContext";
import { TableRowActions } from "../../components/table/TableRowActions";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import {
  BulkDeleteButton,
  RowCheckboxCell,
  SelectAllCheckbox,
} from "../../components/table/TableSelection";
import { useRowSelection } from "../../hooks/useRowSelection";
import { useScopedTeamFilter } from "../../hooks/useScopedTeamFilter";
import { TEAM_OPTIONS, listAgents, matchesAgentSearch, type AuditTeam } from "../../lib/audits";
import { listCaseTypes } from "../../lib/caseTypes";
import {
  REQUEST_PRIORITY_OPTIONS,
  REQUEST_STATUS_OPTIONS,
  addQaReply,
  createSupervisorRequest,
  deleteSupervisorRequest,
  emptyRequestDraft,
  formatRequestDate,
  listSupervisorRequests,
  priorityLabel,
  statusLabel,
  teamLabel,
  updateSupervisorRequest,
  type RequestStatus,
  type SupervisorRequest,
  type SupervisorRequestDraft,
} from "../../lib/supervisorRequests";
import { fetchSupervisorRequests } from "../../lib/externalApi";
import { applyDir, compareText, nextSortState } from "../../lib/tableSort";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import { useNotify } from "../../notifications/NotificationContext";

const PAGE_SIZE = 30;

type StatusFilter = "all" | RequestStatus;
type SortKey = "case" | "agentName" | "type" | "priority" | "status" | "requester";

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
  const labelId = `sr-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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
  team,
  selectedId,
  selectedName,
  onSelect,
}: {
  team: AuditTeam;
  selectedId: string;
  selectedName: string;
  onSelect: (agent: { id: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const agents = useMemo(() => listAgents().filter((agent) => agent.team === team), [team]);

  const matches = useMemo(() => {
    if (!query.trim()) return agents;
    return agents.filter((agent) => matchesAgentSearch(agent, query));
  }, [agents, query]);

  useEffect(() => {
    setQuery("");
    setOpen(false);
  }, [team]);

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
      <span className="audits-field__label" id="sr-agent-search">
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
          aria-labelledby="sr-agent-search"
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
          {matches.length === 0 ? (
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
      label="Request actions"
      items={[
        { label: "View", onClick: onView },
        { label: "Edit", onClick: onEdit },
        { label: "Delete", onClick: onDelete, danger: true },
      ]}
    />
  );
}

function RequestFormModal({
  open,
  initial,
  requesterName,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: SupervisorRequest | null;
  requesterName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useNotify();
  const [draft, setDraft] = useState<SupervisorRequestDraft>(() => emptyRequestDraft(requesterName));
  const editing = Boolean(initial);
  const caseTypeOptions = useMemo(() => {
    const fromStore = listCaseTypes()
      .filter((row) => row.active)
      .map((row) => ({ id: row.name, label: row.name }));
    if (fromStore.length > 0) return fromStore;
    return [
      { id: "Order inquiry", label: "Order inquiry" },
      { id: "Shipping delay", label: "Shipping delay" },
      { id: "Refund request", label: "Refund request" },
      { id: "Other", label: "Other" },
    ];
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        caseReference: initial.caseReference,
        caseType: initial.caseType,
        agentId: initial.agentId,
        agentName: initial.agentName,
        requesterName: initial.requesterName,
        priority: initial.priority,
        team: initial.team,
        note: initial.note,
        status: initial.status,
      });
    } else {
      const draft = emptyRequestDraft(requesterName);
      const firstType = caseTypeOptions[0]?.id ?? "";
      setDraft({ ...draft, caseType: firstType });
    }
  }, [open, initial, requesterName, caseTypeOptions]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const patch = (partial: Partial<SupervisorRequestDraft>) => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const canSave =
    draft.caseReference.trim().length > 0 &&
    draft.caseType.trim().length > 0 &&
    draft.agentName.trim().length > 0 &&
    draft.note.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) {
      notify("Case reference, type, agent, and note are required.", { variant: "error" });
      return;
    }
    const payload = {
      ...draft,
      requesterName: requesterName || draft.requesterName,
    };
    try {
      if (editing && initial) {
        await updateSupervisorRequest(initial.id, payload);
        notify("Request updated.", { variant: "success" });
      } else {
        await createSupervisorRequest(payload);
        notify("Request created.", { variant: "success" });
      }
      onSaved();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save request.", {
        variant: "error",
      });
    }
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog sr-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sr-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="sr-form-title" className="cases-modal__title">
              {editing ? "Edit request" : "Add request"}
            </h2>
            <p className="cases-modal__subtitle">Supervisor request for QA review</p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cases-modal__body">
          <div className="sr-form-grid">
            <label className="cases-field">
              <span className="cases-field__label">Case reference</span>
              <input
                className="cases-field__control"
                type="text"
                value={draft.caseReference}
                placeholder="e.g. CASE-10482"
                onChange={(event) => patch({ caseReference: event.target.value })}
              />
            </label>

            <div className="sr-field-slot">
              <FilterSelect
                label="Case type"
                value={(draft.caseType || caseTypeOptions[0]?.id || "") as string}
                options={caseTypeOptions}
                onChange={(caseType) => patch({ caseType })}
              />
            </div>

            <div className="sr-field-slot">
              <FilterSelect
                label="Team"
                value={draft.team}
                options={TEAM_OPTIONS}
                onChange={(team) =>
                  patch({
                    team,
                    agentId: "",
                    agentName: "",
                  })
                }
              />
            </div>

            <div className="sr-field-slot">
              <AgentSearch
                team={draft.team}
                selectedId={draft.agentId}
                selectedName={draft.agentName}
                onSelect={(agent) => patch({ agentId: agent.id, agentName: agent.name })}
              />
            </div>

              <label className="cases-field">
                <span className="cases-field__label">Requester name</span>
                <input
                  className="cases-field__control cases-field__control--readonly"
                  type="text"
                  value={requesterName || draft.requesterName}
                  readOnly
                  aria-readonly="true"
                  title="Filled from your account"
                />
              </label>

              <div className="sr-field-slot">
                <FilterSelect
                  label="Priority"
                  value={draft.priority}
                  options={REQUEST_PRIORITY_OPTIONS}
                  onChange={(priority) => patch({ priority })}
                />
              </div>

            {editing ? (
              <div className="sr-field-slot sr-span-2">
                <FilterSelect
                  label="Status"
                  value={draft.status}
                  options={REQUEST_STATUS_OPTIONS}
                  onChange={(status) => patch({ status })}
                />
              </div>
            ) : null}

            <label className="cases-field sr-span-2">
              <span className="cases-field__label">Request note</span>
              <textarea
                className="cases-field__control sr-textarea"
                rows={4}
                value={draft.note}
                placeholder="Describe the request…"
                onChange={(event) => patch({ note: event.target.value })}
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
            {editing ? "Save changes" : "Add request"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ViewRequestModal({
  open,
  record,
  authorName,
  onClose,
  onChanged,
}: {
  open: boolean;
  record: SupervisorRequest | null;
  authorName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify } = useNotify();
  const [reply, setReply] = useState("");
  const [current, setCurrent] = useState<SupervisorRequest | null>(record);

  useEffect(() => {
    if (open) {
      setCurrent(record);
      setReply("");
    }
  }, [open, record]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !current) return null;

  const handleReply = async () => {
    if (!reply.trim()) {
      notify("Enter a QA reply first.", { variant: "error" });
      return;
    }
    const next = await addQaReply(current.id, authorName, reply);
    if (!next) return;
    setCurrent(next);
    setReply("");
    onChanged();
    notify("QA reply added.", { variant: "success" });
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog sr-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sr-view-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="sr-view-title" className="cases-modal__title">
              Request view
            </h2>
            <p className="cases-modal__subtitle">{current.caseReference}</p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cases-modal__body sr-view-body">
          <div className="sr-view-meta">
            <div><span>Agent</span><strong>{current.agentName}</strong></div>
            <div><span>Type</span><strong>{current.caseType}</strong></div>
            <div><span>Priority</span><strong>{priorityLabel(current.priority)}</strong></div>
            <div><span>Status</span><strong>{statusLabel(current.status)}</strong></div>
            <div><span>Team</span><strong>{teamLabel(current.team)}</strong></div>
            <div><span>Requester</span><strong>{current.requesterName}</strong></div>
          </div>

          <div className="sr-view-block">
            <span>Request note</span>
            <p>{current.note || "—"}</p>
          </div>

          <div className="sr-replies">
            <h3 className="sr-replies__title">QA replies</h3>
            {current.replies.length === 0 ? (
              <p className="sr-replies__empty">No replies yet.</p>
            ) : (
              <ul className="sr-replies__list">
                {current.replies.map((item) => (
                  <li key={item.id}>
                    <div className="sr-replies__head">
                      <strong>{item.author}</strong>
                      <span>{formatRequestDate(item.createdAt)}</span>
                    </div>
                    <p>{item.body}</p>
                  </li>
                ))}
              </ul>
            )}

            <label className="cases-field">
              <span className="cases-field__label">Add QA reply</span>
              <textarea
                className="cases-field__control sr-textarea"
                rows={3}
                value={reply}
                placeholder="Write a reply…"
                onChange={(event) => setReply(event.target.value)}
              />
            </label>
          </div>
        </div>

        <footer className="cases-wizard-footer">
          <button type="button" className="cases-btn cases-btn--primary" onClick={handleReply}>
            Post reply
          </button>
        </footer>
      </div>
    </div>
  );
}

export function SupervisorRequestsPage() {
  const { user } = useAuth();
  const { notify } = useNotify();
  const { confirmDelete } = useConfirmDelete();
  const requesterName = user?.full_name?.trim() || user?.username || "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [team, setTeam, teamScope] = useScopedTeamFilter("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("case");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [rows, setRows] = useState<SupervisorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupervisorRequest | null>(null);
  const [viewing, setViewing] = useState<SupervisorRequest | null>(null);

  useShellPageLoading(loading);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await fetchSupervisorRequests({
        team: team === "all" ? "all" : team,
        status: status === "all" ? "all" : status,
        search,
        limit: 2000,
      });
      if (payload.connected) {
        const live = payload.items.map((raw) => {
          const row = raw as Partial<SupervisorRequest> & { id?: string };
          return {
            id: String(row.id || ""),
            caseReference: String(row.caseReference || ""),
            caseType: String(row.caseType || ""),
            agentId: String(row.agentId || ""),
            agentName: String(row.agentName || ""),
            requesterName: String(row.requesterName || ""),
            priority: (row.priority as SupervisorRequest["priority"]) || "medium",
            team: (row.team as SupervisorRequest["team"]) || "calls",
            note: String(row.note || ""),
            status: (row.status as SupervisorRequest["status"]) || "open",
            replies: Array.isArray(row.replies) ? row.replies : [],
            createdAt: String(row.createdAt || ""),
            updatedAt: String(row.updatedAt || ""),
          } satisfies SupervisorRequest;
        });
        const liveIds = new Set(live.map((row) => row.id));
        const localOnly = listSupervisorRequests().filter((row) => !liveIds.has(row.id));
        setRows([...live, ...localOnly]);
      } else {
        setRows(listSupervisorRequests());
      }
    } catch {
      setRows(listSupervisorRequests());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, status, search]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, status, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (team !== "all" && row.team !== team) return false;
      if (!q) return true;
      return (
        row.caseReference.toLowerCase().includes(q) ||
        row.agentName.toLowerCase().includes(q) ||
        row.note.toLowerCase().includes(q) ||
        row.caseType.toLowerCase().includes(q) ||
        row.requesterName.toLowerCase().includes(q)
      );
    });
  }, [rows, search, status, team]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "case":
          result = compareText(a.caseReference, b.caseReference);
          break;
        case "agentName":
          result = compareText(a.agentName, b.agentName);
          break;
        case "type":
          result = compareText(a.caseType, b.caseType);
          break;
        case "priority":
          result = compareText(priorityLabel(a.priority), priorityLabel(b.priority));
          break;
        case "status":
          result = compareText(statusLabel(a.status), statusLabel(b.status));
          break;
        case "requester":
          result = compareText(a.requesterName, b.requesterName);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, status, team]);

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

  const handleDelete = async (row: SupervisorRequest) => {
    const ok = await confirmDelete({
      title: `Delete request “${row.caseReference}”?`,
      description: `Remove the request for ${row.agentName}.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await deleteSupervisorRequest(row.id);
    void refresh();
    notify("Request deleted.", { variant: "success" });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const ok = await confirmDelete({
      title: count === 1 ? "Delete 1 request?" : `Delete ${count} requests?`,
      description:
        count === 1
          ? "This request will be permanently removed."
          : "These requests will be permanently removed.",
      confirmLabel: count === 1 ? "Delete request" : "Delete requests",
    });
    if (!ok) return;
    await Promise.all(selectedIds.map((id) => deleteSupervisorRequest(id)));
    clearSelection();
    void refresh();
    notify(
      count === 1 ? "1 request deleted." : `${count} requests deleted.`,
      { variant: "success" },
    );
  };

  return (
    <main className="sr-page" aria-label="Supervisor requests">
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
                placeholder="Search case, agent, note…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>

          <FilterSelect
            label="Status"
            value={status}
            options={[
              { id: "all" as const, label: "All" },
              ...REQUEST_STATUS_OPTIONS,
            ]}
            onChange={setStatus}
          />

          <FilterSelect
            label="Team"
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

          <BulkDeleteButton
            count={selectedIds.length}
            onClick={() => void handleDeleteSelected()}
            noun="requests"
          />
        </div>

        <button
          type="button"
          className="cases-add-btn"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          >
            Add request
          </button>
      </div>

      <section className="sr-page__table-wrap" aria-label="Supervisor requests table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table sr-table">
              <thead>
                <tr>
                  <SelectAllCheckbox
                    allSelected={allPageSelected}
                    someSelected={somePageSelected}
                    onToggle={toggleAllPage}
                    disabled={pageRows.length === 0}
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
                    label="Type"
                    active={sortKey === "type"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "type", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Priority"
                    active={sortKey === "priority"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "priority", "asc");
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
                  <SortHeader
                    label="Requester"
                    active={sortKey === "requester"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "requester", "asc");
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
                    <td colSpan={8} className="audits-table__empty">
                      No supervisor requests found. Create a request to get started.
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
                          label={`Select request ${row.caseReference}`}
                        />
                        <td className="sr-table__case">{row.caseReference}</td>
                        <td>{row.agentName}</td>
                        <td>{row.caseType}</td>
                        <td>
                          <span className={`sr-priority is-${row.priority}`}>
                            {priorityLabel(row.priority)}
                          </span>
                        </td>
                        <td>
                          <span className={`sr-status is-${row.status}`}>
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td>{row.requesterName}</td>
                        <td className="cases-table__actions-col">
                          <RowActions
                            onView={() => setViewing(row)}
                            onEdit={() => {
                              setEditing(row);
                              setFormOpen(true);
                            }}
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

      <RequestFormModal
        open={formOpen}
        initial={editing}
        requesterName={requesterName}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => { void refresh(); }}
      />
      <ViewRequestModal
        open={Boolean(viewing)}
        record={viewing}
        authorName={requesterName}
        onClose={() => setViewing(null)}
        onChanged={() => {
          void refresh();
          const latest = listSupervisorRequests().find((row) => row.id === viewing?.id) ?? null;
          setViewing(latest);
        }}
      />
    </main>
  );
}
