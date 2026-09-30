import { apiFetch } from "./api";
import type { AuditAgent, AuditRecord, AuditTeam, CaseType } from "./audits";
import type { CaseTypeRecord } from "./caseTypes";
import type { MonitoringRecord } from "./monitoring";
import { scopedTeamParam } from "./teamScope";

function asTeam(value: string | undefined): AuditTeam {
  if (value === "calls" || value === "tickets" || value === "live-chat" || value === "sales") {
    return value;
  }
  return "calls";
}

function teamQuery(requested?: string | null, fallback: string = "all"): string {
  return scopedTeamParam(requested || fallback);
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Cannot reach the API. Make sure Django is running on port 8000.");
  }
  const data = (await response.json().catch(() => ({}))) as T & { detail?: string };
  if (!response.ok && response.status !== 503) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Request failed.");
  }
  return data;
}

async function sendJson<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Cannot reach the API. Make sure Django is running on port 8000.");
  }
  const data = (await response.json().catch(() => ({}))) as T & { detail?: string };
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Request failed.");
  }
  return data;
}

export async function fetchAgents(params?: {
  team?: string;
  search?: string;
}): Promise<{ connected: boolean; detail?: string; agents: AuditAgent[] }> {
  const query = new URLSearchParams({
    team: teamQuery(params?.team),
    search: params?.search || "",
  });
  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    agents?: Array<{
      id: string;
      name: string;
      alias?: string;
      agentName?: string;
      team?: string;
      lastInternalAudit?: string;
      lastInternalAuditScore?: string;
    }>;
  }>(`/api/agents/?${query}`);

  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    agents: (data.agents ?? []).map((row) => ({
      id: String(row.id),
      name: row.name || String(row.id),
      alias: row.alias || String(row.id),
      agentName: row.agentName || "",
      team: asTeam(row.team),
      lastInternalAudit: String(row.lastInternalAudit || ""),
      lastInternalAuditScore: String(row.lastInternalAuditScore || ""),
    })),
  };
}

export async function fetchAudits(params?: {
  start?: string;
  end?: string;
  team?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  connected: boolean;
  detail?: string;
  total: number;
  audits: AuditRecord[];
}> {
  const query = new URLSearchParams();
  if (params?.start) query.set("start", params.start);
  if (params?.end) query.set("end", params.end);
  query.set("team", teamQuery(params?.team));
  query.set("search", params?.search || "");
  query.set("limit", String(params?.limit ?? 500));
  query.set("offset", String(params?.offset ?? 0));

  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    total?: number;
    audits?: AuditRecord[];
  }>(`/api/audits/?${query}`);

  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    total: data.total ?? 0,
    audits: (data.audits ?? []).map((row) => ({
      ...row,
      team: asTeam(row.team),
      metrics: Array.isArray(row.metrics) ? row.metrics : [],
      reevaluated: Boolean(row.reevaluated),
    })),
  };
}

export async function fetchAudit(auditId: string): Promise<AuditRecord | null> {
  const data = await getJson<{ connected?: boolean; audit?: AuditRecord; detail?: string }>(
    `/api/audits/${encodeURIComponent(auditId)}/`,
  );
  if (!data.audit) return null;
  return {
    ...data.audit,
    team: asTeam(data.audit.team),
    metrics: Array.isArray(data.audit.metrics) ? data.audit.metrics : [],
  };
}

function normalizeAudit(row: AuditRecord): AuditRecord {
  return {
    ...row,
    team: asTeam(row.team),
    metrics: Array.isArray(row.metrics) ? row.metrics : [],
    otherInformation: row.otherInformation || "",
    reevaluated: Boolean(row.reevaluated),
  };
}

export async function saveAuditRemote(
  audit: AuditRecord,
  options?: { changes?: Array<{ field: string; from: string; to: string }>; isNew?: boolean },
): Promise<AuditRecord> {
  const body: Record<string, unknown> = { ...audit };
  if (options?.changes?.length) body.changes = options.changes;
  const isNew = options?.isNew ?? false;
  const data = isNew
    ? await sendJson<{ audit: AuditRecord }>("/api/audits/", "POST", body)
    : await sendJson<{ audit: AuditRecord }>(
        `/api/audits/${encodeURIComponent(audit.id)}/`,
        "PUT",
        body,
      );
  return normalizeAudit(data.audit);
}

