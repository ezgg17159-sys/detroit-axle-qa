import { TEAM_OPTIONS, teamLabel, type AuditTeam } from "./audits";

export type MonitoringStatus = "active" | "resolved";

export type MonitoringRecord = {
  id: string;
  order: string;
  agentId: string;
  agentName: string;
  team: AuditTeam;
  comment: string;
  status: MonitoringStatus;
  ack: boolean;
  createdAt: string; // ISO
  resolvedAt: string | null;
};

export type MonitoringDraft = {
  agentId: string;
  agentName: string;
  team: AuditTeam;
  order: string;
  comment: string;
};

export type MonitoringEmailPayload = {
  id: string;
  order: string;
  agentId: string;
  agentName: string;
  /** Real employee email (for display / audit). */
  agentEmail: string;
  /** Outlook To — same as agentEmail in production; test override applied server-side. */
  toEmail: string;
  team: AuditTeam;
  teamLabel: string;
  comment: string;
  createdAt: string;
  createdAtLabel: string;
  /** Opens My Monitoring in the employee portal. */
  monitoringUrl: string;
};

const storageKey = "daq_monitoring_v1";

export { TEAM_OPTIONS, teamLabel };

export function statusLabel(status: MonitoringStatus | "all"): string {
  if (status === "all") return "All";
  if (status === "active") return "Active";
  return "Resolved";
}

function readStore(): MonitoringRecord[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<MonitoringRecord & { order: string | number }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => ({
      ...row,
      order: String(row.order ?? ""),
      agentId: row.agentId ?? "",
    }));
  } catch {
    return [];
  }
}

function writeStore(rows: MonitoringRecord[]) {
  sessionStorage.setItem(storageKey, JSON.stringify(rows));
}

export function listMonitoring(): MonitoringRecord[] {
  return [...readStore()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function newMonitoringId(): string {
  return `mon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyMonitoringDraft(team: AuditTeam = "calls"): MonitoringDraft {
  return {
    agentId: "",
    agentName: "",
    team,
    order: "",
    comment: "",
  };
}

export async function createMonitoring(draft: MonitoringDraft): Promise<MonitoringRecord> {
  const { createMonitoringRemote } = await import("./externalApi");
  const remote = await createMonitoringRemote({
    order: draft.order.trim(),
    agentId: draft.agentId.trim(),
    agentName: draft.agentName.trim(),
    team: draft.team,
    comment: draft.comment.trim(),
  });
  const rows = readStore().filter((row) => row.id !== remote.id);
  rows.unshift(remote);
  writeStore(rows);
  return remote;
}

export async function resolveMonitoring(id: string): Promise<MonitoringRecord | null> {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === id);
  const base =
    index >= 0
      ? rows[index]!
      : ({
          id,
          order: "",
          agentId: "",
          agentName: "",
          team: "calls" as const,
          comment: "",
          status: "active" as const,
          ack: false,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        } satisfies MonitoringRecord);
  const next: MonitoringRecord = {
    ...base,
    status: "resolved",
    resolvedAt: new Date().toISOString(),
  };
  const { saveMonitoringRemote } = await import("./externalApi");
  const remote = await saveMonitoringRemote(next);
  if (index >= 0) rows[index] = remote;
  else rows.unshift(remote);
  writeStore(rows);
  return remote;
}

export async function updateMonitoring(
  id: string,
  draft: MonitoringDraft,
): Promise<MonitoringRecord | null> {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === id);
  const base =
    index >= 0
      ? rows[index]!
      : ({
          id,
          status: "active",
          ack: false,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        } as MonitoringRecord);

  const next: MonitoringRecord = {
    ...base,
    id,
    order: draft.order.trim(),
    agentId: draft.agentId.trim(),
    agentName: draft.agentName.trim(),
    team: draft.team,
    comment: draft.comment.trim(),
  };

  const { saveMonitoringRemote } = await import("./externalApi");
  const remote = await saveMonitoringRemote(next);
  if (index >= 0) rows[index] = remote;
  else rows.unshift(remote);
  writeStore(rows);
  return remote;
}

export async function deleteMonitoring(id: string): Promise<void> {
  const { deleteMonitoringRemote } = await import("./externalApi");
  await deleteMonitoringRemote(id);
  writeStore(readStore().filter((row) => row.id !== id));
}

export function formatMonitoringDate(iso: string): string {
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

export function monitoringInRange(
  createdAt: string,
  start: Date | null,
  end: Date | null,
): boolean {
  if (!start && !end) return true;
  // DB has many legacy rows with null created_at — keep them visible.
  if (!createdAt.trim()) return true;
  const day = new Date(createdAt);
  if (Number.isNaN(day.getTime())) return true;
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

/**
 * Build Power Automate payload for a new monitoring item.
 * Resolves agent email from managed users when possible.
 */
export async function buildMonitoringEmailPayload(
  record: MonitoringRecord,
): Promise<MonitoringEmailPayload> {
  const { employeeMonitoringDeepLink } = await import("./dateRange");
  let agentEmail = "";
  try {
    const { fetchManagedUsers } = await import("./externalApi");
    const search = record.agentId || record.agentName;
    if (search) {
      const payload = await fetchManagedUsers({ search, limit: 50 });
      if (payload.connected && payload.items.length > 0) {
        const idLc = record.agentId.trim().toLowerCase();
        const nameLc = record.agentName.trim().toLowerCase();
        const match =
          payload.items.find(
            (row) =>
              idLc &&
              (String(row.employeeId || "").toLowerCase() === idLc ||
                String(row.id || "").toLowerCase() === idLc ||
                String(row.alias || "").toLowerCase() === idLc),
          ) ||
          payload.items.find(
            (row) => nameLc && String(row.agentName || "").toLowerCase() === nameLc,
          ) ||
          payload.items[0];
        agentEmail = String(match?.email || "").trim();
      }
    }
  } catch {
    /* email optional — PA can still route by alias if configured */
  }

  return {
    id: record.id,
    order: record.order,
    agentId: record.agentId,
    agentName: record.agentName,
    agentEmail,
    toEmail: agentEmail,
    team: record.team,
    teamLabel: teamLabel(record.team),
    comment: record.comment,
    createdAt: record.createdAt,
    createdAtLabel: formatMonitoringDate(record.createdAt),
    monitoringUrl: employeeMonitoringDeepLink(),
  };
}

/**
 * Queue monitoring email via Django → Power Automate webhook proxy.
 */
export async function queueMonitoringEmail(
  recordOrPayload: MonitoringRecord | MonitoringEmailPayload,
): Promise<MonitoringEmailPayload & { emailTestMode?: boolean }> {
  const payload =
    "monitoringUrl" in recordOrPayload && "agentEmail" in recordOrPayload
      ? (recordOrPayload as MonitoringEmailPayload)
      : await buildMonitoringEmailPayload(recordOrPayload as MonitoringRecord);

  const { triggerPowerAutomate } = await import("./externalApi");
  const result = await triggerPowerAutomate(
    "monitoring-email",
    payload as unknown as Record<string, unknown>,
  );
  return {
    ...payload,
    toEmail: String(result.toEmail || payload.toEmail || payload.agentEmail || ""),
    emailTestMode: Boolean(result.emailTestMode),
  };
}
