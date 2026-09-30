import { useEffect, useMemo, useRef, useState } from "react";

import { DateRangePicker } from "../../components/DateRangePicker";
import { useConfirmDelete } from "../../components/ConfirmDeleteContext";
import { useShellPageLoading } from "../../components/PageLoadingContext";
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
import { startOfDay, type DateRange } from "../../lib/dateRange";
import { fetchAgents, fetchMonitoring } from "../../lib/externalApi";
import {
  createMonitoring,
  deleteMonitoring,
  emptyMonitoringDraft,
  formatMonitoringDate,
  listMonitoring,
  monitoringInRange,
  queueMonitoringEmail,
  resolveMonitoring,
  statusLabel,
  teamLabel,
  updateMonitoring,
  type MonitoringDraft,
  type MonitoringRecord,
  type MonitoringStatus,
} from "../../lib/monitoring";
import {
  applyDir,
  compareBool,
  compareText,
  nextSortState,
} from "../../lib/tableSort";
import {
  getEmailTestingSettings,
  isValidTestEmail,
  saveEmailTestingSettings,
  type EmailTestingSettings,
} from "../../lib/emailTesting";
import { useNotify } from "../../notifications/NotificationContext";

const PAGE_SIZE = 30;

type StatusFilter = "all" | MonitoringStatus;
type SortKey = "order" | "agentName" | "team" | "comment" | "status" | "ack" | "created";