export async function deleteAuditRemote(auditId: string): Promise<void> {
  await sendJson(`/api/audits/${encodeURIComponent(auditId)}/`, "DELETE");
}

export async function saveMonitoringRemote(record: MonitoringRecord): Promise<MonitoringRecord> {
  const body = { ...record } as Record<string, unknown>;
  const exists = Boolean(record.id);
  const data = exists
    ? await sendJson<{ item: MonitoringRecord }>(
        `/api/monitoring/${encodeURIComponent(record.id)}/`,
        "PUT",
        body,
      )
    : await sendJson<{ item: MonitoringRecord }>("/api/monitoring/", "POST", body);
  return { ...data.item, team: asTeam(data.item.team) };
}

export async function createMonitoringRemote(
  draft: Omit<MonitoringRecord, "id" | "status" | "ack" | "createdAt" | "resolvedAt"> & {
    id?: string;
  },
): Promise<MonitoringRecord> {
  const data = await sendJson<{ item: MonitoringRecord }>("/api/monitoring/", "POST", {
    ...draft,
    status: "active",
    ack: false,
  });
  return { ...data.item, team: asTeam(data.item.team) };
}

export async function deleteMonitoringRemote(id: string): Promise<void> {
  await sendJson(`/api/monitoring/${encodeURIComponent(id)}/`, "DELETE");
}

export async function saveFeedbackRemote(record: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = String(record.id || "");
  const data = id
    ? await sendJson<{ item: Record<string, unknown> }>(
        `/api/agent-feedback/${encodeURIComponent(id)}/`,
        "PUT",
        record,
      )
    : await sendJson<{ item: Record<string, unknown> }>("/api/agent-feedback/", "POST", record);
  return data.item;
}

export async function deleteFeedbackRemote(id: string): Promise<void> {
  await sendJson(`/api/agent-feedback/${encodeURIComponent(id)}/`, "DELETE");
}

export async function saveCoachingRemote(record: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = String(record.id || "");
  const data = id
    ? await sendJson<{ item: Record<string, unknown> }>(
        `/api/coaching/${encodeURIComponent(id)}/`,
        "PUT",
        record,
      )
    : await sendJson<{ item: Record<string, unknown> }>("/api/coaching/", "POST", record);
  return data.item;
}

export async function deleteCoachingRemote(id: string): Promise<void> {
  await sendJson(`/api/coaching/${encodeURIComponent(id)}/`, "DELETE");
}

export async function saveSupervisorRequestRemote(
  record: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = String(record.id || "");
  const data = id
    ? await sendJson<{ item: Record<string, unknown> }>(
        `/api/supervisor-requests/${encodeURIComponent(id)}/`,
        "PUT",
        record,
      )
    : await sendJson<{ item: Record<string, unknown> }>("/api/supervisor-requests/", "POST", record);
  return data.item;
}

export async function deleteSupervisorRequestRemote(id: string): Promise<void> {
  await sendJson(`/api/supervisor-requests/${encodeURIComponent(id)}/`, "DELETE");
}

export async function addSupervisorReplyRemote(
  requestId: string,
  body: string,
): Promise<{ id: string; author: string; body: string; createdAt: string }> {
  const data = await sendJson<{ reply: { id: string; author: string; body: string; createdAt: string } }>(
    `/api/supervisor-requests/${encodeURIComponent(requestId)}/replies/`,
    "POST",
    { body },
  );
  return data.reply;
}

export async function importProductionRemote(rows: Record<string, unknown>[]): Promise<{
  connected: boolean;
  inserted?: Record<string, number>;
}> {
  return sendJson("/api/production/", "POST", { rows });
}

export async function saveManagedUserRemote(user: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = String(user.id || "");
  const data = id
    ? await sendJson<{ item: Record<string, unknown> }>(
        `/api/managed-users/${encodeURIComponent(id)}/`,
        "PUT",
        user,
      )
    : await sendJson<{ item: Record<string, unknown> }>("/api/managed-users/", "POST", user);
  return data.item;
}

