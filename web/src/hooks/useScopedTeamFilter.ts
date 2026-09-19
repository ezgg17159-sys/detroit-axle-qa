import { useEffect, useState } from "react";

import type { AuditTeam } from "../lib/audits";
import { getActiveTeamScope } from "../lib/teamScope";

type TeamFilter = AuditTeam | "all";

/**
 * Team filter that locks to the supervisor’s department when scoped.
 */
export function useScopedTeamFilter(
  initial: TeamFilter = "all",
): [TeamFilter, (next: TeamFilter) => void, { locked: boolean; scope: AuditTeam | null }] {
  const scope = getActiveTeamScope();
  const [team, setTeam] = useState<TeamFilter>(() => scope ?? initial);

  useEffect(() => {
    if (scope) setTeam(scope);
  }, [scope]);

  const setScoped = (next: TeamFilter) => {
    if (scope) {
      setTeam(scope);
      return;
    }
    setTeam(next);
  };

  return [scope ?? team, setScoped, { locked: Boolean(scope), scope }];
}
