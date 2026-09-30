export type AuditTeam = "calls" | "tickets" | "live-chat" | "sales";

export type EvalResult = "n/a" | "pass" | "borderline" | "fail";

export type CaseType = string;

export type QaMetricRow = {
  id: string;
  metric: string;
  result: EvalResult;
  earned: string;
  qaNote: string;
};

export type AuditRecord = {
  id: string;
  date: string;
  team: AuditTeam;
  agentName: string;
  alias: string;
  agentId: string;
  score: string;
  shared: boolean;
  evaluate: "pending" | "done";
  /** Checked on audit details — marks the audit as re-evaluated. */
  reevaluated?: boolean;
  caseType: CaseType;
  status: string;
  ticketNumber: string;
  orderNumber: string;
  phoneNumber: string;
  comments: string;
  otherInformation: string;
  createdBy: string;
  qualityScore: string;
  issueResolved: "yes" | "no" | "";
  issueResolvedNote: string;
  metrics: QaMetricRow[];
  lastInternalAudit: string;
};

export const TEAM_OPTIONS: Array<{ id: AuditTeam; label: string }> = [
  { id: "calls", label: "Calls" },
  { id: "tickets", label: "Tickets" },
  { id: "live-chat", label: "Live Chat" },
  { id: "sales", label: "Sales" },
];

export type AuditAgent = {
  id: string;
  name: string;
  alias: string;
  /** Legal / profile agent_name when different from display name */
  agentName?: string;
  team: AuditTeam;
  lastInternalAudit: string;
  /** Whole-number quality score from the last audit, e.g. "91" */
  lastInternalAuditScore?: string;
};

/** Match agent search against name, alias, id, and legal name. */
export function matchesAgentSearch(
  agent: Pick<AuditAgent, "id" | "name" | "alias"> & { agentName?: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [agent.name, agent.alias, agent.id, agent.agentName]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

/** Populated from API when agents are wired */
export function listAgents(): AuditAgent[] {
  return [];
}

/** Populated from API when case types are wired */
export const CASE_TYPE_OPTIONS: Array<{ id: CaseType; label: string }> = [];

export const RESULT_OPTIONS: Array<{ id: EvalResult; label: string }> = [
  { id: "n/a", label: "N/A" },
  { id: "pass", label: "Pass" },
  { id: "borderline", label: "Borderline" },
  { id: "fail", label: "Fail" },
];

/** Default QA metrics (aligned with Team Heatmap columns) */
export const DEFAULT_QA_METRICS: Array<{ id: string; metric: string }> = [
  { id: "procedure", metric: "Procedure" },
  { id: "a-form", metric: "A-form" },
  { id: "accuracy", metric: "Accuracy" },
  { id: "call-managing", metric: "Call managing" },
  { id: "creating-ref-order", metric: "Creating ref order" },
  { id: "ending", metric: "Ending" },
  { id: "friendliness", metric: "Friendliness" },
  { id: "greeting", metric: "Greeting" },
];

export function teamLabel(team: AuditTeam | "all" | ""): string {
  if (!team || team === "all") return "All teams";
  return TEAM_OPTIONS.find((option) => option.id === team)?.label ?? team;
}

export function caseTypeLabel(caseType: CaseType | "all" | ""): string {
  if (!caseType || caseType === "all") return "All case types";
  return CASE_TYPE_OPTIONS.find((option) => option.id === caseType)?.label ?? caseType;
}

export function resultLabel(result: EvalResult): string {
  return RESULT_OPTIONS.find((option) => option.id === result)?.label ?? result;
}

export function formatEarned(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const text = String(value).trim();
  if (!text || text === "—") return "—";
  const number = Number(text);
  if (!Number.isFinite(number)) return text;
  if (Math.abs(number - Math.round(number)) < 1e-9) return String(Math.round(number));
  return number.toFixed(2).replace(/\.?0+$/, "");
}

export function earnedForResult(result: EvalResult): string {
  if (result === "pass") return "1";
  if (result === "borderline") return "0.5";
  if (result === "fail") return "0";
  return "—";
}

export function createEmptyMetrics(): QaMetricRow[] {
  return DEFAULT_QA_METRICS.map((row) => ({
    id: row.id,
    metric: row.metric,
    result: "n/a" as EvalResult,
    earned: "—",
    qaNote: "",
  }));
}

/** Dedicated Yes/No UI handles this — keep it out of the metrics table. */
export function isIssueResolvedMetric(row: { id?: string; metric?: string; label?: string; name?: string }): boolean {
  const text = `${row.id || ""} ${row.metric || ""} ${row.label || ""} ${row.name || ""}`.toLowerCase();
  return (
    text.includes("issue was resolved") ||
    text.includes("issue_resolved") ||
    text.includes("issue-resolved") ||
    text.includes("issue_was_resolved")
  );
}

export function withoutIssueResolvedMetrics<T extends { id?: string; metric?: string; label?: string; name?: string }>(
  rows: T[],
): T[] {
  return rows.filter((row) => !isIssueResolvedMetric(row));
}

export function computeQualityScore(metrics: QaMetricRow[]): string {
  const scored = metrics.filter((row) => row.result !== "n/a");
  if (scored.length === 0) return "—";
  const total = scored.reduce((sum, row) => {
    const earned = Number(earnedForResult(row.result));
    return sum + (Number.isNaN(earned) ? 0 : earned);
  }, 0);
  const pct = Math.round((total / scored.length) * 100);
  return `${pct}%`;
}

const storageKey = "daq_audits_v1";
const mockAuditId = "audit-mock-001";

function readStore(): AuditRecord[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => ({
      ...row,
      otherInformation: row.otherInformation ?? "",
    }));
  } catch {
    return [];
  }
}

