import { getStoredAccessToken } from "./api";
import type { DateRange } from "./dateRange";
import type { DepartmentDetails, QualityTrend } from "../components/DepartmentDetailModal";

export type AnalyticsKpi = {
  id: string;
  label: string;
  value: string;
};

export type AnalyticsDepartment = DepartmentDetails & {
  trendPoints: number[];
  trendLabels: string[];
};

export type AnalyticsPayload = {
  connected: boolean;
  detail?: string;
  kpis: AnalyticsKpi[];
  departments: AnalyticsDepartment[];
};

function apiPath(path: string): string {
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

function authHeaders(): HeadersInit {
  const token = getStoredAccessToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toIso(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function asTrend(value: string | undefined): QualityTrend {
  if (value === "up" || value === "down" || value === "flat") return value;
  return "flat";
}

export async function fetchAnalyticsOverview(range: DateRange): Promise<AnalyticsPayload> {
  if (!range.start || !range.end) {
    return { connected: false, detail: "Select a date range.", kpis: [], departments: [] };
  }

  const query = new URLSearchParams({
    start: toIso(range.start),
    end: toIso(range.end),
  });

  let response: Response;
  try {
    response = await fetch(apiPath(`/api/analytics/?${query}`), {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("Cannot reach the API. Make sure Django is running on port 8000.");
  }

  const data = (await response.json().catch(() => ({}))) as AnalyticsPayload & {
    detail?: string;
  };

  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : "Unable to load analytics.",
    );
  }

  const departments = (data.departments ?? []).map((dept) => ({
    ...dept,
    avgQualityTrend: asTrend(dept.avgQualityTrend),
    volumeTrend: asTrend(dept.volumeTrend),
    trendPoints: Array.isArray(dept.trendPoints) ? dept.trendPoints : [],
    trendLabels: Array.isArray(dept.trendLabels) ? dept.trendLabels : [],
  }));

  return {
    connected: Boolean(data.connected),
    detail: data.detail,
    kpis: Array.isArray(data.kpis) ? data.kpis : [],
    departments,
  };
}
