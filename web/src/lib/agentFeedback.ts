import type { AuditTeam } from "./audits";

export type FeedbackPlanType =
  | "coaching"
  | "audit-feedback"
  | "warning"
  | "follow-up";

export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export type FeedbackStatus = "open" | "in-progress" | "closed";

export type FeedbackStage =
  | "draft"
  | "awaiting-ack"
  | "in-progress"
  | "follow-up"
  | "closed";

export type FeedbackRecord = {
  id: string;
  agentId: string;
  agentName: string;
  team: AuditTeam | "";
  qaName: string;
  planType: FeedbackPlanType;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  stage: FeedbackStage;
  followUpDate: string; // YYYY-MM-DD
  subject: string;
  auditReference: string;
  coachingSummary: string;
  justification: string;
  actionPlan: string;
  acknowledged: boolean;
  agentCycle: number;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackDraft = Omit<
  FeedbackRecord,
  "id" | "acknowledged" | "agentCycle" | "createdAt" | "updatedAt"
>;

export const PLAN_TYPE_OPTIONS: Array<{ id: FeedbackPlanType; label: string }> = [
  { id: "coaching", label: "Coaching" },
  { id: "audit-feedback", label: "Audit feedback" },
  { id: "warning", label: "Warning" },
  { id: "follow-up", label: "Follow up" },
];

export const PRIORITY_OPTIONS: Array<{ id: FeedbackPriority; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "critical", label: "Critical" },
];

export const STATUS_OPTIONS: Array<{ id: FeedbackStatus; label: string }> = [
  { id: "open", label: "Open" },
  { id: "in-progress", label: "In progress" },
  { id: "closed", label: "Closed" },
];

export const STAGE_OPTIONS: Array<{ id: FeedbackStage; label: string }> = [
  { id: "draft", label: "Draft" },
  { id: "awaiting-ack", label: "Awaiting ack" },
  { id: "in-progress", label: "In progress" },
  { id: "follow-up", label: "Follow up" },
  { id: "closed", label: "Closed" },
];

const storageKey = "daq_agent_feedback_v1";