function defaultPortalRange(): DateRange {
  const end = startOfDay(new Date());
  const start = startOfDay(new Date());
  start.setMonth(start.getMonth() - 6);
  return { start, end };
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
  const labelId = `mon-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

function EmailTestingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { notify } = useNotify();
  const [draft, setDraft] = useState<EmailTestingSettings>(() => getEmailTestingSettings());

  useEffect(() => {
    if (!open) return;
    setDraft(getEmailTestingSettings());
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

  const canSave = !draft.enabled || isValidTestEmail(draft.email);
  const previewEmail = draft.enabled && draft.email.trim() ? draft.email.trim() : null;

  const handleSave = () => {
    if (draft.enabled && !isValidTestEmail(draft.email)) {
      notify("Enter a valid email address for testing.", { variant: "error" });
      return;
    }
    const saved = saveEmailTestingSettings(draft);
    notify(
      saved.enabled
        ? `Email testing on — all QA emails go to ${saved.email}.`
        : "Email testing off — emails go to employees.",
      { variant: "success" },
    );
    onClose();
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog email-testing-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-testing-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="email-testing__header">
          <div className="email-testing__heading">
            <p className="email-testing__eyebrow">Power Automate</p>
            <h2 id="email-testing-title" className="email-testing__title">
              Email testing
            </h2>
            <p className="email-testing__lede">
              Redirect outbound QA emails while you verify the flow.
            </p>
          </div>
          <div className="email-testing__header-aside">
            <span
              className={`email-testing__badge${draft.enabled ? " is-on" : " is-off"}`}
            >
              {draft.enabled ? "Redirect on" : "Redirect off"}
            </span>
            <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="email-testing__body">
          <button
            type="button"
            className={`email-testing__mode${draft.enabled ? " is-active" : ""}`}
            aria-pressed={draft.enabled}
            onClick={() =>
              setDraft((current) => ({ ...current, enabled: !current.enabled }))
            }
          >
            <span className="email-testing__mode-copy">
              <strong>Send all emails to a test inbox</strong>
              <span>
                {draft.enabled
                  ? "Monitoring and QA emails will not reach employees."
                  : "Emails go to the employee address from their profile."}
              </span>
            </span>
            <span className={`email-testing__toggle${draft.enabled ? " is-on" : ""}`} aria-hidden="true">
              <span className="email-testing__toggle-thumb" />
            </span>
          </button>

          <label className={`email-testing__field${draft.enabled ? "" : " is-disabled"}`}>
            <span className="email-testing__field-label">Test inbox</span>
            <span className="email-testing__input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 6h16v12H4V6zm0 0l8 7 8-7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                className="email-testing__input"
                type="email"
                autoComplete="email"
                placeholder="you@detroitaxle.com"
                value={draft.email}
                disabled={!draft.enabled}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, email: event.target.value }))
                }
              />
            </span>
          </label>

          <div className={`email-testing__route${draft.enabled ? " is-live" : ""}`}>
            <div className="email-testing__route-col">
              <span>From</span>
              <strong>Employee email</strong>
            </div>
            <div className="email-testing__route-arrow" aria-hidden="true">
              →
            </div>
            <div className="email-testing__route-col">
              <span>To</span>
              <strong>{previewEmail || (draft.enabled ? "Enter an address" : "Employee email")}</strong>
            </div>
          </div>
        </div>

        <footer className="email-testing__footer">
          <button
            type="button"
            className="cases-btn cases-btn--primary"
            disabled={!canSave}
            onClick={handleSave}
          >
            {draft.enabled ? "Save & enable" : "Save"}
          </button>
        </footer>
      </div>
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
  const [agents, setAgents] = useState(() => listAgents());
  const [loadingAgents, setLoadingAgents] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingAgents(true);
    void fetchAgents({ team: team || "all" })
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

  const pool = useMemo(
    () => agents.filter((agent) => agent.team === team),
    [agents, team],
  );

  const matches = useMemo(() => {
    if (!query.trim()) return pool;
    return pool.filter((agent) => matchesAgentSearch(agent, query));
  }, [pool, query]);

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
      <span className="audits-field__label" id="mon-agent-search">
        Search agent
      </span>
      <div className={`audits-search__field${open ? " is-open" : ""}`}>
        <svg className="audits-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          className="audits-search__input"
          type="search"
          aria-labelledby="mon-agent-search"
          aria-expanded={open}
          aria-controls="mon-agent-list"
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
            {selectedId ? (
              <span className="audits-agent-selected__alias">{selectedId}</span>
            ) : null}
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
        <div className="audits-agent-search__menu" id="mon-agent-list" role="listbox">
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
                aria-selected={agent.id === selectedId}
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
  canResolve,
  onView,
  onEdit,
  onResolve,
  onDelete,
}: {
  canResolve: boolean;
  onView: () => void;
  onEdit: () => void;
  onResolve: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRowActions
      label="Monitoring actions"
      items={[
        { label: "View details", onClick: onView },
        { label: "Edit", onClick: onEdit },
        { label: "Resolve", onClick: onResolve, hidden: !canResolve },
        { label: "Delete", onClick: onDelete, danger: true },
      ]}
    />
  );
}

function MonitoringDetailsModal({
  open,
  record,
  onClose,
}: {
  open: boolean;
  record: MonitoringRecord | null;
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
        className="cases-modal__dialog monitoring-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mon-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="monitoring-details__header">
          <div className="monitoring-details__heading">
            <p className="monitoring-details__eyebrow">Monitoring</p>
            <h2 id="mon-details-title" className="monitoring-details__title">
              {record.agentName || "Agent"}
            </h2>
            <p className="monitoring-details__order">{record.order || "No order reference"}</p>
          </div>
          <div className="monitoring-details__header-aside">
            <span className={`monitoring-status is-${record.status}`}>
              {statusLabel(record.status)}
            </span>
            <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="monitoring-details__body">
          <div className="monitoring-details__meta">
            <div>
              <span>Team</span>
              <strong>{teamLabel(record.team)}</strong>
            </div>
            <div>
              <span>Acknowledged</span>
              <strong>{record.ack ? "Yes" : "No"}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>{formatMonitoringDate(record.createdAt)}</strong>
            </div>
          </div>

          <section className="monitoring-details__comment" aria-label="Comment">
            <span>Comment</span>
            <p>{record.comment || "No comment provided."}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function MonitoringFormModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: MonitoringRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useNotify();
  const [draft, setDraft] = useState<MonitoringDraft>(() => emptyMonitoringDraft());
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        agentId: initial.agentId,
        agentName: initial.agentName,
        team: initial.team,
        order: initial.order,
        comment: initial.comment,
      });
    } else {
      setDraft(emptyMonitoringDraft());
    }
    setSaving(false);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const canSave =
    draft.agentName.trim().length > 0 &&
    draft.comment.trim().length > 0 &&
    draft.order.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) {
      notify("Team, agent, order, and comment are required.", { variant: "error" });
      return;
    }
    setSaving(true);
    try {
      if (editing && initial) {
        await updateMonitoring(initial.id, draft);
        notify("Monitoring item updated.", { variant: "success" });
      } else {
        const record = await createMonitoring(draft);
        try {
          const queued = await queueMonitoringEmail(record);
          notify(
            queued.toEmail
              ? queued.emailTestMode
                ? `Monitoring item created. Test email queued to ${queued.toEmail}.`
                : `Monitoring item created. Email queued to ${queued.toEmail}.`
              : "Monitoring item created. Notification queued (no recipient email).",
            { variant: "success" },
          );
        } catch (error) {
          notify(
            error instanceof Error
              ? `Item created. Email notify: ${error.message}`
              : "Item created. Email notify is not configured yet.",
            { variant: "info" },
          );
        }
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog cases-modal__dialog--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mon-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="mon-form-title" className="cases-modal__title">
              {editing ? "Edit item" : "Add item"}
            </h2>
            <p className="cases-modal__subtitle">
              {editing ? "Update this monitoring note." : "Add a monitoring note for an agent."}
            </p>
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
              label="Team"
              value={draft.team}
              options={TEAM_OPTIONS}
              onChange={(nextTeam) =>
                setDraft((current) => ({
                  ...current,
                  team: nextTeam,
                  agentId: "",
                  agentName: "",
                }))
              }
            />

            <AgentSearch
              team={draft.team}
              selectedId={draft.agentId}
              selectedName={draft.agentName}
              onSelect={(agent) =>
                setDraft((current) => ({
                  ...current,
                  agentId: agent.id,
                  agentName: agent.name,
                }))
              }
            />

            <label className="cases-field">
              <span className="cases-field__label">Order number</span>
              <input
                className="cases-field__control"
                type="text"
                value={draft.order}
                placeholder="e.g. ORD-10482"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    order: event.target.value,
                  }))
                }
              />
            </label>

            <label className="cases-field">
              <span className="cases-field__label">Comment</span>
              <textarea
                className="cases-field__control monitoring-textarea"
                rows={4}
                value={draft.comment}
                placeholder="What needs monitoring?"
                onChange={(event) => setDraft((current) => ({ ...current, comment: event.target.value }))}
              />
            </label>
          </div>
        </div>

        <footer className="cases-wizard-footer">
          <button
            type="button"
            className="cases-btn cases-btn--primary"
            disabled={!canSave || saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Add item"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function MonitoringPage() {
  const { notify } = useNotify();
  const { confirmDelete } = useConfirmDelete();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [team, setTeam, teamScope] = useScopedTeamFilter("all");
  const [range, setRange] = useState<DateRange>(() => defaultPortalRange());
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [rows, setRows] = useState<MonitoringRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MonitoringRecord | null>(null);
  const [viewing, setViewing] = useState<MonitoringRecord | null>(null);
  const [emailTestingOpen, setEmailTestingOpen] = useState(false);
  const [emailTesting, setEmailTesting] = useState(() => getEmailTestingSettings());

  useShellPageLoading(loading);

  const refresh = async () => {
    setLoading(true);
    try {
      const payload = await fetchMonitoring({
        team: team === "all" ? "all" : team,
        status: status === "all" ? "all" : status,
        search,
        limit: 2000,
      });
      if (payload.connected) {
        const live = payload.items;
        setRows(live);
      } else {
        setRows(listMonitoring());
      }
    } catch {
      setRows(listMonitoring());
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
      if (!monitoringInRange(row.createdAt, range.start, range.end)) return false;
      if (!q) return true;
      return (
        row.agentName.toLowerCase().includes(q) ||
        row.comment.toLowerCase().includes(q) ||
        teamLabel(row.team).toLowerCase().includes(q) ||
        row.order.toLowerCase().includes(q)
      );
    });
  }, [rows, search, status, team, range.start, range.end]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "order":
          result = compareText(a.order, b.order);
          break;
        case "agentName":
          result = compareText(a.agentName, b.agentName);
          break;
        case "team":
          result = compareText(teamLabel(a.team), teamLabel(b.team));
          break;
        case "comment":
          result = compareText(a.comment, b.comment);
          break;
        case "status":
          result = compareText(statusLabel(a.status), statusLabel(b.status));
          break;
        case "ack":
          result = compareBool(a.ack, b.ack);
          break;
        case "created":
          result = compareText(a.createdAt, b.createdAt);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, status, team, range.start, range.end]);

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

  const handleResolve = async (row: MonitoringRecord) => {
    try {
      await resolveMonitoring(row.id);
      void refresh();
      notify(`Resolved #${row.order} · ${row.agentName}.`, { variant: "success" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not resolve item.", {
        variant: "error",
      });
    }
  };

  const handleDelete = async (row: MonitoringRecord) => {
    const ok = await confirmDelete({
      title: `Delete monitoring #${row.order}?`,
      description: `Remove the item for “${row.agentName}”.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await deleteMonitoring(row.id);
      void refresh();
      notify(`Deleted #${row.order}.`, { variant: "success" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not delete item.", {
        variant: "error",
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const ok = await confirmDelete({
      title: count === 1 ? "Delete 1 monitoring item?" : `Delete ${count} monitoring items?`,
      description:
        count === 1
          ? "This monitoring item will be permanently removed from the list."
          : "These monitoring items will be permanently removed from the list.",
      confirmLabel: count === 1 ? "Delete monitoring item" : "Delete monitoring items",
    });
    if (!ok) return;
    try {
      await Promise.all(selectedIds.map((id) => deleteMonitoring(id)));
      clearSelection();
      void refresh();
      notify(
        count === 1 ? "1 monitoring item deleted." : `${count} monitoring items deleted.`,
        { variant: "success" },
      );
    } catch (error) {
      void refresh();
      notify(error instanceof Error ? error.message : "Could not delete monitoring items.", {
        variant: "error",
      });
    }
  };

  return (
    <main className="monitoring-page" aria-label="Monitoring">
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
                placeholder="Search agent, comment, order…"
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
              { id: "active" as const, label: "Active" },
              { id: "resolved" as const, label: "Resolved" },
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
            noun="monitoring items"
          />
        </div>

        <div className="monitoring-toolbar-right">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            className={`cases-btn cases-btn--ghost monitoring-email-test-btn${emailTesting.enabled ? " is-active" : ""}`}
            onClick={() => setEmailTestingOpen(true)}
            title={
              emailTesting.enabled
                ? `Testing on → ${emailTesting.email}`
                : "Configure email testing"
            }
          >
            {emailTesting.enabled ? "Testing on" : "Email testing"}
          </button>
          <button
            type="button"
            className="cases-add-btn"
            onClick={() => {
              setEditing(null);
              setCreateOpen(true);
            }}
          >
            Add item
          </button>
        </div>
      </div>

      <section className="monitoring-page__table-wrap" aria-label="Monitoring table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table monitoring-table">
              <thead>
                <tr>
                  <SelectAllCheckbox
                    allSelected={allPageSelected}
                    someSelected={somePageSelected}
                    onToggle={toggleAllPage}
                    disabled={pageRows.length === 0}
                  />
                  <SortHeader
                    label="Order"
                    active={sortKey === "order"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "order", "asc");
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
                    label="Comment"
                    active={sortKey === "comment"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "comment", "asc");
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
                    label="Ack"
                    active={sortKey === "ack"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "ack", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Created"
                    active={sortKey === "created"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "created", "desc");
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
                      No monitoring items found. Create an item to get started.
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
                          label={`Select monitoring item #${row.order}`}
                        />
                        <td className="monitoring-table__order">{row.order}</td>
                        <td>{row.agentName}</td>
                        <td>{teamLabel(row.team)}</td>
                        <td className="monitoring-table__comment">{row.comment}</td>
                        <td>
                          <span className={`monitoring-status is-${row.status}`}>
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td>
                          <span className={`cases-flag${row.ack ? " is-on" : ""}`}>
                            {row.ack ? "Yes" : "No"}
                          </span>
                        </td>
                        <td>{formatMonitoringDate(row.createdAt)}</td>
                        <td className="cases-table__actions-col">
                          <RowActions
                            canResolve={row.status === "active"}
                            onView={() => setViewing(row)}
                            onEdit={() => {
                              setViewing(null);
                              setEditing(row);
                            }}
                            onResolve={() => handleResolve(row)}
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

      <MonitoringFormModal
        open={createOpen || Boolean(editing)}
        initial={editing}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          void refresh();
        }}
      />
      <MonitoringDetailsModal
        open={Boolean(viewing)}
        record={viewing}
        onClose={() => setViewing(null)}
      />
      <EmailTestingModal
        open={emailTestingOpen}
        onClose={() => {
          setEmailTesting(getEmailTestingSettings());
          setEmailTestingOpen(false);
        }}
      />
    </main>
  );
}
