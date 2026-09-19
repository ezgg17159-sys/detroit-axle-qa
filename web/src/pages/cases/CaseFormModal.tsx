import { useEffect, useId, useRef, useState } from "react";

import { TEAM_OPTIONS, teamLabel, type AuditTeam } from "../../lib/audits";
import {
  emptyCaseDraft,
  newCaseId,
  saveCase,
  slugifyCaseKey,
  type CaseDraft,
  type CaseRecord,
} from "../../lib/cases";
import { createTeamMetricRemote, updateTeamMetricRemote } from "../../lib/externalApi";
import { useNotify } from "../../notifications/NotificationContext";

type Step = 1 | 2 | 3;

type CaseFormModalProps = {
  open: boolean;
  initial?: CaseRecord | null;
  onClose: () => void;
  onSaved: () => void;
};

function TeamSelect({
  value,
  onChange,
}: {
  value: AuditTeam;
  onChange: (value: AuditTeam) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = TEAM_OPTIONS.find((option) => option.id === value)?.label ?? value;

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
    <div className="cases-field cases-select" ref={rootRef}>
      <span className="cases-field__label" id="cases-team-label">
        Team
      </span>
      <button
        type="button"
        className={`cases-select__trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="cases-team-label"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="cases-select__value">{selected}</span>
        <svg className="cases-select__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="cases-select__menu" role="listbox" aria-labelledby="cases-team-label">
          {TEAM_OPTIONS.map((option) => {
            const isActive = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`cases-select__option${isActive ? " is-active" : ""}`}
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

function NumberStepper({
  label,
  value,
  step = 0.5,
  min = 0,
  max = 100,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const bump = (dir: 1 | -1) => {
    const next = Math.round((value + dir * step) * 100) / 100;
    onChange(Math.min(max, Math.max(min, next)));
  };

  return (
    <label className="cases-field" htmlFor={id}>
      <span className="cases-field__label">{label}</span>
      <span className="cases-stepper">
        <input
          id={id}
          className="cases-stepper__input"
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isNaN(next)) return;
            onChange(Math.min(max, Math.max(min, next)));
          }}
        />
        <span className="cases-stepper__arrows">
          <button type="button" className="cases-stepper__btn" aria-label={`Increase ${label}`} onClick={() => bump(1)}>
            ▲
          </button>
          <button type="button" className="cases-stepper__btn" aria-label={`Decrease ${label}`} onClick={() => bump(-1)}>
            ▼
          </button>
        </span>
      </span>
    </label>
  );
}

function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="cases-switch">
      <div className="cases-switch__copy">
        <label className="cases-switch__label" htmlFor={id}>
          {label}
        </label>
        <p className="cases-switch__desc">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`cases-switch__control${checked ? " is-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="cases-switch__thumb" />
      </button>
    </div>
  );
}

export function CaseFormModal({ open, initial, onClose, onSaved }: CaseFormModalProps) {
  const { notify } = useNotify();
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<CaseDraft>(() => emptyCaseDraft());
  const editing = Boolean(initial);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    if (initial) {
      setDraft({
        key: initial.key,
        label: initial.label,
        team: initial.team,
        sortOrder: initial.sortOrder,
        passPoints: initial.passPoints,
        borderlinePoints: initial.borderlinePoints,
        countsTowardScore: initial.countsTowardScore,
        canAutoFail: initial.canAutoFail,
        active: initial.active,
      });
    } else {
      setDraft(emptyCaseDraft());
    }
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

  const patch = (partial: Partial<CaseDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...partial };
      // Primary key is auto-derived from label for new metrics; locked when editing.
      if (!editing && partial.label !== undefined) {
        next.key = slugifyCaseKey(partial.label);
      }
      return next;
    });
  };

  const canContinueStep1 =
    draft.team &&
    draft.label.trim().length > 0 &&
    draft.key.trim().length > 0 &&
    Number.isFinite(draft.sortOrder);

  const handleSave = async () => {
    if (!canContinueStep1) {
      notify("Complete identity fields before saving.", { variant: "error" });
      setStep(1);
      return;
    }
    const record: CaseRecord = {
      id: initial?.id ?? newCaseId(),
      ...draft,
      key: editing ? draft.key.trim() : slugifyCaseKey(draft.label),
      label: draft.label.trim(),
    };
    try {
      if (editing) await updateTeamMetricRemote(record);
      else await createTeamMetricRemote(record);
      notify(editing ? "Metric updated." : "Metric created.", { variant: "success" });
      onSaved();
      onClose();
    } catch {
      saveCase(record);
      notify(editing ? "Metric updated locally." : "Metric created locally.", { variant: "success" });
      onSaved();
      onClose();
    }
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cases-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="cases-modal-title" className="cases-modal__title">
              {editing ? "Edit metric" : "Add metric"}
            </h2>
            <p className="cases-modal__subtitle">Step {step} of 3</p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="cases-steps" aria-label="Wizard steps">
          {([1, 2, 3] as const).map((n) => (
            <div
              key={n}
              className={`cases-steps__item${step === n ? " is-active" : ""}${step > n ? " is-done" : ""}`}
            >
              <span className="cases-steps__num">{n}</span>
              <span className="cases-steps__label">
                {n === 1 ? "Identity" : n === 2 ? "Scoring" : "Options"}
              </span>
            </div>
          ))}
        </div>

        <div className="cases-modal__body">
          {step === 1 ? (
            <div className="cases-wizard-panel">
              <TeamSelect value={draft.team} onChange={(team) => patch({ team })} />

              <label className="cases-field">
                <span className="cases-field__label">Sort order</span>
                <input
                  className="cases-field__control"
                  type="number"
                  min={1}
                  step={1}
                  value={draft.sortOrder}
                  onChange={(event) => patch({ sortOrder: Number(event.target.value) || 1 })}
                />
              </label>

              <label className="cases-field">
                <span className="cases-field__label">Label</span>
                <input
                  className="cases-field__control"
                  type="text"
                  value={draft.label}
                  placeholder="e.g. Order inquiry"
                  onChange={(event) => patch({ label: event.target.value })}
                />
              </label>

              <label className="cases-field">
                <span className="cases-field__label">Key</span>
                <input
                  className="cases-field__control cases-field__control--readonly"
                  type="text"
                  value={draft.key}
                  placeholder="Auto from label"
                  readOnly
                  aria-readonly="true"
                  title={editing ? "Primary key is locked after create" : "Auto-generated primary key from label"}
                />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="cases-wizard-panel">
              <NumberStepper
                label="Pass points"
                value={draft.passPoints}
                onChange={(passPoints) => patch({ passPoints })}
              />
              <NumberStepper
                label="Borderline points"
                value={draft.borderlinePoints}
                onChange={(borderlinePoints) => patch({ borderlinePoints })}
              />
              <p className="cases-hint">
                Team: <strong>{teamLabel(draft.team)}</strong>
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="cases-wizard-panel">
              <SwitchField
                label="Counts toward score"
                description="Include in quality score math"
                checked={draft.countsTowardScore}
                onChange={(countsTowardScore) => patch({ countsTowardScore })}
              />
              <SwitchField
                label="Can auto-fail"
                description="Fail result can zero the audit"
                checked={draft.canAutoFail}
                onChange={(canAutoFail) => patch({ canAutoFail })}
              />
              <SwitchField
                label="Active"
                description="Shown in Audits scoring UI"
                checked={draft.active}
                onChange={(active) => patch({ active })}
              />
            </div>
          ) : null}
        </div>

        <footer className="cases-wizard-footer">
          {step > 1 ? (
            <button
              type="button"
              className="cases-btn cases-btn--ghost"
              onClick={() => setStep((current) => (current - 1) as Step)}
            >
              Back
            </button>
          ) : null}
          {step < 3 ? (
            <button
              type="button"
              className="cases-btn cases-btn--primary"
              disabled={step === 1 && !canContinueStep1}
              onClick={() => setStep((current) => (current + 1) as Step)}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="cases-btn cases-btn--primary"
              onClick={() => void handleSave()}
            >
              {editing ? "Save changes" : "Create metric"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