export async function deleteManagedUserRemote(id: string): Promise<void> {
  await sendJson(`/api/managed-users/${encodeURIComponent(id)}/`, "DELETE");
}

export async function fetchRolePermissions(): Promise<{
  connected: boolean;
  permissions: Record<string, Record<string, boolean>>;
}> {
  const data = await getJson<{
    connected?: boolean;
    permissions?: Record<string, Record<string, boolean>>;
  }>("/api/role-permissions/");
  return {
    connected: Boolean(data.connected),
    permissions: data.permissions || { admin: {}, qa: {} },
  };
}

export async function saveRolePermissionsRemote(
  permissions: Record<string, Record<string, boolean>>,
): Promise<Record<string, Record<string, boolean>>> {
  const data = await sendJson<{ permissions: Record<string, Record<string, boolean>> }>(
    "/api/role-permissions/",
    "PUT",
    { permissions },
  );
  return data.permissions;
}

export async function fetchCaseTypes(params?: {
  team?: string;
}): Promise<{ connected: boolean; detail?: string; caseTypes: CaseTypeRecord[] }> {
  const query = new URLSearchParams({ team: teamQuery(params?.team) });
  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    caseTypes?: Array<{
      id: string;
      name: string;
      sortOrder?: number;
      active?: boolean;
      team?: string;
    }>;
  }>(`/api/case-types/?${query}`);

  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    caseTypes: (data.caseTypes ?? []).map((row) => ({
      id: String(row.id),
      name: row.name || "",
      sortOrder: row.sortOrder ?? 0,
      active: row.active !== false,
      team: row.team ? asTeam(row.team) : undefined,
    })),
  };
}

export async function fetchTeamMetrics(params?: {
  team?: string;
}): Promise<{
  connected: boolean;
  detail?: string;
  metrics: Array<{
    id: string;
    key: string;
    label: string;
    team: AuditTeam;
    sortOrder: number;
    passPoints: number;
    borderlinePoints: number;
    countsTowardScore: boolean;
    canAutoFail: boolean;
    active: boolean;
  }>;
}> {
  const query = new URLSearchParams({ team: teamQuery(params?.team) });
  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    metrics?: Array<{
      id: string;
      team?: string;
      name?: string;
      pass?: number | null;
      borderline?: number | null;
      countsTowardScore?: boolean;
      autoFail?: boolean;
      sortOrder?: number;
    }>;
  }>(`/api/metrics/?${query}`);

  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    metrics: (data.metrics ?? []).map((row) => {
      const id = String(row.id || "");
      const label = row.name || id;
      return {
        id,
        key: id,
        label,
        team: asTeam(row.team),
        sortOrder: row.sortOrder ?? 0,
        passPoints: Number(row.pass ?? 0),
        borderlinePoints: Number(row.borderline ?? 0),
        countsTowardScore: Boolean(row.countsTowardScore),
        canAutoFail: Boolean(row.autoFail),
        active: true,
      };
    }),
  };
}

export async function createCaseTypeRemote(record: CaseTypeRecord): Promise<CaseTypeRecord> {
  const data = await sendJson<{ caseType: CaseTypeRecord }>("/api/case-types/", "POST", {
    id: record.id,
    name: record.name,
    sortOrder: record.sortOrder,
    team: record.team || "calls",
    active: record.active,
  });
  return {
    id: String(data.caseType.id),
    name: data.caseType.name || record.name,
    sortOrder: data.caseType.sortOrder ?? record.sortOrder,
    active: data.caseType.active !== false,
    team: data.caseType.team ? asTeam(String(data.caseType.team)) : record.team,
  };
}

export async function updateCaseTypeRemote(record: CaseTypeRecord): Promise<CaseTypeRecord> {
  const data = await sendJson<{ caseType: CaseTypeRecord }>(
    `/api/case-types/${encodeURIComponent(record.id)}/`,
    "PUT",
    {
      name: record.name,
      sortOrder: record.sortOrder,
      team: record.team || "calls",
      active: record.active,
    },
  );
  return {
    id: String(data.caseType.id),
    name: data.caseType.name || record.name,
    sortOrder: data.caseType.sortOrder ?? record.sortOrder,
    active: data.caseType.active !== false,
    team: data.caseType.team ? asTeam(String(data.caseType.team)) : record.team,
  };
}

