import type { AuthUser } from "./api";
import {
  PERMISSION_VIEWS,
  hasViewAccess,
  listRolePermissions,
  loadRolePermissionsRemote,
  resolveActorRole,
  type PermissionView,
  type PermissionsMatrix,
} from "./managedUsers";

const PATH_TO_VIEW: Array<{ prefix: string; view: PermissionView }> = [
  { prefix: "/overview/analytics", view: "overview-analytics" },
  { prefix: "/overview/action-center", view: "overview-action-center" },
  { prefix: "/overview/rankings", view: "overview-rankings" },
  { prefix: "/overview/reports", view: "overview-reports" },
  { prefix: "/audits/audit-list", view: "audits-list" },
  { prefix: "/audits/audit-details", view: "audits-list" },
  { prefix: "/audits/evaluation-progress", view: "audits-evaluation-progress" },
  { prefix: "/audits/team-heatmap", view: "audits-team-heatmap" },
  { prefix: "/cases-and-metrics/metrics", view: "cases-metrics" },
  { prefix: "/cases-and-metrics/cases", view: "cases-types" },
  { prefix: "/production/team", view: "production-team" },
  { prefix: "/monitoring-and-feedbacks/monitoring", view: "monitoring" },
  { prefix: "/monitoring-and-feedbacks/feedbacks", view: "agent-feedback" },
  { prefix: "/requests-and-coaching/supervisor-requests", view: "supervisor-requests" },
  { prefix: "/requests-and-coaching/coaching", view: "coaching" },
  { prefix: "/team-tracking/qa-team-tracking", view: "qa-team-tracking" },
  { prefix: "/manage-users/users", view: "manage-users-users" },
  { prefix: "/manage-users/permissions", view: "manage-users-permissions" },
];

export function viewForPath(pathname: string): PermissionView | null {
  const match = PATH_TO_VIEW.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
  );
  return match?.view ?? null;
}

export function canAccessPath(
  pathname: string,
  user: AuthUser | null,
  matrix: PermissionsMatrix = listRolePermissions(),
): boolean {
  if (!user) return false;
  if (user.is_superuser) return true;
  const role = resolveActorRole(user);
  if (!role) return Boolean(user.is_staff);
  if (role === "agent") return false;
  const view = viewForPath(pathname);
  if (!view) return true;
  return hasViewAccess(role, view, matrix);
}

export function filterNavByPermissions<
  T extends { basePath: string; children: Array<{ to: string; label: string }> },
>(items: T[], user: AuthUser | null, matrix: PermissionsMatrix): T[] {
  return items
    .map((item) => ({
      ...item,
      children: item.children.filter((child) => canAccessPath(child.to, user, matrix)),
    }))
    .filter((item) => item.children.length > 0);
}

export { loadRolePermissionsRemote, listRolePermissions, PERMISSION_VIEWS };
export type { PermissionsMatrix, PermissionView };
