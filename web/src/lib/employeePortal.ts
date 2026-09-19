import type { ComponentType } from "react";

import type { AuthUser } from "./api";
import {
  formatAuditDate,
  listAudits,
  type AuditRecord,
} from "./audits";
import {
  AuditsIcon,
  MonitoringIcon,
  OverviewIcon,
} from "../icons/NavIcons";
import { toIsoDate } from "./dateRange";
import { fetchAudits, fetchManagedUsers, fetchMonitoring } from "./externalApi";
import {
  listManagedUsers,
  resolveActorRole,
  type ManagedUser,
  type UserRole,
} from "./managedUsers";
import { listMonitoring, type MonitoringRecord } from "./monitoring";

type IconProps = { className?: string; size?: number };

export type EmployeeIdentity = {
  displayName: string;
  email: string;
  username: string;
  alias: string;
  employeeId: string;
  names: string[];
  ids: string[];
  role: UserRole | null;
  managed: ManagedUser | null;
};

/** Agents use the employee portal; supervisors/QA/admin use the full QA app. */
export function usesEmployeePortal(authUser: AuthUser | null): boolean {
  if (!authUser) return false;
  if (authUser.is_superuser) return false;
  const role = resolveActorRole(authUser);
  if (role === "qa" || role === "admin" || role === "superadmin" || role === "supervisor") {
    return false;
  }
  if (role === "agent") return true;
  return !authUser.is_staff;
}

function buildIdentity(
  authUser: AuthUser,
  managed: ManagedUser | null,
): EmployeeIdentity {
  const email = authUser.email?.trim() ?? "";
  const fullName = authUser.full_name?.trim() ?? "";
  const username = authUser.username?.trim() ?? "";
  const emailLocal = email.includes("@") ? email.split("@")[0]?.trim() ?? "" : "";

  const names = [
    managed?.agentName,
    managed?.alias,
    fullName,
    username,
    emailLocal,
  ]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter((value) => value.length > 1);

  const ids = [
    managed?.employeeId,
    managed?.id,
    authUser.id ? String(authUser.id) : "",
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  return {
    displayName: managed?.agentName || fullName || username || "Employee",
    email: managed?.email || email || "—",
    username: username || "—",
    alias: managed?.alias || "",
    employeeId: managed?.employeeId || "",
    names: Array.from(new Set(names)),
    ids: Array.from(new Set(ids)),
    role: resolveActorRole(authUser),
    managed,
  };
}

function findLocalManaged(authUser: AuthUser): ManagedUser | null {
  const email = authUser.email?.trim() ?? "";
  const fullName = authUser.full_name?.trim() ?? "";
  return (
    listManagedUsers().find((row) => {
      if (email && row.email.toLowerCase() === email.toLowerCase()) return true;
      if (fullName && row.agentName.toLowerCase() === fullName.toLowerCase()) return true;
      return false;
    }) ?? null
  );
}

export function getEmployeeIdentity(authUser: AuthUser | null): EmployeeIdentity | null {
  if (!authUser) return null;
  return buildIdentity(authUser, findLocalManaged(authUser));
}

function asManagedUser(row: Record<string, unknown>): ManagedUser {
  return {
    id: String(row.id || ""),
    agentName: String(row.agentName || ""),
    alias: String(row.alias || ""),
    email: String(row.email || ""),
    employeeId: String(row.employeeId || ""),
    vonageId: String(row.vonageId || ""),
    department: (row.department as ManagedUser["department"]) || "calls",
    role: (row.role as ManagedUser["role"]) || "agent",
    createdBy: String(row.createdBy || ""),
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || ""),
  };
}

/** Resolve agent profile from live managed-users API (email / name / username). */
export async function resolveEmployeeIdentity(
  authUser: AuthUser | null,
): Promise<EmployeeIdentity | null> {
  if (!authUser) return null;
  let managed = findLocalManaged(authUser);

  const email = authUser.email?.trim() ?? "";
  const fullName = authUser.full_name?.trim() ?? "";
  const username = authUser.username?.trim() ?? "";
  const search = email || fullName || username;

  if (search) {
    try {
      const payload = await fetchManagedUsers({ search, limit: 200 });
      if (payload.connected && payload.items.length > 0) {
        const rows = payload.items.map((row) => asManagedUser(row));
        const emailLc = email.toLowerCase();
        const nameLc = fullName.toLowerCase();
        const userLc = username.toLowerCase();
        managed =
          rows.find((row) => emailLc && row.email.toLowerCase() === emailLc) ||
          rows.find((row) => nameLc && row.agentName.toLowerCase() === nameLc) ||
          rows.find(
            (row) =>
              userLc &&
              (row.alias.toLowerCase() === userLc ||
                row.agentName.toLowerCase() === userLc ||
                row.employeeId.toLowerCase() === userLc),
          ) ||
          rows.find(
            (row) =>
              emailLc &&
              row.email &&
              row.email.toLowerCase().startsWith(emailLc.split("@")[0] || "___"),
          ) ||
          null;
        if (!managed) managed = findLocalManaged(authUser);
      }
    } catch {
      /* keep local identity */
    }
  }

  return buildIdentity(authUser, managed);
}

export function matchesIdentity(
  identity: EmployeeIdentity,
  agentName: string,
  alias: string,
  agentId: string,
): boolean {
  const name = agentName.trim().toLowerCase();
  const al = alias.trim().toLowerCase();
  const id = agentId.trim().toLowerCase();
  if (name && identity.names.includes(name)) return true;
  if (al && identity.names.includes(al)) return true;
  if (id && (identity.ids.includes(id) || identity.names.includes(id))) return true;
  // Email local-part as weak alias match (e.g. jwest@… → jwest)
  const emailLocal = identity.email.split("@")[0]?.trim().toLowerCase() ?? "";
  if (emailLocal && emailLocal.length > 2) {
    if (name === emailLocal || al === emailLocal || id === emailLocal) return true;
  }
  return false;
}