export async function deleteCaseTypeRemote(id: string): Promise<void> {
  await sendJson(`/api/case-types/${encodeURIComponent(id)}/`, "DELETE");
}

export async function createTeamMetricRemote(record: {
  id: string;
  key: string;
  label: string;
  team: AuditTeam;
  sortOrder: number;
  passPoints: number;
  borderlinePoints: number;
  countsTowardScore: boolean;
  canAutoFail: boolean;
  active: boolean;
}): Promise<void> {
  await sendJson("/api/metrics/", "POST", {
    id: record.id || record.key,
    key: record.key,
    name: record.label,
    label: record.label,
    team: record.team,
    sortOrder: record.sortOrder,
    passPoints: record.passPoints,
    borderlinePoints: record.borderlinePoints,
    countsTowardScore: record.countsTowardScore,
    canAutoFail: record.canAutoFail,
  });
}

export async function updateTeamMetricRemote(record: {
  id: string;
  key: string;
  label: string;
  team: AuditTeam;
  sortOrder: number;
  passPoints: number;
  borderlinePoints: number;
  countsTowardScore: boolean;
  canAutoFail: boolean;
  active: boolean;
}): Promise<void> {
  await sendJson(`/api/metrics/${encodeURIComponent(record.id)}/`, "PUT", {
    name: record.label,
    label: record.label,
    team: record.team,
    sortOrder: record.sortOrder,
    passPoints: record.passPoints,
    borderlinePoints: record.borderlinePoints,
    countsTowardScore: record.countsTowardScore,
    canAutoFail: record.canAutoFail,
  });
}

export async function deleteTeamMetricRemote(id: string): Promise<void> {
  await sendJson(`/api/metrics/${encodeURIComponent(id)}/`, "DELETE");
}

export async function fetchProduction(params?: {
  start?: string;
  end?: string;
  department?: string;
  search?: string;
}): Promise<{
  connected: boolean;
  detail?: string;
  total: number;
  items: Array<{
    id: string;
    employeeName: string;
    employeeId: string;
    vonageId: string;
    department: string;
    callsHandled: number | null;
    tickets: number | null;
    sales: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    updatedAt: string;
  }>;
}> {
  const query = new URLSearchParams();
  if (params?.start) query.set("start", params.start);
  if (params?.end) query.set("end", params.end);
  query.set("department", params?.department || "all");
  query.set("search", params?.search || "");
  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    total?: number;
    items?: Array<{
      id: string;
      employeeName?: string;
      employeeId?: string;
      vonageId?: string;
      department?: string;
      callsHandled?: number | null;
      tickets?: number | null;
      sales?: number | null;
      periodStart?: string | null;
      periodEnd?: string | null;
      updatedAt?: string;
    }>;
  }>(`/api/production/?${query}`);

  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    total: data.total ?? 0,
    items: (data.items ?? []).map((row) => ({
      id: String(row.id),
      employeeName: row.employeeName || "",
      employeeId: row.employeeId || "",
      vonageId: row.vonageId || "",
      department: row.department || "unassigned",
      callsHandled: row.callsHandled ?? null,
      tickets: row.tickets ?? null,
      sales: row.sales ?? null,
      periodStart: row.periodStart ?? null,
      periodEnd: row.periodEnd ?? null,
      updatedAt: row.updatedAt || "",
    })),
  };
}

async function fetchPortalList<T>(
  path: string,
  params?: Record<string, string | undefined>,
): Promise<{ connected: boolean; detail?: string; total: number; items: T[] }> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined) query.set(key, value);
  }
  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    total?: number;
    items?: T[];
  }>(`${path}?${query}`);
  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    total: data.total ?? 0,
    items: data.items ?? [],
  };
}

export function fetchAgentFeedback(params?: { team?: string; search?: string; limit?: number }) {
  return fetchPortalList<Record<string, unknown>>("/api/agent-feedback/", {
    team: teamQuery(params?.team),
    search: params?.search || "",
    limit: String(params?.limit ?? 500),
  });
}

