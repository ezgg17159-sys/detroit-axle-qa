import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  caseTypeLabel,
  deleteAudit,
  formatAuditDate,
  getAudit,
  resultLabel,
  saveAudit,
  teamLabel,
  type AuditRecord,
} from "../../lib/audits";
import { useNotify } from "../../notifications/NotificationContext";
import { NewAuditModal } from "./NewAuditModal";

export function AuditDetailsPage() {
  const { auditId = "" } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotify();
  const [audit, setAudit] = useState<AuditRecord | null>(() => getAudit(auditId));
  const [actionsOpen, setActionsOpen] = useState(false);
  const [reevaluateOpen, setReevaluateOpen] = useState(false);
  const [coachingView, setCoachingView] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAudit(getAudit(auditId));
  }, [auditId]);

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

  if (!audit) {
    return (
      <main className="audits-page audits-details" aria-label="Audit details">
        <div className="audits-empty-card">
          <h2 className="audits-empty-card__title">Audit not found</h2>
          <p className="audits-empty-card__text">This audit may have been deleted or the link is invalid.</p>
          <Link to="/audits/audit-list" className="audits-new__btn">
            Back to audit list
          </Link>
        </div>
      </main>
    );
  }

  const handleDelete = () => {
    deleteAudit(audit.id);
    notify("Audit deleted.", { variant: "success" });
    navigate("/audits/audit-list", { replace: true });
  };

  const handleShare = () => {
    const next = { ...audit, shared: true };
    saveAudit(next);
    setAudit(next);
    setActionsOpen(false);
    notify("Share with agent will use Power Automate later.", { variant: "info" });
  };

  const handleReEvaluate = () => {
    setActionsOpen(false);
    setReevaluateOpen(true);
  };

  const handleCoaching = () => {
    setActionsOpen(false);
    setCoachingView(true);
  };

  const showOrderPhone = audit.team === "calls" || audit.team === "sales";

  return (
    <main className="audits-page audits-details" aria-label="Audit details">
      <div className="audits-details__top">
        <Link to="/audits/audit-list" className="audits-back">
          <svg className="audits-back__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="audits-back__text">Audit list</span>
        </Link>

        <div className="audits-actions" ref={actionsRef}>
          <button
            type="button"
            className={`audits-actions__trigger${actionsOpen ? " is-open" : ""}`}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((open) => !open)}
          >
            Actions
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {actionsOpen ? (
            <div className="audits-actions__menu" role="menu">
              <button type="button" role="menuitem" className="audits-actions__item" onClick={handleReEvaluate}>
                Re evaluate
              </button>
              <button type="button" role="menuitem" className="audits-actions__item" onClick={handleShare}>
                Share with agent
              </button>
              <button type="button" role="menuitem" className="audits-actions__item" onClick={handleCoaching}>
                My coaching
              </button>
              <button type="button" role="menuitem" className="audits-actions__item audits-actions__item--danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="audits-details__summary" aria-label="Audit summary">
        <div className="audits-details__hero">
          <div>
            <p className="audits-details__eyebrow">Agent</p>
            <h2 className="audits-details__name">{audit.agentName || "—"}</h2>
            <p className="audits-details__meta">
              {teamLabel(audit.team)} · {formatAuditDate(audit.date)}
            </p>
          </div>
          <div className="audits-details__score">
            <span className="audits-details__score-label">Quality score</span>
            <span className="audits-details__score-value">{audit.qualityScore || audit.score || "—"}</span>
          </div>
        </div>

        <div className="audits-details__grid">
          <div className="audits-detail-field">
            <span className="audits-detail-field__label">Case</span>
            <span className="audits-detail-field__value">{caseTypeLabel(audit.caseType)}</span>
          </div>
          <div className="audits-detail-field">
            <span className="audits-detail-field__label">Status</span>
            <span className="audits-detail-field__value">{audit.status || "—"}</span>
          </div>
          {showOrderPhone ? (
            <>
              <div className="audits-detail-field">
                <span className="audits-detail-field__label">Order number</span>
                <span className="audits-detail-field__value">{audit.orderNumber || "—"}</span>
              </div>
              <div className="audits-detail-field">
                <span className="audits-detail-field__label">Phone number</span>
                <span className="audits-detail-field__value">{audit.phoneNumber || "—"}</span>
              </div>
            </>
          ) : (
            <div className="audits-detail-field">
              <span className="audits-detail-field__label">Ticket number</span>
              <span className="audits-detail-field__value">{audit.ticketNumber || "—"}</span>
            </div>
          )}
          {!coachingView ? (
            <div className="audits-detail-field">
              <span className="audits-detail-field__label">Created by</span>
              <span className="audits-detail-field__value">{audit.createdBy || "—"}</span>
            </div>
          ) : null}
          <div className="audits-detail-field audits-detail-field--wide">
            <span className="audits-detail-field__label">Comments</span>
            <span className="audits-detail-field__value">{audit.comments || "—"}</span>
          </div>
        </div>
      </section>

      <section className="audits-details__eval" aria-label="QA evaluation">
        <h3 className="audits-section-title">QA Evaluation</h3>
        <div className="data-table-shell audits-eval-shell">
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
                {audit.metrics.map((row) => (
                  <tr key={row.id}>
                    <td>{row.metric}</td>
                    <td>{resultLabel(row.result)}</td>
                    <td>{row.earned}</td>
                    <td>{row.qaNote || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <NewAuditModal
        open={reevaluateOpen}
        reevaluateId={audit.id}
        onClose={() => setReevaluateOpen(false)}
        onSaved={() => {
          setAudit(getAudit(audit.id));
          setReevaluateOpen(false);
        }}
      />
    </main>
  );
}
