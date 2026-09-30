import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { DateRangePicker } from "../../components/DateRangePicker";
import { SingleDatePicker } from "../../components/SingleDatePicker";
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
  PLAN_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  acknowledgeFeedback,
  createFeedback,
  deleteFeedback,
  emptyFeedbackDraft,
  feedbackInRange,
  formatFollowUp,
  isFeedbackOverdue,
  listFeedback,
  matchesPlansFilter,
  planTypeLabel,
  priorityLabel,
  stageLabel,
  statusLabel,
  updateFeedback,
  type FeedbackDraft,
  type FeedbackPlanType,
  type FeedbackRecord,
  type FeedbackStatus,
  type PlansFilter,
} from "../../lib/agentFeedback";
import { type DateRange } from "../../lib/dateRange";
import { fetchAgentFeedback } from "../../lib/externalApi";
import { defaultPortalRange } from "../../lib/portalRange";
import {
  applyDir,
  compareNumber,
  compareText,
  nextSortState,
} from "../../lib/tableSort";
import { useNotify } from "../../notifications/NotificationContext";
import { useShellPageLoading } from "../../components/PageLoadingContext";

const PAGE_SIZE = 30;

type StatusFilter = "all" | FeedbackStatus;
type TypeFilter = "all" | FeedbackPlanType;
type SortKey =
  | "agentName"
  | "typePriority"
  | "subject"
  | "followUp"
  | "statusStage"
  | "agentCycle";

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
  const labelId = `fb-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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
  const rootRef = useRef<HTMLDivElement>(null);
  const agents = useMemo(() => listAgents(), []);

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
      <span className="audits-field__label" id="fb-agent-search">
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
          aria-labelledby="fb-agent-search"
          aria-expanded={open}
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
  onDetails,
  onAcknowledge,
  onDelete,
  canAcknowledge,
}: {
  onEdit: () => void;
  onDetails: () => void;
  onAcknowledge: () => void;
  onDelete: () => void;
  canAcknowledge: boolean;
}) {
  return (
    <TableRowActions
      label="Feedback actions"
      items={[
        { label: "Edit", onClick: onEdit },
        { label: "Details", onClick: onDetails },
        { label: "Acknowledge", onClick: onAcknowledge, hidden: !canAcknowledge },
        { label: "Delete", onClick: onDelete, danger: true },
      ]}
    />
  );
}

function FeedbackFormModal({
  open,
  initial,
  qaName,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: FeedbackRecord | null;
  qaName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useNotify();
  const [draft, setDraft] = useState<FeedbackDraft>(() => emptyFeedbackDraft(qaName));
  const editing = Boolean(initial);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        agentId: initial.agentId,
        agentName: initial.agentName,
        team: initial.team,
        qaName: initial.qaName || qaName,
        planType: initial.planType,
        priority: initial.priority,
        status: initial.status,
        stage: initial.stage,
        followUpDate: initial.followUpDate,
        subject: initial.subject,
        auditReference: initial.auditReference,
        coachingSummary: initial.coachingSummary,
        justification: initial.justification,
        actionPlan: initial.actionPlan,
      });
    } else {
      setDraft(emptyFeedbackDraft(qaName));
    }
  }, [open, initial, qaName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const patch = (partial: Partial<FeedbackDraft>) => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const canSave =
    draft.agentName.trim().length > 0 &&
    draft.subject.trim().length > 0 &&
    draft.coachingSummary.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) {
      notify("Agent, subject, and coaching summary are required.", { variant: "error" });
      return;
    }
    try {
      if (editing && initial) {
        await updateFeedback(initial.id, { ...draft, qaName: draft.qaName || qaName });
        notify("Plan updated.", { variant: "success" });
      } else {
        await createFeedback({ ...draft, qaName: qaName || draft.qaName });
        notify("Plan created.", { variant: "success" });
      }
      onSaved();
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save plan.", { variant: "error" });
    }
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog feedback-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="fb-form-title" className="cases-modal__title">
              {editing ? "Edit plan" : "Add feedback"}
            </h2>
            <p className="cases-modal__subtitle">Agent feedback / coaching plan</p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cases-modal__body feedback-modal-body">
          <section className="feedback-section">
            <h3 className="feedback-section__title">Plan basics</h3>
            <div className="feedback-section__grid">
              <AgentSearch
                selectedId={draft.agentId}
                selectedName={draft.agentName}
                onSelect={(agent) => patch({ agentId: agent.id, agentName: agent.name })}
              />

              <label className="cases-field">
                <span className="cases-field__label">QA name</span>
                <input
                  className="cases-field__control cases-field__control--readonly"
                  type="text"
                  value={qaName || draft.qaName}
                  readOnly
                  aria-readonly="true"
                  title="Filled from your account"
                />
              </label>

              <SingleDatePicker
                label="Follow up date"
                value={draft.followUpDate}
                onChange={(followUpDate) => patch({ followUpDate })}
              />

              <div className="feedback-section__trio">
                <div className="feedback-field-slot">
                  <FilterSelect
                    label="Plan type"
                    value={draft.planType}
                    options={PLAN_TYPE_OPTIONS}
                    onChange={(planType) => patch({ planType })}
                  />
                </div>

                <div className="feedback-field-slot">
                  <FilterSelect
                    label="Priority"
                    value={draft.priority}
                    options={PRIORITY_OPTIONS}
                    onChange={(priority) => patch({ priority })}
                  />
                </div>

                <div className="feedback-field-slot">
                  <FilterSelect
                    label="Starting status"
                    value={draft.status}
                    options={STATUS_OPTIONS}
                    onChange={(status) => patch({ status })}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="feedback-section">
            <h3 className="feedback-section__title">Coaching content</h3>
            <div className="feedback-section__stack">
              <label className="cases-field">
                <span className="cases-field__label">Subject</span>
                <input
                  className="cases-field__control"
                  type="text"
                  value={draft.subject}
                  placeholder="Short subject line"
                  onChange={(event) => patch({ subject: event.target.value })}
                />
              </label>

              <label className="cases-field">
                <span className="cases-field__label">Audit reference</span>
                <input
                  className="cases-field__control"
                  type="text"
                  value={draft.auditReference}
                  placeholder="Audit ID or link"
                  onChange={(event) => patch({ auditReference: event.target.value })}
                />
              </label>

              <label className="cases-field">
                <span className="cases-field__label">Coaching summary</span>
                <textarea
                  className="cases-field__control feedback-textarea"
                  rows={2}
                  value={draft.coachingSummary}
                  onChange={(event) => patch({ coachingSummary: event.target.value })}
                />
              </label>

              <label className="cases-field">
                <span className="cases-field__label">Justification / Context</span>
                <textarea
                  className="cases-field__control feedback-textarea"
                  rows={2}
                  value={draft.justification}
                  onChange={(event) => patch({ justification: event.target.value })}
                />
              </label>

              <label className="cases-field feedback-span-2">
                <span className="cases-field__label">Action Plan</span>
                <textarea
                  className="cases-field__control feedback-textarea"
                  rows={2}
                  value={draft.actionPlan}
                  onChange={(event) => patch({ actionPlan: event.target.value })}
                />
              </label>
            </div>
          </section>
        </div>

        <footer className="cases-wizard-footer">
          <button
            type="button"
            className="cases-btn cases-btn--primary"
            disabled={!canSave}
            onClick={handleSave}
          >
            {editing ? "Save changes" : "Add feedback"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function DetailsModal({
  open,
  record,
  onClose,
}: {
  open: boolean;
  record: FeedbackRecord | null;
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

  const narrative = [
    { label: "Coaching summary", value: record.coachingSummary },
    { label: "Justification / Context", value: record.justification },
    { label: "Action plan", value: record.actionPlan },
    { label: "Audit reference", value: record.auditReference },
  ].filter((block) => block.value.trim());

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog feedback-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="feedback-details-panel__header">
          <div className="feedback-details-panel__heading">
            <p className="feedback-details-panel__eyebrow">Agent feedback</p>
            <h2 id="fb-details-title" className="feedback-details-panel__title">
              {record.agentName || "Agent"}
            </h2>
            <p className="feedback-details-panel__subject">
              {record.subject || "No subject"}
            </p>
          </div>
          <div className="feedback-details-panel__header-aside">
            <span className={`feedback-status-pill is-${record.status}`}>
              {statusLabel(record.status)}
            </span>
            <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="feedback-details-panel__body">
          <div className="feedback-details-panel__meta">
            <div>
              <span>Type</span>
              <strong>{planTypeLabel(record.planType)}</strong>
            </div>
            <div>
              <span>Priority</span>
              <strong className={`feedback-priority is-${record.priority}`}>
                {priorityLabel(record.priority)}
              </strong>
            </div>
            <div>
              <span>Follow up</span>
              <strong>{formatFollowUp(record.followUpDate)}</strong>
            </div>
            <div>
              <span>QA</span>
              <strong>{record.qaName || "—"}</strong>
            </div>
            <div>
              <span>Stage</span>
              <strong>{stageLabel(record.stage)}</strong>
            </div>
            <div>
              <span>Acknowledged</span>
              <strong>{record.acknowledged ? "Yes" : "No"}</strong>
            </div>
          </div>

          {narrative.length > 0 ? (
            <div className="feedback-details-panel__sections">
              {narrative.map((block) => (
                <section key={block.label} className="feedback-details-panel__block" aria-label={block.label}>
                  <span>{block.label}</span>
                  <p>{block.value}</p>
                </section>
              ))}
            </div>
          ) : (
            <section className="feedback-details-panel__block" aria-label="Notes">
              <span>Notes</span>
              <p>No additional notes on this plan.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentFeedbackPage() {
  const { user } = useAuth();
  const { notify } = useNotify();
  const { confirmDelete } = useConfirmDelete();
  const qaName = user?.full_name?.trim() || user?.username || "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [plans, setPlans] = useState<PlansFilter>("all");
  const [team] = useScopedTeamFilter("all");
  const [range, setRange] = useState<DateRange>(() => defaultPortalRange());
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("agentName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [rows, setRows] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FeedbackRecord | null>(null);
  const [details, setDetails] = useState<FeedbackRecord | null>(null);

  useShellPageLoading(loading);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await fetchAgentFeedback({ team, search, limit: 2000 });
      if (payload.connected) {
        const live = payload.items.map((raw) => {
          const row = raw as Partial<FeedbackRecord> & { id?: string };
          return {
            id: String(row.id || ""),
            agentId: String(row.agentId || ""),
            agentName: String(row.agentName || ""),
            team: (row.team as FeedbackRecord["team"]) || "",
            qaName: String(row.qaName || ""),
            planType: (row.planType as FeedbackRecord["planType"]) || "coaching",
            priority: (row.priority as FeedbackRecord["priority"]) || "medium",
            status: (row.status as FeedbackRecord["status"]) || "open",
            stage: (row.stage as FeedbackRecord["stage"]) || "draft",
            followUpDate: String(row.followUpDate || ""),
            subject: String(row.subject || ""),
            auditReference: String(row.auditReference || ""),
            coachingSummary: String(row.coachingSummary || ""),
            justification: String(row.justification || ""),
            actionPlan: String(row.actionPlan || ""),
            acknowledged: Boolean(row.acknowledged),
            agentCycle: Number(row.agentCycle || 0),
            createdAt: String(row.createdAt || ""),
            updatedAt: String(row.updatedAt || ""),
          } satisfies FeedbackRecord;
        });
        setRows(live);
      } else {
        setRows(listFeedback());
      }
    } catch {
      setRows(listFeedback());
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (type !== "all" && row.planType !== type) return false;
      if (!matchesPlansFilter(row, plans)) return false;
      if (!feedbackInRange(row.createdAt, range.start, range.end)) return false;
      if (!q) return true;
      return (
        row.agentName.toLowerCase().includes(q) ||
        row.subject.toLowerCase().includes(q) ||
        row.qaName.toLowerCase().includes(q) ||
        planTypeLabel(row.planType).toLowerCase().includes(q)
      );
    });
  }, [rows, search, status, type, plans, range.start, range.end]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "agentName":
          result = compareText(a.agentName, b.agentName);
          break;
        case "typePriority":
          result = compareText(
            `${planTypeLabel(a.planType)} ${priorityLabel(a.priority)}`,
            `${planTypeLabel(b.planType)} ${priorityLabel(b.priority)}`,
          );
          break;
        case "subject":
          result = compareText(a.subject, b.subject);
          break;
        case "followUp":
          result = compareText(a.followUpDate, b.followUpDate);
          break;
        case "statusStage":
          result = compareText(
            `${statusLabel(a.status)} ${stageLabel(a.stage)}`,
            `${statusLabel(b.status)} ${stageLabel(b.stage)}`,
          );
          break;
        case "agentCycle":
          result = compareNumber(a.agentCycle, b.agentCycle);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, status, type, plans, range.start, range.end]);

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

  const handleAcknowledge = (row: FeedbackRecord) => {
    acknowledgeFeedback(row.id);
    void refresh();
    notify(`Acknowledged plan for ${row.agentName}.`, { variant: "success" });
  };

  const handleDelete = async (row: FeedbackRecord) => {
    const ok = await confirmDelete({
      title: `Delete plan for “${row.agentName}”?`,
      description: row.subject || "This feedback plan will be removed.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await deleteFeedback(row.id);
    void refresh();
    notify("Plan deleted.", { variant: "success" });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const ok = await confirmDelete({
      title: count === 1 ? "Delete 1 feedback item?" : `Delete ${count} feedback items?`,
      description:
        count === 1
          ? "This feedback item will be permanently removed."
          : "These feedback items will be permanently removed.",
      confirmLabel: count === 1 ? "Delete feedback item" : "Delete feedback items",
    });
    if (!ok) return;
    await Promise.all(selectedIds.map((id) => deleteFeedback(id)));
    clearSelection();
    void refresh();
    notify(
      count === 1 ? "1 feedback item deleted." : `${count} feedback items deleted.`,
      { variant: "success" },
    );
  };

  return (
    <main className="feedback-page" aria-label="Agent feedback">
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
                placeholder="Search agent…"
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
              ...STATUS_OPTIONS,
            ]}
            onChange={setStatus}
          />

          <FilterSelect
            label="Type"
            value={type}
            options={[
              { id: "all" as const, label: "All types" },
              ...PLAN_TYPE_OPTIONS,
            ]}
            onChange={setType}
          />

          <FilterSelect
            label="Plans"
            value={plans}
            options={[
              { id: "all" as const, label: "All" },
              { id: "open" as const, label: "Open" },
              { id: "overdue" as const, label: "Overdue" },
              { id: "awaiting-ack" as const, label: "Awaiting ack" },
              { id: "follow-up" as const, label: "Follow up" },
            ]}
            onChange={setPlans}
          />

          <BulkDeleteButton
            count={selectedIds.length}
            onClick={() => void handleDeleteSelected()}
            noun="feedback items"
          />
        </div>

        <div className="feedback-toolbar-right">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            className="cases-add-btn"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add feedback
          </button>
        </div>
      </div>

      <section className="feedback-page__table-wrap" aria-label="Agent feedback table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table feedback-table">
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
                    label="Type - Priority"
                    active={sortKey === "typePriority"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "typePriority", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Subject"
                    active={sortKey === "subject"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "subject", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Follow up"
                    active={sortKey === "followUp"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "followUp", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Status - Stage"
                    active={sortKey === "statusStage"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "statusStage", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Agent cycle"
                    active={sortKey === "agentCycle"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "agentCycle", "desc");
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
                    <td colSpan={8} className="audits-table__empty">
                      No feedback plans found. Create a plan to get started.
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
                          label={`Select feedback for ${row.agentName}`}
                        />
                        <td>{row.agentName}</td>
                        <td>
                          <span className="feedback-combo">
                            {planTypeLabel(row.planType)}
                            <span className="feedback-combo__sep">·</span>
                            <span className={`feedback-priority is-${row.priority}`}>
                              {priorityLabel(row.priority)}
                            </span>
                          </span>
                        </td>
                        <td className="feedback-table__subject">{row.subject}</td>
                        <td>
                          <span className={isFeedbackOverdue(row) ? "feedback-overdue" : undefined}>
                            {formatFollowUp(row.followUpDate)}
                          </span>
                        </td>
                        <td>
                          <span className="feedback-combo">
                            {statusLabel(row.status)}
                            <span className="feedback-combo__sep">·</span>
                            {stageLabel(row.stage)}
                          </span>
                        </td>
                        <td>{row.agentCycle}</td>
                        <td className="cases-table__actions-col">
                          <RowActions
                            canAcknowledge={!row.acknowledged}
                            onEdit={() => {
                              setEditing(row);
                              setFormOpen(true);
                            }}
                            onDetails={() => setDetails(row)}
                            onAcknowledge={() => handleAcknowledge(row)}
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

      <FeedbackFormModal
        open={formOpen}
        initial={editing}
        qaName={qaName}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => { void refresh(); }}
      />
      <DetailsModal
        open={Boolean(details)}
        record={details}
        onClose={() => setDetails(null)}
      />
    </main>
  );
}