export function fetchSupervisorRequests(params?: {
  team?: string;
  status?: string;
  search?: string;
  limit?: number;
}) {
  return fetchPortalList<Record<string, unknown>>("/api/supervisor-requests/", {
    team: teamQuery(params?.team),
    status: params?.status || "all",
    search: params?.search || "",
    limit: String(params?.limit ?? 500),
  });
}

export function fetchCoaching(params?: { team?: string; search?: string; limit?: number }) {
  return fetchPortalList<Record<string, unknown>>("/api/coaching/", {
    team: teamQuery(params?.team),
    search: params?.search || "",
    limit: String(params?.limit ?? 500),
  });
}

export function fetchTeamTracking(params?: { team?: string; search?: string; limit?: number }) {
  return fetchPortalList<Record<string, unknown>>("/api/team-tracking/", {
    team: teamQuery(params?.team),
    search: params?.search || "",
    limit: String(params?.limit ?? 500),
  });
}

export function fetchManagedUsers(params?: { search?: string; limit?: number }) {
  return fetchPortalList<Record<string, unknown>>("/api/managed-users/", {
    search: params?.search || "",
    limit: String(params?.limit ?? 500),
  });
}

export async function fetchMonitoring(params?: {
  team?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  connected: boolean;
  detail?: string;
  total: number;
  items: MonitoringRecord[];
}> {
  const query = new URLSearchParams({
    team: teamQuery(params?.team),
    status: params?.status || "all",
    search: params?.search || "",
    limit: String(params?.limit ?? 500),
    offset: String(params?.offset ?? 0),
  });
  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    total?: number;
    items?: MonitoringRecord[];
  }>(`/api/monitoring/?${query}`);

  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    total: data.total ?? 0,
    items: (data.items ?? []).map((row) => ({
      ...row,
      team: asTeam(row.team),
      status: row.status === "resolved" ? "resolved" : "active",
    })),
  };
}

export type EvalDayCell = {
  score: number | null;
  off: boolean;
};

export type EvalProgressAgent = {
  id: string;
  name: string;
  alias: string;
  team: AuditTeam;
  scheduledDayOff: string;
  latestAuditDate: string;
  days: Record<string, EvalDayCell>;
};

export async function fetchEvaluationProgress(params: {
  year: number;
  month: number;
  team?: string;
  search?: string;
}): Promise<{
  connected: boolean;
  detail?: string;
  year: number;
  month: number;
  agents: EvalProgressAgent[];
}> {
  const query = new URLSearchParams({
    year: String(params.year),
    month: String(params.month),
    team: teamQuery(params.team),
    search: params.search || "",
  });
  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    year?: number;
    month?: number;
    agents?: EvalProgressAgent[];
  }>(`/api/evaluation-progress/?${query}`);

  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    year: data.year ?? params.year,
    month: data.month ?? params.month,
    agents: (data.agents ?? []).map((row) => ({
      ...row,
      team: asTeam(row.team),
      days: row.days ?? {},
    })),
  };
}

export async function postEvaluationDayOff(params: {
  agentId: string;
  date: string;
  off: boolean;
}): Promise<{ agentId: string; date: string; off: boolean }> {
  const response = await apiFetch("/api/evaluation-progress/day-off/", {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = (await response.json().catch(() => ({}))) as {
    agentId?: string;
    date?: string;
    off?: boolean;
    detail?: string;
  };
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Unable to update day off.");
  }
  return {
    agentId: data.agentId || params.agentId,
    date: data.date || params.date,
    off: Boolean(data.off),
  };
}

export async function postEvaluationScheduledDayOff(params: {
  agentId: string;
  weekday: string;
}): Promise<{ agentId: string; weekday: string }> {
  const response = await apiFetch("/api/evaluation-progress/scheduled-day-off/", {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = (await response.json().catch(() => ({}))) as {
    agentId?: string;
    weekday?: string;
    detail?: string;
  };
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : "Unable to update scheduled day off.",
    );
  }
  return {
    agentId: data.agentId || params.agentId,
    weekday: data.weekday ?? params.weekday,
  };
}

export type RankingRow = {
  rank: string;
  agentName: string;
  alias: string;
  quality: string;
  quantity: string;
  rsd: string;
  volume: string;
  combinedScore: string;
};

export async function fetchRankings(params: {
  start?: string;
  end?: string;
  team?: string;
  metric?: string;
}): Promise<{ connected: boolean; detail?: string; rows: RankingRow[] }> {
  const query = new URLSearchParams({
    start: params.start || "",
    end: params.end || "",
    team: teamQuery(params.team, "calls"),
    metric: params.metric || "quality",
  });
  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    rows?: RankingRow[];
  }>(`/api/rankings/?${query}`);
  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    rows: Array.isArray(data.rows) ? data.rows : [],
  };
}

