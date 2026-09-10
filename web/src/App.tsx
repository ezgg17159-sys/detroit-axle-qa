import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { AppShell } from "./layout/AppShell";
import { navItems } from "./nav/config";
import { NotificationProvider } from "./notifications/NotificationContext";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ActionCenterPage } from "./pages/ActionCenterPage";
import { RankingsPage } from "./pages/RankingsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AuditListPage } from "./pages/audits/AuditListPage";
import { AuditDetailsPage } from "./pages/audits/AuditDetailsPage";
import { EvaluationProgressPage } from "./pages/audits/EvaluationProgressPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import "./styles/tokens.css";
import "./styles/loading.css";
import "./styles/buttons.css";
import "./styles/notifications.css";
import "./styles/sidebar.css";
import "./styles/date-range.css";
import "./styles/analytics.css";
import "./styles/action-center.css";
import "./styles/rankings.css";
import "./styles/reports.css";
import "./styles/audits.css";
import "./styles/evaluation-progress.css";
import "./styles/data-table.css";
import "./styles/department-modal.css";
import "./App.css";

function pageForPath(path: string) {
  if (path === "/overview/analytics") return <AnalyticsPage />;
  if (path === "/overview/action-center") return <ActionCenterPage />;
  if (path === "/overview/rankings") return <RankingsPage />;
  if (path === "/overview/reports") return <ReportsPage />;
  if (path === "/audits/audit-list") return <AuditListPage />;
  if (path === "/audits/evaluation-progress") return <EvaluationProgressPage />;
  return <HomePage />;
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/overview/analytics" replace />} />
              <Route path="/account" element={<HomePage />} />
              <Route path="/audits/audit-details/:auditId" element={<AuditDetailsPage />} />
              <Route path="/audits/new" element={<Navigate to="/audits/audit-list" replace />} />
              {navItems.map((item) => (
                <Route
                  key={item.basePath}
                  path={item.basePath}
                  element={<Navigate to={item.children[0].to} replace />}
                />
              ))}
              {navItems.flatMap((item) =>
                item.children.map((child) => (
                  <Route
                    key={child.to}
                    path={child.to}
                    element={pageForPath(child.to)}
                  />
                )),
              )}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
