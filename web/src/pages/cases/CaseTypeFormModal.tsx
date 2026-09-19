import { useEffect, useId, useState } from "react";

import { TEAM_OPTIONS, type AuditTeam } from "../../lib/audits";
import {
  emptyCaseTypeDraft,
  newCaseTypeId,
  saveCaseType,
  type CaseTypeDraft,
  type CaseTypeRecord,
} from "../../lib/caseTypes";
import { createCaseTypeRemote, updateCaseTypeRemote } from "../../lib/externalApi";
import { useNotify } from "../../notifications/NotificationContext";

type CaseTypeFormModalProps = {
  open: boolean;
  initial?: CaseTypeRecord | null;
  onClose: () => void;
  onSaved: () => void;
};

function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
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
        {description ? <p className="cases-switch__desc">{description}</p> : null}
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

export function CaseTypeFormModal({ open, initial, onClose, onSaved }: CaseTypeFormModalProps) {
  const { notify } = useNotify();
  const [draft, setDraft] = useState<CaseTypeDraft>(() => emptyCaseTypeDraft());
  const editing = Boolean(initial);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        name: initial.name,
        sortOrder: initial.sortOrder,
        active: initial.active,
        team: initial.team || "calls",
      });
    } else {
      setDraft(emptyCaseTypeDraft());
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

  const patch = (partial: Partial<CaseTypeDraft>) => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const canSave = draft.name.trim().length > 0 && Number.isFinite(draft.sortOrder);

  const handleSave = async () => {
    if (!canSave) {
      notify("Enter a case type name before saving.", { variant: "error" });
      return;
    }
    const record: CaseTypeRecord = {
      id: initial?.id ?? newCaseTypeId(),
      name: draft.name.trim(),
      sortOrder: Number(draft.sortOrder) || 1,
      active: draft.active,
      team: draft.team || "calls",
    };
    try {
      if (editing) await updateCaseTypeRemote(record);
      else await createCaseTypeRemote(record);
      notify(editing ? "Case updated." : "Case created.", { variant: "success" });
      onSaved();
      onClose();
    } catch {
      saveCaseType(record);
      notify(editing ? "Case updated locally." : "Case created locally.", { variant: "success" });
      onSaved();
      onClose();
    }
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog cases-modal__dialog--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-type-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="case-type-modal-title" className="cases-modal__title">
              {editing ? "Edit case" : "Add case"}
            </h2>
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

        <div className="cases-modal__body">
          <div className="cases-wizard-panel">
            <label className="cases-field">
              <span className="cases-field__label">Case type name</span>
              <input
                className="cases-field__control"
                type="text"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="e.g. Order inquiry"
                autoFocus
              />
            </label>

            <label className="cases-field">
              <span className="cases-field__label">Team</span>
              <select
                className="cases-field__control"
                value={draft.team || "calls"}
                onChange={(event) => patch({ team: event.target.value as AuditTeam })}
              >
                {TEAM_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="cases-field">
              <span className="cases-field__label">Sort order</span>
              <input
                className="cases-field__control"
                type="number"
                min={1}
                value={draft.sortOrder}
                onChange={(event) => patch({ sortOrder: Number(event.target.value) })}
              />
            </label>

            <SwitchField
              label="Active"
              description="Shown in Audits and Supervisor Requests"
              checked={draft.active}
              onChange={(active) => patch({ active })}
            />
          </div>
        </div>

        <footer className="cases-wizard-footer">
          <button
            type="button"
            className="cases-btn cases-btn--primary"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {editing ? "Save changes" : "Create case"}
          </button>
        </footer>
      </div>
    </div>
  );
}
