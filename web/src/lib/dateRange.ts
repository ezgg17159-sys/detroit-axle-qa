export type DateRange = {
  start: Date | null;
  end: Date | null;
};

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isBeforeDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() < startOfDay(b).getTime();
}

export function isAfterDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() > startOfDay(b).getTime();
}

export function isInRange(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const t = startOfDay(day).getTime();
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  return t > s && t < e;
}

export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRangeLabel(range: DateRange): string {
  if (range.start && range.end) {
    if (sameDay(range.start, range.end)) {
      return formatDisplayDate(range.start);
    }
    return `${formatDisplayDate(range.start)} – ${formatDisplayDate(range.end)}`;
  }
  if (range.start) return `${formatDisplayDate(range.start)} – …`;
  return "Select date range";
}

export function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

/** Calendar cells for a month view (Sunday-first), including leading/trailing days. */
export function buildMonthCells(viewMonth: Date): Date[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    cells.push(startOfDay(day));
  }
  return cells;
}

export function defaultAnalyticsRange(): DateRange {
  const end = startOfDay(new Date());
  const start = startOfDay(new Date());
  start.setDate(end.getDate() - 8);
  return { start, end };
}

export function toIsoDate(day: Date | null | undefined): string {
  if (!day) return "";
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD into a local start-of-day Date, or null if invalid. */
export function parseIsoDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return startOfDay(new Date(y, m - 1, d));
}

/** Build a date range from URL `start` / `end` query values when both are valid. */
export function rangeFromSearchParams(
  params: URLSearchParams | { get: (key: string) => string | null },
): DateRange | null {
  const start = parseIsoDay(params.get("start"));
  const end = parseIsoDay(params.get("end"));
  if (!start || !end) return null;
  if (start.getTime() > end.getTime()) return { start: end, end: start };
  return { start, end };
}

/** Public app origin for deep links (emails). Prefers VITE_APP_URL. */
export function appOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_APP_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/** Deep link to My Audits filtered by inclusive date range. */
export function employeeAuditsDeepLink(startIso: string, endIso: string): string {
  const origin = appOrigin();
  const query = new URLSearchParams({ start: startIso, end: endIso });
  const path = `/employee/audits?${query.toString()}`;
  return origin ? `${origin}${path}` : path;
}

/** Deep link to My Monitoring in the employee portal. */
export function employeeMonitoringDeepLink(): string {
  const origin = appOrigin();
  const path = "/employee/monitoring";
  return origin ? `${origin}${path}` : path;
}
