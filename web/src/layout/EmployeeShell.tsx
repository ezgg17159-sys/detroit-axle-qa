import { useRef, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AppLoader } from "../components/AppLoader";
import {
  PageLoadingProvider,
  usePageLoadingState,
} from "../components/PageLoadingContext";
import { SidebarActiveHighlight } from "../components/SidebarActiveHighlight";
import { MenuIcon, UserIcon } from "../icons/NavIcons";
import { EMPLOYEE_NAV } from "../lib/employeePortal";

function employeePageTitle(pathname: string): string {
  if (pathname === "/account") return "My Account";
  if (pathname.startsWith("/employee/audits/")) return "Audit Details";
  const match = EMPLOYEE_NAV.find((item) => pathname === item.to);
  return match?.label ?? "Employee";
}

function EmployeeShellContent() {
  const { user, isAuthenticated, bootstrapping, logout } = useAuth();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { pageLoading } = usePageLoadingState();

  if (bootstrapping) {
    return (
      <div className="app-shell app-shell--boot">
        <AppLoader variant="page" label="Loading session…" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className={
        sidebarOpen ? "app-shell" : "app-shell app-shell--sidebar-collapsed"
      }
    >
      <div className="sidebar__brand" aria-label="Detroit Axle">
        <div className="sidebar__brand-swap" aria-hidden="true">
          <img
            className="sidebar__brand-logo sidebar__brand-logo--full"
            src="/detroit-axle-logo.png"
            alt=""
          />
          <img
            className="sidebar__brand-logo sidebar__brand-logo--mark"
            src="/small-logo.png"
            alt=""
          />
        </div>
      </div>

      <header className="app-header">
        <button
          type="button"
          className="app-header__menu"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <MenuIcon />
        </button>
        <h1 key={location.pathname} className="app-header__title">
          {employeePageTitle(location.pathname)}
        </h1>

        <div className="app-header__user">
          <button
            type="button"
            className="app-header__user-btn"
            aria-label="Account menu"
            aria-haspopup="menu"
          >
            <UserIcon />
          </button>
          <div className="app-header__user-menu" role="menu" aria-label="Account">
            <div className="app-header__user-menu-inner">
              <NavLink
                to="/account"
                role="menuitem"
                className="app-header__user-item"
                onClick={(e) => (e.currentTarget as HTMLElement).blur()}
              >
                My Account
              </NavLink>
              <button
                type="button"
                role="menuitem"
                className="app-header__user-item"
                onClick={() => void logout()}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <aside className="sidebar sidebar--employee" aria-label="Employee navigation">
        <nav ref={navRef} className="sidebar__nav employee-nav">
          <SidebarActiveHighlight navRef={navRef} sidebarOpen={sidebarOpen} />
          {EMPLOYEE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/employee/audits"}
              title={sidebarOpen ? undefined : item.label}
              aria-label={item.label}
              className={({ isActive }) =>
                isActive
                  ? "sidebar__link sidebar__link--parent sidebar__link--active employee-nav__link"
                  : "sidebar__link sidebar__link--parent employee-nav__link"
              }
            >
              <item.icon className="sidebar__link-icon" />
              <span className="sidebar__link-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-shell__content">
        <div key={location.pathname} className="app-shell__page">
          <Outlet />
          {pageLoading ? (
            <div className="app-loader-overlay app-loader-overlay--shell">
              <AppLoader variant="page" label="Loading" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EmployeeShell() {
  return (
    <PageLoadingProvider>
      <EmployeeShellContent />
    </PageLoadingProvider>
  );
}
