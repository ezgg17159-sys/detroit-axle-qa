import type { AuditTeam } from "./audits";
import { listAudits, listAgents } from "./audits";
import { startOfDay, toIsoDate, employeeAuditsDeepLink, type DateRange } from "./dateRange";

export type ProgressAgent = {
  id: string;
  name: string;
  alias: string;
  team: AuditTeam;
  /** Weekly scheduled day off, e.g. "Sun" — empty until agents API provides it */
  scheduledDayOff: string;
};

const offDaysKey = "daq_eval_off_days_v1";

type OffDayMap = Record<string, string[]>; // agentId -> ["YYYY-MM-DD", ...]

function readOffDays(): OffDayMap {
  try {
    const raw = sessionStorage.getItem(offDaysKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OffDayMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOffDays(map: OffDayMap) {
  sessionStorage.setItem(offDaysKey, JSON.stringify(map));
}

export function listProgressAgents(): ProgressAgent[] {
  return listAgents().map((agent) => ({
    id: agent.id,
    name: agent.name,
    alias: agent.alias,
    team: agent.team,
    scheduledDayOff: "",
  }));
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function monthFromRange(range: DateRange): { year: number; month: number } {
  const anchor = range.end ?? range.start ?? new Date();
  return { year: anchor.getFullYear(), month: anchor.getMonth() };
}

export function isoDate(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function parseScore(score: string): number | null {
  const match = score.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** QA score for a day from completed audits only. */
export function scoreForDay(agentId: string, iso: string): number | null {
  const audits = listAudits().filter(
    (audit) => audit.agentId === agentId && audit.date === iso && audit.evaluate === "done",
  );
  if (audits.length === 0) return null;
  const values = audits
    .map((audit) => parseScore(audit.qualityScore || audit.score))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function latestAuditDate(agentId: string): string {
  const dates = listAudits()
    .filter((audit) => audit.agentId === agentId)
    .map((audit) => audit.date)
    .filter(Boolean)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1]! : "";
}

export function isDayOff(agentId: string, iso: string): boolean {
  return (readOffDays()[agentId] ?? []).includes(iso);
}

export function toggleDayOff(agentId: string, iso: string): boolean {
  const map = readOffDays();
  const current = new Set(map[agentId] ?? []);
  if (current.has(iso)) current.delete(iso);
  else current.add(iso);
  map[agentId] = Array.from(current).sort();
  writeOffDays(map);
  return current.has(iso);
}

/** Inclusive calendar-day check for the selected date range. */
export function isoInDateRange(iso: string, range: DateRange): boolean {
  if (!range.start || !range.end) return false;
  const day = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(day.getTime())) return false;
  const t = startOfDay(day).getTime();
  const start = startOfDay(range.start).getTime();
  const end = startOfDay(range.end).getTime();
  return t >= start && t <= end;
}

/**
 * Average of each day's QA score in the selected range (skips off days / empty days).
 * Day score is already the mean of that day's audits when multiple exist.
 */
export function averageInRange(
  agentId: string,
  range: DateRange,
): number | null {
  if (!range.start || !range.end) return null;
  const start = startOfDay(range.start).getTime();
  const end = startOfDay(range.end).getTime();
  const values: number[] = [];

  for (let t = start; t <= end; t += 86_400_000) {
    const day = new Date(t);
    const iso = isoDate(day.getFullYear(), day.getMonth(), day.getDate());
    if (isDayOff(agentId, iso)) continue;
    const score = scoreForDay(agentId, iso);
    if (score !== null) values.push(score);
  }

  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Live grid cells keyed by day-of-month — average only days inside `range`. */
export function averageFromLiveDays(
  days: Record<string, { score?: number | null; off?: boolean }> | undefined,
  range: DateRange,
  year: number,
  monthIndex: number,
): number | null {
  if (!days || !range.start || !range.end) return null;
  const values: number[] = [];
  const dayCount = daysInMonth(year, monthIndex);
  for (let day = 1; day <= dayCount; day += 1) {
    const iso = isoDate(year, monthIndex, day);
    if (!isoInDateRange(iso, range)) continue;
    const cell = days[String(day)];
    if (!cell || cell.off) continue;
    if (typeof cell.score === "number" && Number.isFinite(cell.score)) {
      values.push(cell.score);
    }
  }
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function formatAvgLabel(avg: number | null): string {
  return avg === null ? "-" : `${avg}%`;
}

export type PendingReevalRow = {
  agentId: string;
  name: string;
  /** ISO dates (YYYY-MM-DD) that still need re-evaluation */
  days: string[];
};

/**
 * Audits in range for the given agents that are not marked re-evaluated,
 * grouped by agent with unique days.
 */
export function findPendingReevaluations(
  agentIds: string[],
  range: DateRange,
  agents: Array<{ id: string; name: string }>,
  audits: Array<{ agentId: string; date: string; reevaluated?: boolean }>,
): PendingReevalRow[] {
  if (!range.start || !range.end || agentIds.length === 0) return [];
  const idSet = new Set(agentIds);
  const nameById = new Map(agents.map((agent) => [agent.id, agent.name]));
  const daysByAgent = new Map<string, Set<string>>();

  for (const audit of audits) {
    if (!idSet.has(audit.agentId)) continue;
    if (!audit.date || !isoInDateRange(audit.date, range)) continue;
    if (audit.reevaluated) continue;
    let days = daysByAgent.get(audit.agentId);
    if (!days) {
      days = new Set();
      daysByAgent.set(audit.agentId, days);
    }
    days.add(audit.date);
  }

  return agentIds
    .filter((id) => daysByAgent.has(id))
    .map((id) => ({
      agentId: id,
      name: nameById.get(id) || id,
      days: Array.from(daysByAgent.get(id)!).sort(),
    }));
}

export function pendingReevalDaySet(pending: PendingReevalRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of pending) {
    for (const day of row.days) {
      keys.add(`${row.agentId}:${day}`);
    }
  }
  return keys;
}

export type AvgEmailAgent = ProgressAgent & {
  days?: Record<string, { score?: number | null; off?: boolean }>;
};

export type AvgEmailPayload = {
  period: "date-range";
  range: { start: string; end: string };
  recipients: Array<{
    agentId: string;
    name: string;
    alias: string;
    team: AuditTeam;
    /** Always a number for Power Automate schemas (0 when no score). */
    avgQa: number;
    hasAvg: boolean;
    /** Inclusive calendar dates for the email period. */
    rangeStart: string;
    rangeEnd: string;
    /** Opens My Audits with this date range applied. */
    auditsUrl: string;
  }>;
};

/** Build payload using the page date range + mean of each day's QA score. */
export function buildAvgEmailPayload(
  agentIds: string[],
  range: DateRange,
  agentsOverride?: AvgEmailAgent[],
): AvgEmailPayload {
  if (!range.start || !range.end) {
    throw new Error("Select a date range before sending the avg QA email.");
  }
  const pool: AvgEmailAgent[] = agentsOverride?.length
    ? agentsOverride
    : listProgressAgents();
  const agents = pool.filter((agent) => agentIds.includes(agent.id));
  const { year, month } = monthFromRange(range);
  const rangeStart = toIsoDate(range.start);
  const rangeEnd = toIsoDate(range.end);
  const auditsUrl = employeeAuditsDeepLink(rangeStart, rangeEnd);
  return {
    period: "date-range",
    range: {
      start: startOfDay(range.start).toISOString(),
      end: startOfDay(range.end).toISOString(),
    },
    recipients: agents.map((agent) => {
      const avg =
        agent.days && Object.keys(agent.days).length > 0
          ? averageFromLiveDays(agent.days, range, year, month)
          : averageInRange(agent.id, range);
      return {
        agentId: agent.id,
        name: agent.name,
        alias: agent.alias,
        team: agent.team,
        avgQa: avg == null || Number.isNaN(avg) ? 0 : avg,
        hasAvg: avg != null && !Number.isNaN(avg),
        rangeStart,
        rangeEnd,
        auditsUrl,
      };
    }),
  };
}

/**
 * Queue avg QA email via Django → Power Automate webhook proxy.
 */
export async function queueAvgEmail(payload: AvgEmailPayload): Promise<void> {
  const { triggerPowerAutomate } = await import("./externalApi");
  await triggerPowerAutomate("avg-email", payload as unknown as Record<string, unknown>);
}
