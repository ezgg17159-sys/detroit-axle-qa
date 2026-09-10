import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AppLoader } from "../components/AppLoader";
import { MenuIcon, UserIcon } from "../icons/NavIcons";
import { navItems, pageTitle } from "../nav/config";

export function AppShell() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  useEffect(() => {
    setPageLoading(true);
    const timer = window.setTimeout(() => setPageLoading(false), 320);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className={
        sidebarOpen ? "app-shell" : "app-shell app-shell--sidebar-collapsed"
      }
    >
      <div className="sidebar__brand">
        <img
          className="sidebar__brand-logo"
          src="/detroit-axle-logo.png"
          alt="Detroit Axle"
        />
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
          {pageTitle(location.pathname)}
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
                onClick={logout}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <aside className="sidebar" aria-label="Main navigation">
        <nav className="sidebar__nav">
          {navItems.map((item) => {
            const sectionActive =
              location.pathname === item.basePath ||
              location.pathname.startsWith(`${item.basePath}/`);

            return (
              <div
                key={item.basePath}
                className={
                  sectionActive
                    ? "sidebar__group sidebar__group--active"
                    : "sidebar__group"
                }
              >
                <NavLink
                  to={item.children[0].to}
                  title={sidebarOpen ? undefined : item.label}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    isActive || sectionActive
                      ? "sidebar__link sidebar__link--parent sidebar__link--active"
                      : "sidebar__link sidebar__link--parent"
                  }
                >
                  <item.icon className="sidebar__link-icon" />
                  <span className="sidebar__link-label">{item.label}</span>
                </NavLink>

                <div
                  className="sidebar__sub"
                  role="menu"
                  aria-label={`${item.label} submenu`}
                >
                  <div className="sidebar__sub-inner">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        role="menuitem"
                        onClick={(e) => (e.currentTarget as HTMLElement).blur()}
                        className={({ isActive }) =>
                          isActive
                            ? "sidebar__sublink sidebar__sublink--active"
                            : "sidebar__sublink"
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="app-shell__content">
        <div key={location.pathname} className="app-shell__page">
          {pageLoading ? (
            <div className="app-loader-overlay app-loader-overlay--shell">
              <AppLoader variant="page" label="Loading" />
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  );
}