function readStore(): FeedbackRecord[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FeedbackRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(rows: FeedbackRecord[]) {
  sessionStorage.setItem(storageKey, JSON.stringify(rows));
}

export function planTypeLabel(type: FeedbackPlanType | "all"): string {
  if (type === "all") return "All types";
  return PLAN_TYPE_OPTIONS.find((item) => item.id === type)?.label ?? type;
}

export function priorityLabel(priority: FeedbackPriority): string {
  return PRIORITY_OPTIONS.find((item) => item.id === priority)?.label ?? priority;
}

export function statusLabel(status: FeedbackStatus | "all"): string {
  if (status === "all") return "All";
  return STATUS_OPTIONS.find((item) => item.id === status)?.label ?? status;
}

export function stageLabel(stage: FeedbackStage): string {
  return STAGE_OPTIONS.find((item) => item.id === stage)?.label ?? stage;
}

export function listFeedback(): FeedbackRecord[] {
  return [...readStore()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function newFeedbackId(): string {
  return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyFeedbackDraft(qaName: string): FeedbackDraft {
  const today = new Date();
  const follow = new Date(today);
  follow.setDate(today.getDate() + 7);
  const followUpDate = follow.toISOString().slice(0, 10);
  return {
    agentId: "",
    agentName: "",
    team: "",
    qaName,
    planType: "coaching",
    priority: "medium",
    status: "open",
    stage: "awaiting-ack",
    followUpDate,
    subject: "",
    auditReference: "",
    coachingSummary: "",
    justification: "",
    actionPlan: "",
  };
}

export function saveFeedback(record: FeedbackRecord): void {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === record.id);
  const next = { ...record, updatedAt: new Date().toISOString() };
  if (index >= 0) rows[index] = next;
  else rows.unshift(next);
  writeStore(rows);
}

export async function createFeedback(draft: FeedbackDraft): Promise<FeedbackRecord> {
  const now = new Date().toISOString();
  const record: FeedbackRecord = {
    id: newFeedbackId(),
    ...draft,
    agentName: draft.agentName.trim(),
    subject: draft.subject.trim(),
    auditReference: draft.auditReference.trim(),
    coachingSummary: draft.coachingSummary.trim(),
    justification: draft.justification.trim(),
    actionPlan: draft.actionPlan.trim(),
    acknowledged: false,
    agentCycle: 1,
    createdAt: now,
    updatedAt: now,
  };
  const { saveFeedbackRemote } = await import("./externalApi");
  try {
    const remote = (await saveFeedbackRemote(record as unknown as Record<string, unknown>)) as FeedbackRecord;
    saveFeedback({ ...record, ...remote, id: String(remote.id || record.id) });
    return { ...record, ...remote, id: String(remote.id || record.id) };
  } catch {
    saveFeedback(record);
    return record;
  }
}

export async function updateFeedback(id: string, draft: FeedbackDraft): Promise<FeedbackRecord | null> {
  const current = readStore().find((row) => row.id === id);
  const next: FeedbackRecord = {
    ...(current || {
      id,
      acknowledged: false,
      agentCycle: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    ...draft,
    id,
    agentName: draft.agentName.trim(),
    subject: draft.subject.trim(),
    auditReference: draft.auditReference.trim(),
    coachingSummary: draft.coachingSummary.trim(),
    justification: draft.justification.trim(),
    actionPlan: draft.actionPlan.trim(),
    updatedAt: new Date().toISOString(),
  };
  const { saveFeedbackRemote } = await import("./externalApi");
  try {
    const remote = (await saveFeedbackRemote(next as unknown as Record<string, unknown>)) as FeedbackRecord;
    const merged = { ...next, ...remote, id };
    saveFeedback(merged);
    return merged;
  } catch {
    if (!current) {
      saveFeedback(next);
      return next;
    }
    saveFeedback(next);
    return next;
  }
}

export async function deleteFeedback(id: string): Promise<void> {
  const { deleteFeedbackRemote } = await import("./externalApi");
  try {
    await deleteFeedbackRemote(id);
  } catch {
    /* local fallback */
  }
  writeStore(readStore().filter((row) => row.id !== id));
}

export function acknowledgeFeedback(id: string): FeedbackRecord | null {
  const current = readStore().find((row) => row.id === id);
  if (!current) return null;
  const next: FeedbackRecord = {
    ...current,
    acknowledged: true,
    stage: current.stage === "awaiting-ack" ? "in-progress" : current.stage,
    status: current.status === "open" ? "in-progress" : current.status,
    agentCycle: current.agentCycle + 1,
    updatedAt: new Date().toISOString(),
  };
  saveFeedback(next);
  return next;
}

export function formatFollowUp(isoDate: string): string {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isFeedbackOverdue(row: FeedbackRecord, today = new Date()): boolean {
  if (row.status === "closed" || !row.followUpDate) return false;
  const follow = new Date(`${row.followUpDate}T00:00:00`);
  if (Number.isNaN(follow.getTime())) return false;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return follow.getTime() < start.getTime();
}

export type PlansFilter = "all" | "open" | "overdue" | "awaiting-ack" | "follow-up";

export function matchesPlansFilter(row: FeedbackRecord, filter: PlansFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return row.status === "open" || row.status === "in-progress";
  if (filter === "overdue") return isFeedbackOverdue(row);
  if (filter === "awaiting-ack") return !row.acknowledged || row.stage === "awaiting-ack";
  if (filter === "follow-up") return row.planType === "follow-up" || row.stage === "follow-up";
  return true;
}

export function feedbackInRange(
  createdAt: string,
  start: Date | null,
  end: Date | null,
): boolean {
  if (!start && !end) return true;
  const day = new Date(createdAt);
  if (Number.isNaN(day.getTime())) return false;
  const t = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  if (start) {
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    if (t < s) return false;
  }
  if (end) {
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    if (t > e) return false;
  }
  return true;
}
