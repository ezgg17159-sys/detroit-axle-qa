import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AppLoader } from "../components/AppLoader";
import { usesEmployeePortal } from "../lib/employeePortal";
import { loadAuthManagedProfile, setAuthManagedProfile } from "../lib/managedUsers";
import {
  loadSupervisorTeamScope,
  resolveSupervisorTeamScope,
  setActiveTeamScope,
} from "../lib/teamScope";
import { AppShell } from "./AppShell";
import { EmployeeShell } from "./EmployeeShell";

export function PortalShell() {
  const { user, isAuthenticated, bootstrapping } = useAuth();
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProfileReady(false);
    void (async () => {
      if (!user) {
        setAuthManagedProfile(null);
        setActiveTeamScope(null);
        if (!cancelled) setProfileReady(true);
        return;
      }
      await loadAuthManagedProfile(user);
      const scope =
        resolveSupervisorTeamScope(user) || (await loadSupervisorTeamScope(user));
      setActiveTeamScope(scope);
      if (!cancelled) setProfileReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (bootstrapping || (isAuthenticated && user && !profileReady)) {
    return (
      <div className="app-shell app-shell--boot">
        <AppLoader variant="page" label="Loading session…" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return usesEmployeePortal(user) ? <EmployeeShell /> : <AppShell />;
}

export function HomeRedirect() {
  const { user } = useAuth();
  if (usesEmployeePortal(user)) {
    return <Navigate to="/employee/dashboard" replace />;
  }
  return <Navigate to="/overview/analytics" replace />;
}

export function RequireStaff({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  if (usesEmployeePortal(user)) {
    return <Navigate to="/employee/dashboard" replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}

export function RequireEmployee({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  if (!usesEmployeePortal(user)) {
    return <Navigate to="/overview/analytics" replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}
