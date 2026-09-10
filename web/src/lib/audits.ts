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
  caseType: CaseType;
  status: string;
  ticketNumber: string;
  orderNumber: string;
  phoneNumber: string;
  comments: string;
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
  team: AuditTeam;
  lastInternalAudit: string;
};

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

/** Populated from API when QA metrics are wired */
export const DEFAULT_QA_METRICS: Array<{ id: string; metric: string }> = [];

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
    return Array.isArray(parsed) ? parsed : [];
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

export function saveAudit(audit: AuditRecord): void {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === audit.id);
  if (index >= 0) rows[index] = audit;
  else rows.unshift(audit);
  writeStore(rows);
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
