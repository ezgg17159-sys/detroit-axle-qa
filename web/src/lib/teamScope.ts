import type { AuthUser } from "./api";
import type { AuditTeam } from "./audits";
import {
  findManagedProfileForAuth,
  isSupervisorTeam,
  resolveActorRole,
  type ManagedUser,
} from "./managedUsers";

let activeTeamScope: AuditTeam | null = null;

function teamFromProfile(profile: ManagedUser | null): AuditTeam | null {
  if (!profile || !isSupervisorTeam(profile.department)) return null;
  return profile.department;
}

/** Locked team for the signed-in supervisor (null for other roles). */
export function resolveSupervisorTeamScope(authUser: AuthUser | null): AuditTeam | null {
  const role = resolveActorRole(authUser);
  if (role !== "supervisor") return null;
  return teamFromProfile(findManagedProfileForAuth(authUser));
}

/** Prefer live managed-users match, then local cache. */
export async function loadSupervisorTeamScope(
  authUser: AuthUser | null,
): Promise<AuditTeam | null> {
  const role = resolveActorRole(authUser);
  if (role !== "supervisor" || !authUser) return null;

  const local = teamFromProfile(findManagedProfileForAuth(authUser));
  if (local) return local;

  try {
    const { fetchManagedUsers } = await import("./externalApi");
    const search =
      authUser.email?.trim() ||
      authUser.full_name?.trim() ||
      authUser.username?.trim() ||
      "";
    if (!search) return null;
    const payload = await fetchManagedUsers({ search, limit: 100 });
    if (!payload.connected || payload.items.length === 0) return null;
    const emailLc = authUser.email?.trim().toLowerCase() ?? "";
    const nameLc = authUser.full_name?.trim().toLowerCase() ?? "";
    const match =
      payload.items.find(
        (row) => emailLc && String(row.email || "").toLowerCase() === emailLc,
      ) ||
      payload.items.find(
        (row) => nameLc && String(row.agentName || "").toLowerCase() === nameLc,
      ) ||
      null;
    const department = String(match?.department || "");
    if (isSupervisorTeam(department)) return department;
  } catch {
    /* keep null */
  }
  return null;
}

export function setActiveTeamScope(team: AuditTeam | null) {
  activeTeamScope = team;
}

export function getActiveTeamScope(): AuditTeam | null {
  return activeTeamScope;
}

/** Force API team filters to the supervisor’s department when scoped. */
export function scopedTeamParam(requested?: string | null): string {
  if (activeTeamScope) return activeTeamScope;
  return requested?.trim() || "all";
}
