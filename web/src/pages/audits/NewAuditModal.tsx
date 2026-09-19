import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import {
  RESULT_OPTIONS,
  TEAM_OPTIONS,
  caseTypeLabel,
  computeQualityScore,
  createEmptyMetrics,
  earnedForResult,
  formatAuditDate,
  formatEarned,
  getAudit,
  listAgents,
  matchesAgentSearch,
  newAuditId,
  resultLabel,
  saveAudit,
  teamLabel,
  todayIsoDate,
  withoutIssueResolvedMetrics,
  type AuditTeam,
  type CaseType,
  type EvalResult,
  type QaMetricRow,
} from "../../lib/audits";
import { fetchAgents, fetchCaseTypes, fetchTeamMetrics, saveAuditRemote } from "../../lib/externalApi";
import { diffAudit, logAuditEdit } from "../../lib/teamTracking";
import { useNotify } from "../../notifications/NotificationContext";

type Step = 1 | 2 | 3;

type NewAuditModalProps = {
  open: boolean;
  onClose: () => void;
  reevaluateId?: string | null;
  onSaved?: (auditId: string) => void;
};

function AgentSearch({
  team,
  selectedId,
  onSelect,
}: {
  team: AuditTeam | "";
  selectedId: string;
  onSelect: (agent: {
    id: string;
    name: string;
    alias: string;
    lastInternalAudit: string;
    lastInternalAuditScore?: string;
  }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState(() => listAgents());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
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
      });
    return () => {
      cancelled = true;
    };
  }, [team]);

  const pool = useMemo(
    () => (team ? agents.filter((agent) => agent.team === team) : []),
    [agents, team],
  );

  const matches = useMemo(() => {
    if (!team) return [];
    if (selectedId) {
      const agent = agents.find((row) => row.id === selectedId);
      if (agent) {
        const label =
          agent.alias && agent.alias !== agent.name
            ? `${agent.name} · ${agent.alias}`
            : agent.name;
        if (query === label || query === agent.name) return pool;
      }
    }
    return pool.filter((agent) => matchesAgentSearch(agent, query));
  }, [agents, pool, query, selectedId, team]);

  useEffect(() => {
    if (!selectedId) return;
    const agent = agents.find((row) => row.id === selectedId);
    if (!agent) return;
    setQuery(agent.alias && agent.alias !== agent.name ? `${agent.name} · ${agent.alias}` : agent.name);
  }, [selectedId, agents]);

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

  return (
    <div className="audits-agent-search" ref={rootRef}>
      <span className="audits-field__label" id="new-audit-agent-search">
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
          aria-labelledby="new-audit-agent-search"
          aria-expanded={open}
          aria-controls="new-audit-agent-list"
          disabled={!team}
          placeholder={team ? "Search by name or alias…" : "Select a team first"}
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            if (selectedId) {
              onSelect({ id: "", name: "", alias: "", lastInternalAudit: "—", lastInternalAuditScore: "" });
            }
          }}
          onFocus={() => {
            if (team) setOpen(true);
          }}
        />
      </div>

      {open && team ? (
        <div className="audits-agent-search__menu" id="new-audit-agent-list" role="listbox">
          {matches.length === 0 ? (
            <p className="audits-filter__empty">
              {query.trim() ? "No agents found" : "Type a name or alias to search"}
            </p>
          ) : (
            matches.map((agent) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={agent.id === selectedId}
                className={`audits-agent-search__option${agent.id === selectedId ? " is-active" : ""}`}
                onClick={() => {
                  onSelect({
                    id: agent.id,
                    name: agent.name,
                    alias: agent.alias,
                    lastInternalAudit: agent.lastInternalAudit,
                    lastInternalAuditScore: agent.lastInternalAuditScore || "",
                  });
                  setQuery(
                    agent.alias && agent.alias !== agent.name
                      ? `${agent.name} · ${agent.alias}`
                      : agent.name,
                  );
                  setOpen(false);
                }}
              >
                <span className="audits-agent-search__name">{agent.name}</span>
                <span className="audits-agent-search__meta">
                  {agent.alias}
                  {agent.lastInternalAuditScore ? ` · ${agent.lastInternalAuditScore}%` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function InlineResultSelect({
  value,
  onChange,
}: {
  value: EvalResult;
  onChange: (value: EvalResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placement: "up" | "down" } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = RESULT_OPTIONS.find((option) => option.id === value)?.label ?? "N/A";

  const close = useCallback(() => setOpen(false), []);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight || 160;
    const menuWidth = Math.max(rect.width, menuRef.current?.offsetWidth || 140);
    const gap = 4;
    const pad = 8;
    const spaceBelow = window.innerHeight - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    const placement: "up" | "down" =
      spaceBelow < menuHeight + gap && spaceAbove > spaceBelow ? "up" : "down";

    let top = placement === "down" ? rect.bottom + gap : rect.top - gap - menuHeight;
    let left = rect.left;
    top = Math.max(pad, Math.min(top, window.innerHeight - menuHeight - pad));
    left = Math.max(pad, Math.min(left, window.innerWidth - menuWidth - pad));

    setCoords({ top, left, width: menuWidth, placement });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    const onReposition = () => reposition();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, close, reposition]);

  return (
    <div className={`audits-result-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`audits-result-select__trigger${open ? " is-open" : ""}${coords ? ` is-${coords.placement}` : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Result"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`audits-result-select__value is-${value}`}>{selected}</span>
        <svg className="audits-result-select__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className={`audits-result-select__menu audits-result-select__menu--fixed is-${coords?.placement ?? "down"}${coords ? "" : " is-measuring"}`}
              role="listbox"
              style={
                coords
                  ? { top: coords.top, left: coords.left, width: coords.width }
                  : { top: 0, left: 0, visibility: "hidden" }
              }
            >
              {RESULT_OPTIONS.map((option) => {
                const isActive = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`audits-result-select__option is-${option.id}${isActive ? " is-active" : ""}`}
                    onClick={() => {
                      onChange(option.id);
                      close();
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: T | "";
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value)?.label ?? placeholder ?? "Select";
  const labelId = `new-audit-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

  return (
    <div className="audits-filter audits-filter--form" ref={rootRef}>
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
        <span className={`audits-filter__value${!value ? " is-placeholder" : ""}`}>{selected}</span>
        <svg className="audits-filter__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="audits-filter__menu" role="listbox" aria-labelledby={labelId}>
          {options.length === 0 ? (
            <p className="audits-filter__empty">No options available</p>
          ) : (
            options.map((option) => {
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
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function emptyFormState() {
  return {
    step: 1 as Step,
    team: "" as AuditTeam | "",
    agentId: "",
    agentName: "",
    alias: "",
    lastInternalAudit: "—",
    lastInternalAuditScore: "",
    caseType: "" as CaseType | "",
    orderNumber: "",
    phoneNumber: "",
    ticketId: "",
    comments: "",
    otherInformation: "",
    metrics: createEmptyMetrics(),
    issueResolved: "" as "yes" | "no" | "",
    issueResolvedNote: "",
  };
}

export function NewAuditModal({ open, onClose, reevaluateId = null, onSaved }: NewAuditModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotify();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [team, setTeam] = useState<AuditTeam | "">("");
  const [agentId, setAgentId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [alias, setAlias] = useState("");
  const [lastInternalAudit, setLastInternalAudit] = useState("—");
  const [lastInternalAuditScore, setLastInternalAuditScore] = useState("");
  const [caseType, setCaseType] = useState<CaseType | "">("");
  const [auditDate] = useState(todayIsoDate());
  const [orderNumber, setOrderNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [comments, setComments] = useState("");
  const [otherInformation, setOtherInformation] = useState("");
  const [metrics, setMetrics] = useState<QaMetricRow[]>(() => createEmptyMetrics());
  const [issueResolved, setIssueResolved] = useState<"yes" | "no" | "">("");
  const [issueResolvedNote, setIssueResolvedNote] = useState("");
  const [originalCreatedBy, setOriginalCreatedBy] = useState("");
  const [originalAuditDate, setOriginalAuditDate] = useState("");
  const [caseTypeOptions, setCaseTypeOptions] = useState<Array<{ id: CaseType; label: string }>>([]);
  const wasOpenRef = useRef(false);
  const metricsTeamRef = useRef<AuditTeam | "">("");

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (!justOpened) return;

    const reset = emptyFormState();
    setStep(reset.step);
    setTeam(reset.team);
    setAgentId(reset.agentId);
    setAgentName(reset.agentName);
    setAlias(reset.alias);
    setLastInternalAudit(reset.lastInternalAudit);
    setLastInternalAuditScore(reset.lastInternalAuditScore);
    setCaseType(reset.caseType);
    setOrderNumber(reset.orderNumber);
    setPhoneNumber(reset.phoneNumber);
    setTicketId(reset.ticketId);
    setComments(reset.comments);
    setOtherInformation(reset.otherInformation);
    setMetrics(reset.metrics);
    setIssueResolved(reset.issueResolved);
    setIssueResolvedNote(reset.issueResolvedNote);
    setOriginalCreatedBy("");
    setOriginalAuditDate("");
    setCaseTypeOptions([]);
    metricsTeamRef.current = "";

    if (reevaluateId) {
      const existing = getAudit(reevaluateId);
      if (existing) {
        setTeam(existing.team);
        setAgentId(existing.agentId);
        setAgentName(existing.agentName);
        setAlias(existing.alias);
        setLastInternalAudit(existing.lastInternalAudit || formatAuditDate(existing.date));
        setLastInternalAuditScore(existing.qualityScore || existing.score || "");
        setCaseType(existing.caseType);
        setOrderNumber(existing.orderNumber);
        setPhoneNumber(existing.phoneNumber);
        setTicketId(existing.ticketNumber);
        setComments(existing.comments);
        setOtherInformation(existing.otherInformation || "");
        setMetrics(
          existing.metrics.length
            ? withoutIssueResolvedMetrics(existing.metrics)
            : createEmptyMetrics(),
        );
        setIssueResolved(existing.issueResolved);
        setIssueResolvedNote(existing.issueResolvedNote);
        setOriginalCreatedBy(existing.createdBy || "");
        setOriginalAuditDate(existing.date || "");
        metricsTeamRef.current = existing.team;
      }
    }
  }, [open, reevaluateId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !team) {
      setCaseTypeOptions([]);
      return;
    }
    let cancelled = false;
    void fetchCaseTypes({ team })
      .then((payload) => {
        if (cancelled) return;
        const options = (payload.caseTypes ?? [])
          .filter((row) => row.active !== false)
          .map((row) => ({
            id: (row.name || row.id) as CaseType,
            label: row.name || row.id,
          }));
        setCaseTypeOptions(options);
      })
      .catch(() => {
        if (!cancelled) setCaseTypeOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, team]);

  useEffect(() => {
    if (!open || !team || reevaluateId) return;
    if (metricsTeamRef.current === team) return;
    let cancelled = false;
    void fetchTeamMetrics({ team })
      .then((payload) => {
        if (cancelled) return;
        metricsTeamRef.current = team;
        if (!payload.connected || payload.metrics.length === 0) {
          setMetrics(createEmptyMetrics());
          return;
        }
        setMetrics(
          withoutIssueResolvedMetrics(payload.metrics).map((row) => ({
            id: row.id,
            metric: row.label,
            result: "n/a" as EvalResult,
            earned: "—",
            qaNote: "",
          })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          metricsTeamRef.current = team;
          setMetrics(createEmptyMetrics());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, team, reevaluateId]);

  const createdByName = user?.full_name || user?.username || "—";
  const editorName = user?.full_name?.trim() || user?.username || "—";
  const evaluationMetrics = useMemo(() => withoutIssueResolvedMetrics(metrics), [metrics]);
  const qualityScore = computeQualityScore(evaluationMetrics);
  const needsOrderPhone = team === "calls" || team === "sales";
  const needsTicket = team === "tickets" || team === "live-chat";

  const selectAgent = (agent: {
    id: string;
    name: string;
    alias: string;
    lastInternalAudit: string;
    lastInternalAuditScore?: string;
  }) => {
    setAgentId(agent.id);
    setAgentName(agent.name);
    setAlias(agent.alias);
    const last = (agent.lastInternalAudit || "").trim();
    setLastInternalAudit(last && last !== "—" ? formatAuditDate(last) : "—");
    setLastInternalAuditScore((agent.lastInternalAuditScore || "").trim());
  };

  const updateMetric = (id: string, patch: Partial<QaMetricRow>) => {
    setMetrics((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.result) next.earned = earnedForResult(patch.result);
        return next;
      }),
    );
  };

  const canStep1 = Boolean(team && agentId);
  const canStep2 = Boolean(caseType && issueResolved);
  const canSave = canStep1 && canStep2;

  const goNext = () => {
    if (step === 1 && !canStep1) {
      notify("Select a team and search for an agent to continue.", { variant: "error" });
      return;
    }
    if (step === 2) {
      if (!caseType) {
        notify("Select a case type to continue.", { variant: "error" });
        return;
      }
      if (!issueResolved) {
        notify("Select whether the issue was resolved.", { variant: "error" });
        return;
      }
    }
    setStep((current) => Math.min(3, current + 1) as Step);
  };

  const goBack = () => setStep((current) => Math.max(1, current - 1) as Step);

  const handleSave = async () => {
    if (!canSave || !team || !caseType) return;
    const id = reevaluateId || newAuditId();
    const score = qualityScore;
    const existing = reevaluateId ? getAudit(reevaluateId) : null;
    const next = {
      id,
      date: reevaluateId && originalAuditDate ? originalAuditDate : auditDate,
      team,
      agentName: agentName.trim() || "—",
      alias: alias.trim() || "—",
      agentId: agentId || "",
      score,
      shared: existing?.shared ?? false,
      evaluate: "done" as const,
      reevaluated: Boolean(reevaluateId) || Boolean(existing?.reevaluated),
      caseType,
      status: "Completed",
      ticketNumber: ticketId.trim(),
      orderNumber: orderNumber.trim(),
      phoneNumber: phoneNumber.trim(),
      comments: comments.trim(),
      otherInformation: otherInformation.trim(),
      createdBy: reevaluateId ? originalCreatedBy || createdByName : createdByName,
      qualityScore: score,
      issueResolved,
      issueResolvedNote: issueResolvedNote.trim(),
      metrics: evaluationMetrics,
      lastInternalAudit,
    };
    try {
      const changes =
        existing && reevaluateId ? diffAudit(existing, next) : undefined;
      const saved = await saveAuditRemote(next, {
        isNew: !reevaluateId,
        changes: changes?.length ? changes : undefined,
      });
      saveAudit(saved);
      if (existing && reevaluateId) {
        logAuditEdit(existing, saved, editorName);
      }
      notify(reevaluateId ? "Audit re-evaluated." : "Audit saved.", { variant: "success" });
      onClose();
      if (onSaved) onSaved(saved.id);
      else navigate(`/audits/audit-details/${saved.id}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save audit.", {
        variant: "error",
      });
    }
  };

  if (!open) return null;

  return (
    <div
      className="audits-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="audits-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-audit-title"
        ref={dialogRef}
      >
        <div className="audits-modal__header">
          <div>
            <h2 id="new-audit-title" className="audits-modal__title">
              {reevaluateId ? "Re evaluate audit" : "Add audit"}
            </h2>
            <p className="audits-modal__subtitle">Step {step} of 3</p>
          </div>
          <button type="button" className="audits-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="audits-steps audits-steps--modal" aria-label="Wizard steps">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              className={`audits-steps__item${step === n ? " is-active" : ""}${step > n ? " is-done" : ""}`}
              onClick={() => {
                if (n < step) setStep(n as Step);
              }}
            >
              <span className="audits-steps__num">{n}</span>
              <span className="audits-steps__label">
                {n === 1 ? "Team & agent" : n === 2 ? "Details & QA" : "Final overview"}
              </span>
            </button>
          ))}
        </div>

        <div className={`audits-modal__body${step >= 2 ? " audits-modal__body--scroll" : ""}`}>
          <div className="audits-wizard-panel" hidden={step !== 1}>
              <h3 className="audits-section-title">Select team and agent</h3>
              <div className="audits-form-grid">
                <FilterSelect
                  label="Team"
                  value={team}
                  options={TEAM_OPTIONS}
                  placeholder="Select team"
                  onChange={(value) => {
                    setTeam(value);
                    setCaseType("");
                    metricsTeamRef.current = "";
                    selectAgent({ id: "", name: "", alias: "", lastInternalAudit: "—", lastInternalAuditScore: "" });
                  }}
                />
                <AgentSearch team={team} selectedId={agentId} onSelect={selectAgent} />
              </div>

              <div className="audits-detail-field">
                <span className="audits-detail-field__label">Created by</span>
                <span className="audits-detail-field__value">{createdByName}</span>
              </div>

              {team && agentId ? (
                <div className="audits-last-audit">
                  <span className="audits-last-audit__label">Last internal audit</span>
                  <span className="audits-last-audit__value">
                    {lastInternalAudit}
                    {lastInternalAuditScore ? (
                      <span className="audits-last-audit__score"> · {lastInternalAuditScore}%</span>
                    ) : null}
                  </span>
                </div>
              ) : null}
          </div>

          <div className="audits-wizard-panel" hidden={step !== 2}>
              <h3 className="audits-section-title">Audit details</h3>
              <div className="audits-form-grid">
                <FilterSelect
                  label="Case type"
                  value={caseType}
                  options={caseTypeOptions}
                  placeholder={team ? "Select case type" : "Select a team first"}
                  onChange={setCaseType}
                />
                <label className="audits-field">
                  <span className="audits-field__label">Audit date</span>
                  <input className="audits-field__input" value={formatAuditDate(auditDate)} readOnly />
                </label>
              </div>

              {needsOrderPhone ? (
                <div className="audits-form-grid">
                  <label className="audits-field">
                    <span className="audits-field__label">Order number</span>
                    <input
                      className="audits-field__input"
                      value={orderNumber}
                      onChange={(event) => setOrderNumber(event.target.value)}
                      placeholder="Order number"
                    />
                  </label>
                  <label className="audits-field">
                    <span className="audits-field__label">Phone number</span>
                    <input
                      className="audits-field__input"
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      placeholder="Phone number"
                    />
                  </label>
                </div>
              ) : null}

              {needsTicket ? (
                <div className="audits-form-grid">
                  <label className="audits-field">
                    <span className="audits-field__label">Ticket ID</span>
                    <input
                      className="audits-field__input"
                      value={ticketId}
                      onChange={(event) => setTicketId(event.target.value)}
                      placeholder="Ticket ID"
                    />
                  </label>
                </div>
              ) : null}

              <label className="audits-field">
                <span className="audits-field__label">Comments</span>
                <textarea
                  className="audits-field__textarea"
                  rows={3}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                  placeholder="Optional comments"
                />
              </label>

              <label className="audits-field">
                <span className="audits-field__label">Other information</span>
                <textarea
                  className="audits-field__textarea"
                  rows={3}
                  value={otherInformation}
                  onChange={(event) => setOtherInformation(event.target.value)}
                  placeholder="Optional other information"
                />
              </label>

              <h3 className="audits-section-title">QA Evaluation</h3>
              <div className="data-table-shell audits-eval-shell audits-eval-shell--modal">
                <div className="data-table-shell__scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col"><span className="data-table__th-static">Metric</span></th>
                        <th scope="col"><span className="data-table__th-static">Result</span></th>
                        <th scope="col"><span className="data-table__th-static">QA note</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluationMetrics.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="audits-table__empty">
                            No QA metrics available yet.
                          </td>
                        </tr>
                      ) : (
                        evaluationMetrics.map((row) => (
                          <tr key={row.id}>
                            <td>{row.metric}</td>
                            <td>
                              <InlineResultSelect
                                value={row.result}
                                onChange={(result) => updateMetric(row.id, { result })}
                              />
                            </td>
                            <td>
                              <input
                                className="audits-inline-input"
                                value={row.qaNote}
                                onChange={(event) => updateMetric(row.id, { qaNote: event.target.value })}
                                placeholder="Note"
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="audits-resolved">
                <p className="audits-resolved__title">Issue was resolved</p>
                <div className="audits-resolved__choices">
                  <label className={`audits-resolved__choice${issueResolved === "yes" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="issue-resolved"
                      checked={issueResolved === "yes"}
                      onChange={() => setIssueResolved("yes")}
                    />
                    Yes
                  </label>
                  <label className={`audits-resolved__choice${issueResolved === "no" ? " is-active" : ""}`}>
                    <input
                      type="radio"
                      name="issue-resolved"
                      checked={issueResolved === "no"}
                      onChange={() => setIssueResolved("no")}
                    />
                    No
                  </label>
                </div>
                <label className="audits-field">
                  <span className="audits-field__label">Note</span>
                  <textarea
                    className="audits-field__textarea"
                    rows={2}
                    value={issueResolvedNote}
                    onChange={(event) => setIssueResolvedNote(event.target.value)}
                    placeholder="Add a note about the resolution"
                  />
                </label>
              </div>
          </div>

          <div className="audits-wizard-panel" hidden={step !== 3}>
              <h3 className="audits-section-title">Final overview</h3>
              <p className="audits-overview__lead">Review everything below before saving.</p>

              <div className="audits-overview-grid">
                <div className="audits-detail-field">
                  <span className="audits-detail-field__label">Team</span>
                  <span className="audits-detail-field__value">{team ? teamLabel(team) : "—"}</span>
                </div>
              <div className="audits-detail-field">
                <span className="audits-detail-field__label">Agent</span>
                <span className="audits-detail-field__value">
                  {agentName || "—"}
                  {alias ? ` (${alias})` : ""}
                </span>
              </div>
              <div className="audits-detail-field">
                <span className="audits-detail-field__label">Created by</span>
                <span className="audits-detail-field__value">{createdByName}</span>
              </div>
                <div className="audits-detail-field">
                  <span className="audits-detail-field__label">Case type</span>
                  <span className="audits-detail-field__value">{caseType ? caseTypeLabel(caseType) : "—"}</span>
                </div>
                <div className="audits-detail-field">
                  <span className="audits-detail-field__label">Audit date</span>
                  <span className="audits-detail-field__value">{formatAuditDate(auditDate)}</span>
                </div>
                {needsOrderPhone ? (
                  <>
                    <div className="audits-detail-field">
                      <span className="audits-detail-field__label">Order number</span>
                      <span className="audits-detail-field__value">{orderNumber || "—"}</span>
                    </div>
                    <div className="audits-detail-field">
                      <span className="audits-detail-field__label">Phone number</span>
                      <span className="audits-detail-field__value">{phoneNumber || "—"}</span>
                    </div>
                  </>
                ) : null}
                {needsTicket ? (
                  <div className="audits-detail-field">
                    <span className="audits-detail-field__label">Ticket ID</span>
                    <span className="audits-detail-field__value">{ticketId || "—"}</span>
                  </div>
                ) : null}
                <div className="audits-detail-field">
                  <span className="audits-detail-field__label">Quality score</span>
                  <span className="audits-detail-field__value">{qualityScore}</span>
                </div>
                <div className="audits-detail-field">
                  <span className="audits-detail-field__label">Issue resolved</span>
                  <span className="audits-detail-field__value">
                    {issueResolved === "yes" ? "Yes" : issueResolved === "no" ? "No" : "—"}
                  </span>
                </div>
                <div className="audits-detail-field audits-detail-field--wide">
                  <span className="audits-detail-field__label">Comments</span>
                  <span className="audits-detail-field__value">{comments || "—"}</span>
                </div>
                <div className="audits-detail-field audits-detail-field--wide">
                  <span className="audits-detail-field__label">Other information</span>
                  <span className="audits-detail-field__value">{otherInformation || "—"}</span>
                </div>
                <div className="audits-detail-field audits-detail-field--wide">
                  <span className="audits-detail-field__label">Resolution note</span>
                  <span className="audits-detail-field__value">{issueResolvedNote || "—"}</span>
                </div>
              </div>

              <div className="data-table-shell audits-eval-shell audits-eval-shell--modal">
                <div className="data-table-shell__scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col"><span className="data-table__th-static">Metric</span></th>
                        <th scope="col"><span className="data-table__th-static">Result</span></th>
                        <th scope="col"><span className="data-table__th-static">Earned</span></th>
                        <th scope="col"><span className="data-table__th-static">QA note</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluationMetrics.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="audits-table__empty">
                            No QA metrics available yet.
                          </td>
                        </tr>
                      ) : (
                        evaluationMetrics.map((row) => (
                          <tr key={row.id}>
                            <td>{row.metric}</td>
                            <td>{resultLabel(row.result)}</td>
                            <td>{formatEarned(row.earned)}</td>
                            <td>{row.qaNote || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
          </div>
        </div>

        <div className="audits-wizard-footer">
          {step > 1 ? (
            <button type="button" className="audits-btn audits-btn--ghost" onClick={goBack}>
              Back
            </button>
          ) : null}
          {step < 3 ? (
            <button type="button" className="audits-btn audits-btn--primary" onClick={goNext}>
              Continue
            </button>
          ) : (
            <button type="button" className="audits-btn audits-btn--primary" onClick={handleSave} disabled={!canSave}>
              Save audit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
