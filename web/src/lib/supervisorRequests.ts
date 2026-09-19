import { TEAM_OPTIONS, teamLabel, type AuditTeam } from "./audits";

export type RequestStatus = "open" | "under-review" | "closed";

export type RequestPriority = "low" | "medium" | "high" | "urgent";

export type QaReply = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type SupervisorRequest = {
  id: string;
  caseReference: string;
  caseType: string;
  agentId: string;
  agentName: string;
  requesterName: string;
  priority: RequestPriority;
  team: AuditTeam;
  note: string;
  status: RequestStatus;
  replies: QaReply[];
  createdAt: string;
  updatedAt: string;
};

export type SupervisorRequestDraft = {
  caseReference: string;
  caseType: string;
  agentId: string;
  agentName: string;
  requesterName: string;
  priority: RequestPriority;
  team: AuditTeam;
  note: string;
  status: RequestStatus;
};

export const REQUEST_STATUS_OPTIONS: Array<{ id: RequestStatus; label: string }> = [
  { id: "open", label: "Open" },
  { id: "under-review", label: "Under review" },
  { id: "closed", label: "Closed" },
];

export const REQUEST_PRIORITY_OPTIONS: Array<{ id: RequestPriority; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
];

const storageKey = "daq_supervisor_requests_v1";

export { TEAM_OPTIONS, teamLabel };

function readStore(): SupervisorRequest[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SupervisorRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(rows: SupervisorRequest[]) {
  sessionStorage.setItem(storageKey, JSON.stringify(rows));
}

export function statusLabel(status: RequestStatus | "all"): string {
  if (status === "all") return "All";
  return REQUEST_STATUS_OPTIONS.find((item) => item.id === status)?.label ?? status;
}

export function priorityLabel(priority: RequestPriority): string {
  return REQUEST_PRIORITY_OPTIONS.find((item) => item.id === priority)?.label ?? priority;
}

export function listSupervisorRequests(): SupervisorRequest[] {
  return [...readStore()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function newRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newReplyId(): string {
  return `reply-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyRequestDraft(
  requesterName: string,
  team: AuditTeam = "calls",
): SupervisorRequestDraft {
  return {
    caseReference: "",
    caseType: "",
    agentId: "",
    agentName: "",
    requesterName,
    priority: "medium",
    team,
    note: "",
    status: "open",
  };
}

export async function createSupervisorRequest(
  draft: SupervisorRequestDraft,
): Promise<SupervisorRequest> {
  const now = new Date().toISOString();
  const record: SupervisorRequest = {
    id: newRequestId(),
    caseReference: draft.caseReference.trim(),
    caseType: draft.caseType.trim(),
    agentId: draft.agentId.trim(),
    agentName: draft.agentName.trim(),
    requesterName: draft.requesterName.trim(),
    priority: draft.priority,
    team: draft.team,
    note: draft.note.trim(),
    status: draft.status,
    replies: [],
    createdAt: now,
    updatedAt: now,
  };
  const { saveSupervisorRequestRemote } = await import("./externalApi");
  try {
    const remote = (await saveSupervisorRequestRemote(
      record as unknown as Record<string, unknown>,
    )) as SupervisorRequest;
    const merged = { ...record, ...remote, id: String(remote.id || record.id), replies: [] };
    const rows = readStore().filter((row) => row.id !== merged.id);
    rows.unshift(merged);
    writeStore(rows);
    return merged;
  } catch {
    const rows = readStore();
    rows.unshift(record);
    writeStore(rows);
    return record;
  }
}

export async function updateSupervisorRequest(
  id: string,
  draft: SupervisorRequestDraft,
): Promise<SupervisorRequest | null> {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === id);
  const current = index >= 0 ? rows[index]! : null;
  const next: SupervisorRequest = {
    id,
    caseReference: draft.caseReference.trim(),
    caseType: draft.caseType.trim(),
    agentId: draft.agentId.trim(),
    agentName: draft.agentName.trim(),
    requesterName: draft.requesterName.trim() || current?.requesterName || "",
    priority: draft.priority,
    team: draft.team,
    note: draft.note.trim(),
    status: draft.status,
    replies: current?.replies || [],
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const { saveSupervisorRequestRemote } = await import("./externalApi");
  try {
    const remote = (await saveSupervisorRequestRemote(
      next as unknown as Record<string, unknown>,
    )) as SupervisorRequest;
    const merged = { ...next, ...remote, id, replies: next.replies };
    if (index >= 0) rows[index] = merged;
    else rows.unshift(merged);
    writeStore(rows);
    return merged;
  } catch {
    if (index >= 0) rows[index] = next;
    else rows.unshift(next);
    writeStore(rows);
    return next;
  }
}

export async function addQaReply(
  requestId: string,
  author: string,
  body: string,
): Promise<SupervisorRequest | null> {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === requestId);
  const { addSupervisorReplyRemote } = await import("./externalApi");
  try {
    const reply = await addSupervisorReplyRemote(requestId, body.trim());
    if (index < 0) return null;
    const current = rows[index]!;
    const next: SupervisorRequest = {
      ...current,
      replies: [
        ...current.replies,
        {
          id: reply.id,
          author: reply.author || author.trim() || "QA",
          body: reply.body,
          createdAt: reply.createdAt,
        },
      ],
      status: current.status === "open" ? "under-review" : current.status,
      updatedAt: reply.createdAt || new Date().toISOString(),
    };
    rows[index] = next;
    writeStore(rows);
    return next;
  } catch {
    if (index < 0) return null;
    const current = rows[index]!;
    const reply: QaReply = {
      id: newReplyId(),
      author: author.trim() || "QA",
      body: body.trim(),
      createdAt: new Date().toISOString(),
    };
    const next: SupervisorRequest = {
      ...current,
      replies: [...current.replies, reply],
      status: current.status === "open" ? "under-review" : current.status,
      updatedAt: reply.createdAt,
    };
    rows[index] = next;
    writeStore(rows);
    return next;
  }
}

export async function deleteSupervisorRequest(id: string): Promise<void> {
  const { deleteSupervisorRequestRemote } = await import("./externalApi");
  try {
    await deleteSupervisorRequestRemote(id);
  } catch {
    /* local */
  }
  writeStore(readStore().filter((row) => row.id !== id));
}

export function formatRequestDate(iso: string): string {
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
