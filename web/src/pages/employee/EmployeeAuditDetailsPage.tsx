import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import {
  caseTypeLabel,
  formatAuditDate,
  formatEarned,
  getAudit,
  resultLabel,
  teamLabel,
  type AuditRecord,
} from "../../lib/audits";
import { fetchAudit } from "../../lib/externalApi";
import {
  loadEmployeeAudits,
  matchesIdentity,
  resolveEmployeeIdentity,
  type EmployeeIdentity,
} from "../../lib/employeePortal";

function employeeStatusLabel(status: string | undefined): string {
  if (!status) return "—";
  if (status === "Shared" || status === "Internal") return "Evaluated";
  return status;
}

export function EmployeeAuditDetailsPage() {
  const { auditId = "" } = useParams();
  const { user } = useAuth();
  const [identity, setIdentity] = useState<EmployeeIdentity | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [audit, setAudit] = useState<AuditRecord | null>(() => getAudit(auditId));
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  useShellPageLoading(loading || !identityReady);

  useEffect(() => {
    let cancelled = false;
    setIdentityReady(false);
    void resolveEmployeeIdentity(user)
      .then((resolved) => {
        if (!cancelled) setIdentity(resolved);
      })
      .finally(() => {
        if (!cancelled) setIdentityReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!auditId) {
      setAudit(null);
      setAllowed(false);
      setLoading(false);
      return;
    }
    if (!identityReady) {
      setLoading(true);
      return;
    }
    if (!identity) {
      setAllowed(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const live = await fetchAudit(auditId);
        const row = live || getAudit(auditId);
        if (cancelled) return;
        setAudit(row);
        if (!row) {
          setAllowed(false);
          return;
        }

        if (
          matchesIdentity(identity, row.agentName, row.alias, row.agentId)
        ) {
          setAllowed(true);
          return;
        }

        // Same audit already visible in their list (identity edge cases).
        const mine = await loadEmployeeAudits(identity);
        if (!cancelled) {
          setAllowed(mine.some((item) => String(item.id) === String(row.id)));
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identity, identityReady, auditId]);

  if (loading || !identityReady) {
    return <main className="audits-page audits-details" aria-label="Audit details" />;
  }

  if (!audit || !allowed) {
    return <Navigate to="/employee/audits" replace />;
  }

  const showOrderPhone = audit.team === "calls" || audit.team === "sales";
  const reevaluated = Boolean(audit.reevaluated);

  return (
    <main
      key={audit.id}
      className="audits-page audits-details audits-details--animate"
      aria-label="Audit details"
    >
      <div className="audits-details__top">
        <Link to="/employee/audits" className="audits-back">
          <svg className="audits-back__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="audits-back__text">My audits</span>
        </Link>
      </div>

      <section className="audits-details__summary" aria-label="Audit summary">
        <div className="audits-details__hero">
          <div>
            <p className="audits-details__eyebrow">Agent</p>
            <h2 className="audits-details__name">{audit.agentName || "—"}</h2>
            <p className="audits-details__meta">
              {teamLabel(audit.team)} · {formatAuditDate(audit.date)}
              {reevaluated ? " · Re-evaluated" : ""}
            </p>
          </div>
          <div className="audits-details__score">
            <span className="audits-details__score-label">Quality score</span>
            <span className="audits-details__score-value">
              {audit.qualityScore || audit.score || "—"}
            </span>
          </div>
        </div>

        <div className="audits-details__grid">
          <div className="audits-detail-field">
            <span className="audits-detail-field__label">Case</span>
            <span className="audits-detail-field__value">{caseTypeLabel(audit.caseType)}</span>
          </div>
          <div className="audits-detail-field">
            <span className="audits-detail-field__label">Status</span>
            <span className="audits-detail-field__value">
              {employeeStatusLabel(audit.status)}
            </span>
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
          {audit.issueResolved ? (
            <div className="audits-detail-field">
              <span className="audits-detail-field__label">Issue resolved</span>
              <span className="audits-detail-field__value">
                {audit.issueResolved === "yes"
                  ? "Yes"
                  : audit.issueResolved === "no"
                    ? "No"
                    : audit.issueResolved}
              </span>
            </div>
          ) : null}
          {audit.issueResolvedNote ? (
            <div className="audits-detail-field audits-detail-field--wide">
              <span className="audits-detail-field__label">Issue note</span>
              <span className="audits-detail-field__value">{audit.issueResolvedNote}</span>
            </div>
          ) : null}
          <div className="audits-detail-field audits-detail-field--wide">
            <span className="audits-detail-field__label">Comments</span>
            <span className="audits-detail-field__value">{audit.comments || "—"}</span>
          </div>
          <div className="audits-detail-field audits-detail-field--wide">
            <span className="audits-detail-field__label">Other information</span>
            <span className="audits-detail-field__value">{audit.otherInformation || "—"}</span>
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
                {audit.metrics.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No metrics for this audit.</td>
                  </tr>
                ) : (
                  audit.metrics.map((row) => (
                    <tr key={row.id || row.metric}>
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
      </section>
    </main>
  );
}