export type ReportsKpi = { id: string; label: string; value: string };

export async function fetchReports(params: {
  start?: string;
  end?: string;
  team?: string;
  agentIds?: string[];
}): Promise<{
  connected: boolean;
  detail?: string;
  kpis: ReportsKpi[];
  trendPoints: number[];
  trendLabels: string[];
}> {
  const query = new URLSearchParams({
    start: params.start || "",
    end: params.end || "",
    team: teamQuery(params.team),
  });
  if (params.agentIds?.length) query.set("agentIds", params.agentIds.join(","));
  const data = await getJson<{
    connected?: boolean;
    detail?: string;
    kpis?: ReportsKpi[];
    trendPoints?: number[];
    trendLabels?: string[];
  }>(`/api/reports/?${query}`);
  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    kpis: Array.isArray(data.kpis) ? data.kpis : [],
    trendPoints: Array.isArray(data.trendPoints) ? data.trendPoints : [],
    trendLabels: Array.isArray(data.trendLabels) ? data.trendLabels : [],
  };
}

import type { ReportExportPayload } from "./qaReportExport";

export async function fetchReportsExport(params: {
  start?: string;
  end?: string;
  team?: string;
  agentIds?: string[];
  period?: "months" | "weeks";
}): Promise<ReportExportPayload> {
  const query = new URLSearchParams({
    start: params.start || "",
    end: params.end || "",
    team: teamQuery(params.team),
    export: "1",
    period: params.period === "months" ? "months" : "weeks",
  });
  if (params.agentIds?.length) query.set("agentIds", params.agentIds.join(","));
  return getJson<ReportExportPayload>(`/api/reports/?${query}`);
}

export type ActionCenterPayload = {
  connected: boolean;
  detail?: string;
  health: Record<"urgent" | "watch" | "stable", string>;
  queues: Array<{
    id: string;
    title: string;
    counts: Record<"urgent" | "watch" | "stable", string>;
    href: string;
  }>;
  aging: Array<{ id: string; label: string; count: string }>;
};

export async function fetchActionCenter(params: {
  start?: string;
  end?: string;
  team?: string;
}): Promise<ActionCenterPayload> {
  const query = new URLSearchParams({
    start: params.start || "",
    end: params.end || "",
    team: teamQuery(params?.team),
  });
  const data = await getJson<ActionCenterPayload>(`/api/action-center/?${query}`);
  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    health: data.health ?? { urgent: "—", watch: "—", stable: "—" },
    queues: Array.isArray(data.queues) ? data.queues : [],
    aging: Array.isArray(data.aging) ? data.aging : [],
  };
}

export type PowerAutomateFlow = "avg-email" | "monitoring-email" | "share-audit";

export async function triggerPowerAutomate(
  flow: PowerAutomateFlow,
  payload: Record<string, unknown>,
): Promise<{ ok?: boolean; toEmail?: string; emailTestMode?: boolean }> {
  const { emailTestingPayloadFields } = await import("./emailTesting");
  const testing = emailTestingPayloadFields();
  return sendJson(`/api/integrations/power-automate/${encodeURIComponent(flow)}/`, "POST", {
    ...payload,
    ...testing,
  });
}

export async function fetchPowerAutomateStatus(): Promise<{
  flows: Record<string, { configured: boolean; env: string }>;
}> {
  return getJson(`/api/integrations/power-automate/`);
}

export type { CaseType };
