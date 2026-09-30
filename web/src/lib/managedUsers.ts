import type { AuthUser } from "./api";

export type UserDepartment =
  | "calls"
  | "tickets"
  | "live-chat"
  | "sales"
  | "quality-assurance"
  | "super-admin";

export type UserRole = "agent" | "supervisor" | "qa" | "admin" | "superadmin";

export type ConfigurableRole = "admin" | "supervisor";

export type ManagedUser = {
  id: string;
  agentName: string;
  alias: string;
  email: string;
  employeeId: string;
  vonageId: string;
  department: UserDepartment;
  role: UserRole;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ManagedUserDraft = {
  agentName: string;
  alias: string;
  email: string;
  employeeId: string;
  vonageId: string;
  department: UserDepartment;
  role: UserRole;
  password: string;
  confirmPassword: string;
};

/** Each sidebar sub-tab — permissions are view-only checkboxes. */
export type PermissionView =
  | "overview-analytics"
  | "overview-action-center"
  | "overview-rankings"
  | "overview-reports"
  | "audits-list"
  | "audits-evaluation-progress"
  | "audits-team-heatmap"
  | "cases-metrics"
  | "cases-types"
  | "production-team"
  | "monitoring"
  | "agent-feedback"
  | "supervisor-requests"
  | "coaching"
  | "qa-team-tracking"
  | "manage-users-users"
  | "manage-users-permissions";

export type RolePermissions = Record<PermissionView, boolean>;

/** `qa` kept for legacy accounts; not assignable or shown in permissions UI. */
export type PermissionsMatrix = Record<"admin" | "supervisor" | "qa", RolePermissions>;

export const USER_DEPARTMENT_OPTIONS: Array<{ id: UserDepartment; label: string }> = [
  { id: "calls", label: "Calls" },
  { id: "tickets", label: "Tickets" },
  { id: "live-chat", label: "Live Chat" },
  { id: "sales", label: "Sales" },
  { id: "quality-assurance", label: "Quality Assurance" },
];

export const SUPER_ADMIN_DEPARTMENT: { id: UserDepartment; label: string } = {
  id: "super-admin",
  label: "Super Admin",
};

export const USER_ROLE_OPTIONS: Array<{ id: UserRole; label: string }> = [
  { id: "agent", label: "Agent" },
  { id: "supervisor", label: "Supervisor" },
  { id: "admin", label: "Admin" },
];

export const SUPER_ADMIN_ROLE: { id: UserRole; label: string } = {
  id: "superadmin",
  label: "Super Admin",
};

export const CONFIGURABLE_ROLES: Array<{ id: ConfigurableRole; label: string }> = [
  { id: "admin", label: "Admin" },
  { id: "supervisor", label: "Supervisor" },
];

export const PERMISSION_VIEWS: Array<{
  id: PermissionView;
  label: string;
  group: string;
}> = [
  { id: "overview-analytics", label: "Analytics", group: "Overview" },
  { id: "overview-action-center", label: "Action Center", group: "Overview" },
  { id: "overview-rankings", label: "Rankings", group: "Overview" },
  { id: "overview-reports", label: "Reports", group: "Overview" },
  { id: "audits-list", label: "Audit List", group: "Audits" },
  { id: "audits-evaluation-progress", label: "Evaluation Progress", group: "Audits" },
  { id: "audits-team-heatmap", label: "Team Heatmap", group: "Audits" },
  { id: "cases-metrics", label: "Metrics", group: "Cases and Metrics" },
  { id: "cases-types", label: "Cases", group: "Cases and Metrics" },
  { id: "production-team", label: "Team production", group: "Production" },
  { id: "monitoring", label: "Monitoring", group: "Monitoring and Feedbacks" },
  { id: "agent-feedback", label: "Agent Feedback", group: "Monitoring and Feedbacks" },
  { id: "supervisor-requests", label: "Supervisor Requests", group: "Requests and Coaching" },
  { id: "coaching", label: "Coaching", group: "Requests and Coaching" },
  { id: "qa-team-tracking", label: "QA Team Tracking", group: "Team Tracking" },
  { id: "manage-users-users", label: "Users", group: "Manage Users" },
  { id: "manage-users-permissions", label: "Permissions", group: "Manage Users" },
];

/** Primary seeded super admin — password is wired in Django seed when DB is connected. */
export const PRIMARY_SUPER_ADMIN = {
  id: "user-superadmin-rashed",
  agentName: "Rashed Kattan",
  alias: "",
  email: "ralagha@detroitaxle.com",
  employeeId: "",
  vonageId: "",
  department: "super-admin" as UserDepartment,
  role: "superadmin" as UserRole,
  createdBy: "System",
};

/** Temp agent for local employee-portal testing (Django: seed_temp_employee). */
export const TEMP_EMPLOYEE = {
  id: "user-temp-employee",
  agentName: "Temp Employee",
  alias: "temp.emp",
  email: "temp.employee@detroitaxle.com",
  employeeId: "TEMP-001",
  vonageId: "",
  department: "calls" as UserDepartment,
  role: "agent" as UserRole,
  createdBy: "System",
};

const usersKey = "daq_managed_users_v2";
const permissionsKey = "daq_role_permissions_v3";

/** Teams a supervisor can own (operational channels only). */
export const SUPERVISOR_TEAM_OPTIONS: Array<{
  id: Exclude<UserDepartment, "super-admin" | "quality-assurance">;
  label: string;
}> = [
  { id: "calls", label: "Calls" },
  { id: "tickets", label: "Tickets" },
  { id: "live-chat", label: "Live Chat" },
  { id: "sales", label: "Sales" },
];

export function isSupervisorTeam(
  department: string | null | undefined,
): department is (typeof SUPERVISOR_TEAM_OPTIONS)[number]["id"] {
  return SUPERVISOR_TEAM_OPTIONS.some((option) => option.id === department);
}

function emptyRolePermissions(value: boolean): RolePermissions {
  return PERMISSION_VIEWS.reduce((acc, view) => {
    acc[view.id] = value;
    return acc;
  }, {} as RolePermissions);
}

function defaultPermissions(): PermissionsMatrix {
  return {
    admin: emptyRolePermissions(true),
    qa: {
      ...emptyRolePermissions(true),
      "manage-users-users": false,
      "manage-users-permissions": false,
    },
    supervisor: {
      ...emptyRolePermissions(false),
      "overview-analytics": true,
      "audits-list": true,
      "audits-evaluation-progress": true,
      monitoring: true,
      coaching: true,
    },
  };
}

function readUsers(): ManagedUser[] {
  try {
    const raw = sessionStorage.getItem(usersKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ManagedUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(rows: ManagedUser[]) {
  sessionStorage.setItem(usersKey, JSON.stringify(rows));
}

function ensurePrimarySuperAdmin(rows: ManagedUser[]): ManagedUser[] {
  const exists = rows.some(
    (row) =>
      row.id === PRIMARY_SUPER_ADMIN.id ||
      row.email.toLowerCase() === PRIMARY_SUPER_ADMIN.email.toLowerCase(),
  );
  if (exists) return rows;
  const now = new Date().toISOString();
  const seed: ManagedUser = {
    ...PRIMARY_SUPER_ADMIN,
    createdAt: now,
    updatedAt: now,
  };
  const next = [seed, ...rows];
  writeUsers(next);
  return next;
}

function ensureTempEmployee(rows: ManagedUser[]): ManagedUser[] {
  const exists = rows.some(
    (row) =>
      row.id === TEMP_EMPLOYEE.id ||
      row.email.toLowerCase() === TEMP_EMPLOYEE.email.toLowerCase(),
  );
  if (exists) return rows;
  const now = new Date().toISOString();
  const seed: ManagedUser = {
    ...TEMP_EMPLOYEE,
    createdAt: now,
    updatedAt: now,
  };
  const next = [...rows, seed];
  writeUsers(next);
  return next;
}

export function departmentLabel(department: UserDepartment | "all"): string {
  if (department === "all") return "All departments";
  if (department === "super-admin") return SUPER_ADMIN_DEPARTMENT.label;
  return USER_DEPARTMENT_OPTIONS.find((item) => item.id === department)?.label ?? department;
}

export function roleLabel(role: UserRole): string {
  if (role === "superadmin") return SUPER_ADMIN_ROLE.label;
  if (role === "qa") return "QA";
  return USER_ROLE_OPTIONS.find((item) => item.id === role)?.label ?? role;
}

export function needsVonageId(department: UserDepartment): boolean {
  return department === "calls" || department === "sales";
}

export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === "superadmin";
}

/** Domains allowed for managed-user emails (match backend ALLOWED_EMAIL_DOMAINS). */
export function allowedEmailDomains(): string[] {
  const raw = String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "detroitaxle.com");
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function assertAllowedWorkEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!value || !value.includes("@")) {
    throw new Error("A valid work email is required.");
  }
  const domain = value.split("@").pop() || "";
  const allowed = allowedEmailDomains();
  if (!allowed.includes(domain)) {
    throw new Error(
      `Email must use an allowed domain (${allowed.map((d) => `@${d}`).join(", ")}).`,
    );
  }
  return value;
}

export function resolveActorRole(authUser: AuthUser | null): UserRole | null {
  if (!authUser) return null;
  if (authUser.is_superuser) return "superadmin";
  const email = authUser.email?.trim().toLowerCase() ?? "";
  const name = authUser.full_name?.trim().toLowerCase() ?? "";
  if (email === PRIMARY_SUPER_ADMIN.email.toLowerCase()) return "superadmin";
  if (name === PRIMARY_SUPER_ADMIN.agentName.toLowerCase()) return "superadmin";

  const match = findManagedProfileForAuth(authUser);
  return match?.role ?? null;
}

export function departmentOptionsForActor(actorRole: UserRole | null): Array<{
  id: UserDepartment;
  label: string;
}> {
  if (isSuperAdmin(actorRole)) {
    return [...USER_DEPARTMENT_OPTIONS, SUPER_ADMIN_DEPARTMENT];
  }
  return [...USER_DEPARTMENT_OPTIONS];
}

export function roleOptionsForActor(actorRole: UserRole | null): Array<{
  id: UserRole;
  label: string;
}> {
  if (isSuperAdmin(actorRole)) {
    return [...USER_ROLE_OPTIONS, SUPER_ADMIN_ROLE];
  }
  return [...USER_ROLE_OPTIONS];
}

/** Super admins cannot be deleted by anyone (including other super admins). */
export function canDeleteManagedUser(
  actorRole: UserRole | null,
  target: ManagedUser,
): boolean {
  if (!actorRole) return false;
  if (isSuperAdmin(target.role)) return false;
  return isSuperAdmin(actorRole) || actorRole === "admin";
}

export function canAssignSuperAdmin(
  actorRole: UserRole | null,
): boolean {
  return isSuperAdmin(actorRole);
}

export function listManagedUsers(): ManagedUser[] {
  const rows = ensureTempEmployee(ensurePrimarySuperAdmin(readUsers()));
  return [...rows].sort((a, b) => {
    if (a.id === PRIMARY_SUPER_ADMIN.id) return -1;
    if (b.id === PRIMARY_SUPER_ADMIN.id) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function newManagedUserId(): string {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyUserDraft(): ManagedUserDraft {
  return {
    agentName: "",
    alias: "",
    email: "",
    employeeId: "",
    vonageId: "",
    department: "calls",
    role: "agent",
    password: "",
    confirmPassword: "",
  };
}

export async function createManagedUser(
  draft: ManagedUserDraft,
  createdBy: string,
  actorRole: UserRole | null,
): Promise<ManagedUser> {
  const department =
    draft.department === "super-admin" && !canAssignSuperAdmin(actorRole)
      ? "calls"
      : draft.department;
  const role =
    draft.role === "superadmin" && !canAssignSuperAdmin(actorRole)
      ? "agent"
      : department === "super-admin"
        ? "superadmin"
        : draft.role;

  const now = new Date().toISOString();
  const record: ManagedUser = {
    id: newManagedUserId(),
    agentName: draft.agentName.trim(),
    alias: draft.alias.trim(),
    email: draft.email.trim(),
    employeeId: draft.employeeId.trim(),
    vonageId: needsVonageId(department) ? draft.vonageId.trim() : "",
    department,
    role,
    createdBy: createdBy.trim() || "—",
    createdAt: now,
    updatedAt: now,
  };
  const { saveManagedUserRemote } = await import("./externalApi");
  const remote = (await saveManagedUserRemote(
    record as unknown as Record<string, unknown>,
  )) as ManagedUser;
  const merged = { ...record, ...remote, id: String(remote.id || record.id) };
  const rows = ensurePrimarySuperAdmin(readUsers()).filter((row) => row.id !== merged.id);
  rows.unshift(merged);
  writeUsers(rows);
  return merged;
}

export async function updateManagedUser(
  id: string,
  draft: ManagedUserDraft,
  actorRole: UserRole | null,
): Promise<ManagedUser | null> {
  const rows = ensurePrimarySuperAdmin(readUsers());
  const index = rows.findIndex((row) => row.id === id);
  const current: ManagedUser =
    index >= 0
      ? rows[index]!
      : {
          id,
          agentName: draft.agentName.trim(),
          alias: draft.alias.trim(),
          email: draft.email.trim(),
          employeeId: draft.employeeId.trim(),
          vonageId: draft.vonageId.trim(),
          department: draft.department,
          role: draft.role,
          createdBy: "—",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

  let department = draft.department;
  let role = draft.role;

  if (department === "super-admin" && !canAssignSuperAdmin(actorRole) && current.department !== "super-admin") {
    department = current.department;
  }
  if (role === "superadmin" && !canAssignSuperAdmin(actorRole) && current.role !== "superadmin") {
    role = current.role;
  }
  if (department === "super-admin") role = "superadmin";
  if (role === "superadmin") department = "super-admin";

  if (current.id === PRIMARY_SUPER_ADMIN.id) {
    department = "super-admin";
    role = "superadmin";
  }

  const next: ManagedUser = {
    ...current,
    id,
    agentName: draft.agentName.trim(),
    alias: draft.alias.trim(),
    email: draft.email.trim(),
    employeeId: draft.employeeId.trim(),
    vonageId: needsVonageId(department) ? draft.vonageId.trim() : "",
    department,
    role,
    updatedAt: new Date().toISOString(),
  };

  const { saveManagedUserRemote } = await import("./externalApi");
  const remote = (await saveManagedUserRemote(
    next as unknown as Record<string, unknown>,
  )) as Partial<ManagedUser>;
  const merged: ManagedUser = {
    ...next,
    ...remote,
    id,
    department: (remote.department as UserDepartment) || next.department,
    role: (remote.role as UserRole) || next.role,
  };
  if (index >= 0) rows[index] = merged;
  else rows.unshift(merged);
  writeUsers(rows);
  return merged;
}

export async function deleteManagedUser(
  id: string,
  actorRole: UserRole | null,
  targetHint?: ManagedUser,
): Promise<boolean> {
  const rows = ensurePrimarySuperAdmin(readUsers());
  const target =
    rows.find((row) => row.id === id) ??
    (targetHint && targetHint.id === id ? targetHint : undefined);
  if (!target || !canDeleteManagedUser(actorRole, target)) return false;
  const { deleteManagedUserRemote } = await import("./externalApi");
  await deleteManagedUserRemote(id);
  writeUsers(rows.filter((row) => row.id !== id));
  return true;
}

export function userCreatedInRange(
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

export function formatCreatedAt(iso: string): string {
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

export function listRolePermissions(): PermissionsMatrix {
  const defaults = defaultPermissions();
  try {
    const raw = sessionStorage.getItem(permissionsKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PermissionsMatrix>;
    return {
      admin: { ...defaults.admin, ...(parsed.admin || {}) },
      qa: { ...defaults.qa, ...(parsed.qa || {}) },
      supervisor: { ...defaults.supervisor, ...(parsed.supervisor || {}) },
    };
  } catch {
    return defaults;
  }
}

export async function saveRolePermissions(matrix: PermissionsMatrix): Promise<void> {
  const { saveRolePermissionsRemote } = await import("./externalApi");
  await saveRolePermissionsRemote(matrix);
  sessionStorage.setItem(permissionsKey, JSON.stringify(matrix));
}

export async function loadRolePermissionsRemote(): Promise<PermissionsMatrix> {
  const { fetchRolePermissions } = await import("./externalApi");
  try {
    const payload = await fetchRolePermissions();
    if (!payload.connected) return listRolePermissions();
    const defaults = defaultPermissions();
    const matrix: PermissionsMatrix = {
      admin: { ...defaults.admin, ...(payload.permissions.admin || {}) },
      qa: { ...defaults.qa, ...(payload.permissions.qa || {}) },
      supervisor: { ...defaults.supervisor, ...(payload.permissions.supervisor || {}) },
    };
    sessionStorage.setItem(permissionsKey, JSON.stringify(matrix));
    return matrix;
  } catch {
    return listRolePermissions();
  }
}

/** Super admin always has full view access. */
export function hasViewAccess(
  role: UserRole | null,
  view: PermissionView,
  matrix: PermissionsMatrix = listRolePermissions(),
): boolean {
  if (!role) return false;
  if (isSuperAdmin(role)) return true;
  if (role === "admin") return Boolean(matrix.admin[view]);
  if (role === "qa") return Boolean(matrix.qa[view]);
  if (role === "supervisor") return Boolean(matrix.supervisor[view]);
  return false;
}

let authProfileOverride: ManagedUser | null = null;

export function setAuthManagedProfile(profile: ManagedUser | null) {
  authProfileOverride = profile;
}

export function findManagedProfileForAuth(authUser: AuthUser | null): ManagedUser | null {
  if (!authUser) return null;
  if (
    authProfileOverride &&
    (authProfileOverride.email.toLowerCase() === (authUser.email?.trim().toLowerCase() ?? "") ||
      authProfileOverride.agentName.toLowerCase() ===
        (authUser.full_name?.trim().toLowerCase() ?? ""))
  ) {
    return authProfileOverride;
  }
  const email = authUser.email?.trim().toLowerCase() ?? "";
  const name = authUser.full_name?.trim().toLowerCase() ?? "";
  return (
    listManagedUsers().find((row) => {
      if (email && row.email.toLowerCase() === email) return true;
      if (name && row.agentName.toLowerCase() === name) return true;
      return false;
    }) ?? null
  );
}

export async function loadAuthManagedProfile(
  authUser: AuthUser | null,
): Promise<ManagedUser | null> {
  if (!authUser) {
    setAuthManagedProfile(null);
    return null;
  }
  const local = findManagedProfileForAuth(authUser);
  try {
    const { fetchManagedUsers } = await import("./externalApi");
    const search =
      authUser.email?.trim() ||
      authUser.full_name?.trim() ||
      authUser.username?.trim() ||
      "";
    if (!search) {
      setAuthManagedProfile(local);
      return local;
    }
    const payload = await fetchManagedUsers({ search, limit: 100 });
    if (!payload.connected || payload.items.length === 0) {
      setAuthManagedProfile(local);
      return local;
    }
    const emailLc = authUser.email?.trim().toLowerCase() ?? "";
    const nameLc = authUser.full_name?.trim().toLowerCase() ?? "";
    const row =
      payload.items.find(
        (item) => emailLc && String(item.email || "").toLowerCase() === emailLc,
      ) ||
      payload.items.find(
        (item) => nameLc && String(item.agentName || "").toLowerCase() === nameLc,
      ) ||
      null;
    if (!row) {
      setAuthManagedProfile(local);
      return local;
    }
    const profile: ManagedUser = {
      id: String(row.id || local?.id || ""),
      agentName: String(row.agentName || ""),
      alias: String(row.alias || ""),
      email: String(row.email || ""),
      employeeId: String(row.employeeId || ""),
      vonageId: String(row.vonageId || ""),
      department: (row.department as UserDepartment) || "calls",
      role: (row.role as UserRole) || "agent",
      createdBy: String(row.createdBy || ""),
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
    };
    setAuthManagedProfile(profile);
    return profile;
  } catch {
    setAuthManagedProfile(local);
    return local;
  }
}