export function listEmployeeAudits(identity: EmployeeIdentity): AuditRecord[] {
  return listAudits()
    .filter((audit) =>
      matchesIdentity(identity, audit.agentName, audit.alias, audit.agentId),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function listEmployeeMonitoring(identity: EmployeeIdentity): MonitoringRecord[] {
  return listMonitoring().filter((row) =>
    matchesIdentity(identity, row.agentName, "", row.agentId),
  );
}

/** Live audits for this employee (matched by agent identity). */
export async function loadEmployeeAudits(
  identity: EmployeeIdentity,
  params?: { start?: Date | null; end?: Date | null },
): Promise<AuditRecord[]> {
  const start = toIsoDate(params?.start ?? null) || undefined;
  const end = toIsoDate(params?.end ?? null) || undefined;
  const searches = Array.from(
    new Set(
      [
        identity.employeeId,
        identity.managed?.agentName,
        identity.displayName,
        identity.alias,
      ]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );

  const collect = (audits: AuditRecord[]) =>
    audits.filter((audit) =>
      matchesIdentity(identity, audit.agentName, audit.alias, audit.agentId),
    );

  try {
    const seen = new Set<string>();
    const matched: AuditRecord[] = [];

    const queries = searches.length > 0 ? searches : [""];
    for (const search of queries) {
      const payload = await fetchAudits({
        start,
        end,
        team: "all",
        search: search || undefined,
        limit: 2000,
        offset: 0,
      });
      if (!payload.connected) break;
      for (const audit of collect(payload.audits)) {
        if (seen.has(audit.id)) continue;
        seen.add(audit.id);
        matched.push(audit);
      }
      if (matched.length > 0) break;
    }

    // Broad fallback: date-range only, then filter by identity client-side.
    if (matched.length === 0) {
      const payload = await fetchAudits({
        start,
        end,
        team: "all",
        search: "",
        limit: 2000,
        offset: 0,
      });
      if (payload.connected) {
        return collect(payload.audits).sort((a, b) => b.date.localeCompare(a.date));
      }
    } else {
      return matched.sort((a, b) => b.date.localeCompare(a.date));
    }
  } catch {
    /* fall through to local */
  }
  return listEmployeeAudits(identity).filter((audit) =>
    auditInRange(audit.date, params?.start ?? null, params?.end ?? null),
  );
}

export async function loadEmployeeMonitoring(
  identity: EmployeeIdentity,
): Promise<MonitoringRecord[]> {
  const search =
    identity.employeeId ||
    identity.managed?.agentName ||
    identity.displayName ||
    identity.alias ||
    "";

  try {
    const payload = await fetchMonitoring({
      team: "all",
      status: "all",
      search,
      limit: 2000,
      offset: 0,
    });
    if (payload.connected) {
      return payload.items.filter((row) =>
        matchesIdentity(identity, row.agentName, "", row.agentId),
      );
    }
  } catch {
    /* fall through */
  }
  return listEmployeeMonitoring(identity);
}

export function auditInRange(
  auditDate: string,
  start: Date | null,
  end: Date | null,
): boolean {
  if (!start && !end) return true;
  if (!auditDate) return false;
  const day = new Date(`${auditDate}T00:00:00`);
  if (Number.isNaN(day.getTime())) return false;
  const t = day.getTime();
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

export function monitoringInRange(
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

function parseScore(value: string): number | null {
  const n = Number(String(value).replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

export type EmployeeDashboardStats = {
  totalAudits: number;
  avgQuality: number | null;
  chartPoints: number[];
  chartLabels: string[];
};

export function buildEmployeeDashboardFromAudits(
  audits: AuditRecord[],
): EmployeeDashboardStats {
  const scores = audits
    .map((audit) => parseScore(audit.qualityScore || audit.score))
    .filter((value): value is number => value != null);

  const avgQuality =
    scores.length > 0
      ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
      : null;

  const byDate = new Map<string, number[]>();
  for (const audit of audits) {
    const score = parseScore(audit.qualityScore || audit.score);
    if (score == null || !audit.date) continue;
    const list = byDate.get(audit.date) ?? [];
    list.push(score);
    byDate.set(audit.date, list);
  }

  const dates = Array.from(byDate.keys()).sort();
  const chartPoints = dates.map((date) => {
    const list = byDate.get(date) ?? [];
    return Math.round(list.reduce((sum, value) => sum + value, 0) / list.length);
  });
  const chartLabels = dates.map((date) => formatAuditDate(date));

  return {
    totalAudits: audits.length,
    avgQuality,
    chartPoints,
    chartLabels,
  };
}

export function buildEmployeeDashboard(
  identity: EmployeeIdentity,
  start: Date | null,
  end: Date | null,
): EmployeeDashboardStats {
  const audits = listEmployeeAudits(identity).filter((audit) =>
    auditInRange(audit.date, start, end),
  );
  return buildEmployeeDashboardFromAudits(audits);
}

export const EMPLOYEE_NAV: Array<{
  to: string;
  label: string;
  icon: ComponentType<IconProps>;
}> = [
  { to: "/employee/dashboard", label: "Dashboard", icon: OverviewIcon },
  { to: "/employee/audits", label: "My Audits", icon: AuditsIcon },
  { to: "/employee/monitoring", label: "My Monitoring", icon: MonitoringIcon },
];
