import {
  resultLabel,
  teamLabel,
  type AuditRecord,
  type AuditTeam,
} from "./audits";

export type AuditFieldChange = {
  field: string;
  from: string;
  to: string;
};

export type AuditEditLog = {
  id: string;
  auditId: string;
  action: "edit" | "delete";
  editedAt: string;
  auditDate: string;
  team: AuditTeam;
  agentName: string;
  createdBy: string;
  editedBy: string;
  score: string;
  changesSummary: string;
  changes: AuditFieldChange[];
};

const storageKey = "daq_audit_edit_log_v1";

function normalizeLog(row: AuditEditLog): AuditEditLog {
  return {
    ...row,
    action: row.action === "delete" ? "delete" : "edit",
  };
}

function readStore(): AuditEditLog[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEditLog[];
    return Array.isArray(parsed) ? parsed.map(normalizeLog) : [];
  } catch {
    return [];
  }
}

function writeStore(rows: AuditEditLog[]) {
  sessionStorage.setItem(storageKey, JSON.stringify(rows));
}

function newLogId(): string {
  return `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function display(value: string | boolean | undefined | null): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value == null || value === "") return "—";
  return String(value);
}

export function diffAudit(before: AuditRecord, after: AuditRecord): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  const push = (field: string, from: string, to: string) => {
    if (from === to) return;
    changes.push({ field, from, to });
  };

  push("Audit date", before.date, after.date);
  push("Team", teamLabel(before.team), teamLabel(after.team));
  push("Agent", before.agentName, after.agentName);
  push("Alias", before.alias, after.alias);
  push("Case type", before.caseType || "—", after.caseType || "—");
  push("Status", before.status || "—", after.status || "—");
  push("Ticket #", before.ticketNumber || "—", after.ticketNumber || "—");
  push("Order #", before.orderNumber || "—", after.orderNumber || "—");
  push("Phone", before.phoneNumber || "—", after.phoneNumber || "—");
  push("Comments", before.comments || "—", after.comments || "—");
  push("Other information", before.otherInformation || "—", after.otherInformation || "—");
  push("Score", before.score || before.qualityScore || "—", after.score || after.qualityScore || "—");
  push("Quality score", before.qualityScore || "—", after.qualityScore || "—");
  push(
    "Issue resolved",
    before.issueResolved === "yes" ? "Yes" : before.issueResolved === "no" ? "No" : "—",
    after.issueResolved === "yes" ? "Yes" : after.issueResolved === "no" ? "No" : "—",
  );
  push("Issue note", before.issueResolvedNote || "—", after.issueResolvedNote || "—");
  push("Shared", display(before.shared), display(after.shared));
  push("Evaluate", before.evaluate, after.evaluate);
  push(
    "Re-evaluated",
    before.reevaluated ? "Yes" : "No",
    after.reevaluated ? "Yes" : "No",
  );

  const beforeMetrics = new Map(before.metrics.map((row) => [row.id, row]));
  const afterMetrics = new Map(after.metrics.map((row) => [row.id, row]));
  const metricIds = new Set([...beforeMetrics.keys(), ...afterMetrics.keys()]);

  for (const id of metricIds) {
    const prev = beforeMetrics.get(id);
    const next = afterMetrics.get(id);
    const label = next?.metric || prev?.metric || id;
    if (!prev && next) {
      push(`Metric · ${label}`, "—", `${resultLabel(next.result)} (${next.earned})`);
      if (next.qaNote.trim()) push(`Metric note · ${label}`, "—", next.qaNote);
      continue;
    }
    if (prev && !next) {
      push(`Metric · ${label}`, `${resultLabel(prev.result)} (${prev.earned})`, "—");
      continue;
    }
    if (!prev || !next) continue;
    push(
      `Metric · ${label}`,
      `${resultLabel(prev.result)} (${prev.earned})`,
      `${resultLabel(next.result)} (${next.earned})`,
    );
    push(`Metric note · ${label}`, prev.qaNote || "—", next.qaNote || "—");
  }

  return changes;
}

export function summarizeChanges(changes: AuditFieldChange[]): string {
  if (changes.length === 0) return "No field changes";
  if (changes.length === 1) {
    const only = changes[0]!;
    return `${only.field}: ${only.from} → ${only.to}`;
  }
  const fields = changes.slice(0, 3).map((change) => change.field);
  const extra = changes.length - fields.length;
  return extra > 0 ? `${fields.join(", ")} (+${extra} more)` : fields.join(", ");
}

export function logAuditEdit(
  before: AuditRecord,
  after: AuditRecord,
  editedBy: string,
): AuditEditLog | null {
  const changes = diffAudit(before, after);
  if (changes.length === 0) return null;

  const entry: AuditEditLog = {
    id: newLogId(),
    auditId: after.id,
    action: "edit",
    editedAt: new Date().toISOString(),
    auditDate: after.date,
    team: after.team,
    agentName: after.agentName,
    createdBy: before.createdBy || after.createdBy || "—",
    editedBy: editedBy.trim() || "—",
    score: after.score || after.qualityScore || "—",
    changesSummary: summarizeChanges(changes),
    changes,
  };

  const rows = readStore();
  rows.unshift(entry);
  writeStore(rows);
  return entry;
}

export function logAuditDelete(
  audit: AuditRecord,
  deletedBy: string,
): AuditEditLog {
  const entry: AuditEditLog = {
    id: newLogId(),
    auditId: audit.id,
    action: "delete",
    editedAt: new Date().toISOString(),
    auditDate: audit.date,
    team: audit.team,
    agentName: audit.agentName,
    createdBy: audit.createdBy || "—",
    editedBy: deletedBy.trim() || "—",
    score: audit.score || audit.qualityScore || "—",
    changesSummary: "Audit deleted",
    changes: [
      {
        field: "Status",
        from: "Active",
        to: "Deleted",
      },
    ],
  };

  const rows = readStore();
  rows.unshift(entry);
  writeStore(rows);
  return entry;
}

export function listAuditEditLogs(): AuditEditLog[] {
  return [...readStore()].sort((a, b) => b.editedAt.localeCompare(a.editedAt));
}

export function getAuditEditLog(id: string): AuditEditLog | null {
  return readStore().find((row) => row.id === id) ?? null;
}

export function listQaTeamMembers(): string[] {
  const names = new Set<string>();
  for (const row of readStore()) {
    if (row.editedBy.trim()) names.add(row.editedBy.trim());
    if (row.createdBy.trim()) names.add(row.createdBy.trim());
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function formatEditedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
