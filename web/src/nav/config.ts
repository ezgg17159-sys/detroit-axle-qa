import type { ComponentType } from "react";

import {
  AuditsIcon,
  CasesIcon,
  CoachingIcon,
  MonitoringIcon,
  OverviewIcon,
  ProductionIcon,
  TrackingIcon,
  UserIcon,
} from "../icons/NavIcons";

type IconProps = { className?: string; size?: number };

export type NavChild = { to: string; label: string };

export type NavItem = {
  label: string;
  icon: ComponentType<IconProps>;
  basePath: string;
  children: NavChild[];
};

export const navItems: NavItem[] = [
  {
    label: "Overview",
    icon: OverviewIcon,
    basePath: "/overview",
    children: [
      { to: "/overview/analytics", label: "Analytics" },
      { to: "/overview/action-center", label: "Action Center" },
      { to: "/overview/rankings", label: "Rankings" },
      { to: "/overview/reports", label: "Reports" },
    ],
  },
  {
    label: "Audits",
    icon: AuditsIcon,
    basePath: "/audits",
    children: [
      { to: "/audits/audit-list", label: "Audit List" },
      { to: "/audits/evaluation-progress", label: "Evaluation Progress" },
      { to: "/audits/team-heatmap", label: "Team Heatmap" },
    ],
  },
  {
    label: "Cases and Metrics",
    icon: CasesIcon,
    basePath: "/cases-and-metrics",
    children: [
      { to: "/cases-and-metrics/metrics", label: "Metrics" },
      { to: "/cases-and-metrics/cases", label: "Cases" },
    ],
  },
  {
    label: "Production",
    icon: ProductionIcon,
    basePath: "/production",
    children: [
      { to: "/production/team", label: "Team production" },
    ],
  },
  {
    label: "Monitoring and Feedbacks",
    icon: MonitoringIcon,
    basePath: "/monitoring-and-feedbacks",
    children: [
      { to: "/monitoring-and-feedbacks/monitoring", label: "Monitoring" },
      { to: "/monitoring-and-feedbacks/feedbacks", label: "Agent Feedback" },
    ],
  },
  {
    label: "Requests and Coaching",
    icon: CoachingIcon,
    basePath: "/requests-and-coaching",
    children: [
      { to: "/requests-and-coaching/supervisor-requests", label: "Supervisor Requests" },
      { to: "/requests-and-coaching/coaching", label: "Coaching" },
    ],
  },
  {
    label: "Team Tracking",
    icon: TrackingIcon,
    basePath: "/team-tracking",
    children: [
      { to: "/team-tracking/qa-team-tracking", label: "QA Team Tracking" },
    ],
  },
  {
    label: "Manage Users",
    icon: UserIcon,
    basePath: "/manage-users",
    children: [
      { to: "/manage-users/users", label: "Users" },
      { to: "/manage-users/permissions", label: "Permissions" },
    ],
  },
];

export function pageTitle(pathname: string): string {
  if (pathname === "/account") return "My Account";
  if (pathname.startsWith("/audits/audit-details/")) return "Audit Details";
  for (const item of navItems) {
    const child = item.children.find((c) => pathname === c.to);
    if (child) return child.label;
    if (pathname === item.basePath || pathname.startsWith(`${item.basePath}/`)) {
      return item.label;
    }
  }
  return "Quality Assurance";
}

export function allAppPaths(): string[] {
  return navItems.flatMap((item) => [
    item.basePath,
    ...item.children.map((child) => child.to),
  ]);
}
