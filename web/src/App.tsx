import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { ConfirmDeleteProvider } from "./components/ConfirmDeleteContext";
import { HomeRedirect, PortalShell, RequireEmployee, RequireStaff } from "./layout/PortalShell";
import { navItems } from "./nav/config";
import { NotificationProvider } from "./notifications/NotificationContext";
import { ThemeProvider } from "./theme/ThemeContext";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ActionCenterPage } from "./pages/ActionCenterPage";
import { RankingsPage } from "./pages/RankingsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AuditListPage } from "./pages/audits/AuditListPage";
import { AuditDetailsPage } from "./pages/audits/AuditDetailsPage";
import { EvaluationProgressPage } from "./pages/audits/EvaluationProgressPage";
import { TeamHeatmapPage } from "./pages/audits/TeamHeatmapPage";
import { CasesPage } from "./pages/cases/CasesPage";
import { CaseTypesPage } from "./pages/cases/CaseTypesPage";
import { ProductionPage } from "./pages/production/ProductionPage";
import { MonitoringPage } from "./pages/monitoring/MonitoringPage";
import { AgentFeedbackPage } from "./pages/feedback/AgentFeedbackPage";
import { SupervisorRequestsPage } from "./pages/requests/SupervisorRequestsPage";
import { CoachingPage } from "./pages/coaching/CoachingPage";
import { TeamTrackingPage } from "./pages/tracking/TeamTrackingPage";
import { ManageUsersPage } from "./pages/users/ManageUsersPage";
import { MyAccountPage } from "./pages/account/MyAccountPage";
import { EmployeeDashboardPage } from "./pages/employee/EmployeeDashboardPage";
import { EmployeeAuditsPage } from "./pages/employee/EmployeeAuditsPage";
import { EmployeeAuditDetailsPage } from "./pages/employee/EmployeeAuditDetailsPage";
import { EmployeeMonitoringPage } from "./pages/employee/EmployeeMonitoringPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import "./styles/tokens.css";
import "./styles/loading.css";
import "./styles/buttons.css";
import "./styles/notifications.css";
import "./styles/confirm-delete.css";
import "./styles/sidebar.css";
import "./styles/date-range.css";
import "./styles/analytics.css";
import "./styles/trend-chart.css";
import "./styles/action-center.css";
import "./styles/rankings.css";
import "./styles/reports.css";
import "./styles/audits.css";
import "./styles/evaluation-progress.css";
import "./styles/team-heatmap.css";
import "./styles/cases.css";
import "./styles/production.css";
import "./styles/monitoring.css";
import "./styles/agent-feedback.css";
import "./styles/supervisor-requests.css";
import "./styles/coaching.css";
import "./styles/team-tracking.css";
import "./styles/manage-users.css";
import "./styles/account.css";
import "./styles/employee.css";
import "./styles/data-table.css";
import "./styles/department-modal.css";
import "./styles/theme-dark.css";
import "./App.css";

function pageForPath(path: string) {
  if (path === "/overview/analytics") return <AnalyticsPage />;
  if (path === "/overview/action-center") return <ActionCenterPage />;
  if (path === "/overview/rankings") return <RankingsPage />;
  if (path === "/overview/reports") return <ReportsPage />;
  if (path === "/audits/audit-list") return <AuditListPage />;
  if (path === "/audits/evaluation-progress") return <EvaluationProgressPage />;
  if (path === "/audits/team-heatmap") return <TeamHeatmapPage />;
  if (path === "/cases-and-metrics/metrics") return <CasesPage />;
  if (path === "/cases-and-metrics/cases") return <CaseTypesPage />;
  if (path === "/production/team") return <ProductionPage />;
  if (path === "/monitoring-and-feedbacks/monitoring") return <MonitoringPage />;
  if (path === "/monitoring-and-feedbacks/feedbacks") return <AgentFeedbackPage />;
  if (path === "/requests-and-coaching/supervisor-requests") return <SupervisorRequestsPage />;
  if (path === "/requests-and-coaching/coaching") return <CoachingPage />;
  if (path === "/team-tracking/qa-team-tracking") return <TeamTrackingPage />;
  if (path === "/manage-users/users" || path === "/manage-users/permissions") {
    return <ManageUsersPage />;
  }
  return <HomePage />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <ConfirmDeleteProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route element={<PortalShell />}>
                  <Route path="/" element={<HomeRedirect />} />
                  <Route path="/account" element={<MyAccountPage />} />

                  <Route element={<RequireStaff />}>
                    <Route path="/audits/audit-details/:auditId" element={<AuditDetailsPage />} />
                    <Route path="/audits/new" element={<Navigate to="/audits/audit-list" replace />} />
                    <Route path="/production/calls" element={<Navigate to="/production/team" replace />} />
                    <Route path="/production/tickets" element={<Navigate to="/production/team" replace />} />
                    <Route path="/production/sales" element={<Navigate to="/production/team" replace />} />
                    {navItems.map((item) => (
                      <Route
                        key={item.basePath}
                        path={item.basePath}
                        element={<Navigate to={item.children[0]!.to} replace />}
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

                  <Route element={<RequireEmployee />}>
                    <Route path="/employee" element={<Navigate to="/employee/dashboard" replace />} />
                    <Route path="/employee/dashboard" element={<EmployeeDashboardPage />} />
                    <Route path="/employee/audits" element={<EmployeeAuditsPage />} />
                    <Route path="/employee/audits/:auditId" element={<EmployeeAuditDetailsPage />} />
                    <Route path="/employee/monitoring" element={<EmployeeMonitoringPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </ConfirmDeleteProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