function writeStore(rows: AuditRecord[]) {
  sessionStorage.setItem(storageKey, JSON.stringify(rows));
}

/** Drop legacy mock seed if still present in sessionStorage. */
function withoutMock(rows: AuditRecord[]): AuditRecord[] {
  return rows.filter((row) => row.id !== mockAuditId);
}

export function listAudits(): AuditRecord[] {
  const raw = readStore();
  const rows = withoutMock(raw);
  if (rows.length !== raw.length) writeStore(rows);
  return rows;
}

export function getAudit(id: string): AuditRecord | null {
  if (id === mockAuditId) return null;
  return listAudits().find((row) => row.id === id) ?? null;
}

/** Saves audit. Returns the previous record when updating, otherwise null. */
export function saveAudit(audit: AuditRecord): AuditRecord | null {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === audit.id);
  if (index >= 0) {
    const previous = rows[index]!;
    rows[index] = audit;
    writeStore(rows);
    return previous;
  }
  rows.unshift(audit);
  writeStore(rows);
  return null;
}

export function deleteAudit(id: string): void {
  writeStore(readStore().filter((row) => row.id !== id));
}

export function newAuditId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatAuditDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type ShareAuditEmailPayload = {
  auditId: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  toEmail: string;
  team: AuditTeam;
  teamLabel: string;
  score: string;
  caseType: string;
  auditDate: string;
  auditDateLabel: string;
  auditUrl: string;
  sharedBy: string;
};

function employeeAuditDeepLink(auditId: string): string {
  const origin =
    (typeof window !== "undefined" && window.location.origin) ||
    String(import.meta.env.VITE_APP_URL || "").replace(/\/$/, "") ||
    "http://127.0.0.1:5173";
  return `${origin}/employee/audits/${encodeURIComponent(auditId)}`;
}

export async function buildShareAuditEmailPayload(
  audit: AuditRecord,
  options: { sharedBy: string },
): Promise<ShareAuditEmailPayload> {
  const { listManagedUsers } = await import("./managedUsers");
  const profile =
    listManagedUsers().find(
      (row) =>
        (audit.agentId && row.employeeId === audit.agentId) ||
        row.agentName.trim().toLowerCase() === audit.agentName.trim().toLowerCase() ||
        row.alias.trim().toLowerCase() === (audit.alias || "").trim().toLowerCase(),
    ) ?? null;
  const agentEmail = String(profile?.email || "").trim().toLowerCase();
  return {
    auditId: audit.id,
    agentId: audit.agentId,
    agentName: audit.agentName || audit.alias || "Agent",
    agentEmail,
    toEmail: agentEmail,
    team: audit.team,
    teamLabel: teamLabel(audit.team),
    score: audit.qualityScore || audit.score || "—",
    caseType: caseTypeLabel(audit.caseType),
    auditDate: audit.date,
    auditDateLabel: formatAuditDate(audit.date),
    auditUrl: employeeAuditDeepLink(audit.id),
    sharedBy: options.sharedBy.trim() || "QA",
  };
}

export async function queueShareAuditEmail(
  audit: AuditRecord,
  sharedBy: string,
): Promise<ShareAuditEmailPayload & { emailTestMode?: boolean }> {
  const payload = await buildShareAuditEmailPayload(audit, { sharedBy });
  if (!payload.agentEmail) {
    throw new Error("This agent has no work email on their managed-user profile.");
  }
  const { triggerPowerAutomate } = await import("./externalApi");
  const result = await triggerPowerAutomate(
    "share-audit",
    payload as unknown as Record<string, unknown>,
  );
  return {
    ...payload,
    toEmail: String(result.toEmail || payload.toEmail || payload.agentEmail || ""),
    emailTestMode: Boolean(result.emailTestMode),
  };
}
