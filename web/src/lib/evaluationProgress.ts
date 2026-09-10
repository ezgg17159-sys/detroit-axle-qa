import type { AuditTeam } from "./audits";
import { listAudits, listAgents } from "./audits";
import { startOfDay, type DateRange } from "./dateRange";

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

export function formatAvgLabel(avg: number | null): string {
  return avg === null ? "—" : `${avg}%`;
}

export type EmailAvgPeriod = "last-2-days" | "week" | "month";

export function emailPeriodLabel(period: EmailAvgPeriod): string {
  if (period === "last-2-days") return "last 2 days";
  if (period === "week") return "last week";
  return "last month";
}

/** Averaging window for the email action presets. */
export function rangeForEmailPeriod(period: EmailAvgPeriod, today = new Date()): DateRange {
  const end = startOfDay(today);
  const start = new Date(end);
  if (period === "last-2-days") start.setDate(end.getDate() - 1);
  else if (period === "week") start.setDate(end.getDate() - 6);
  else start.setDate(end.getDate() - 29);
  return { start, end };
}

export type AvgEmailPayload = {
  period: EmailAvgPeriod;
  range: { start: string | null; end: string | null };
  recipients: Array<{
    agentId: string;
    name: string;
    alias: string;
    team: AuditTeam;
    avgQa: number | null;
  }>;
};

/** Build payload for the future Power Automate email flow. */
export function buildAvgEmailPayload(
  agentIds: string[],
  period: EmailAvgPeriod,
): AvgEmailPayload {
  const range = rangeForEmailPeriod(period);
  const agents = listProgressAgents().filter((agent) => agentIds.includes(agent.id));
  return {
    period,
    range: {
      start: range.start?.toISOString() ?? null,
      end: range.end?.toISOString() ?? null,
    },
    recipients: agents.map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      alias: agent.alias,
      team: agent.team,
      avgQa: averageInRange(agent.id, range),
    })),
  };
}

/**
 * Power Automate integration point.
 * Replace this stub with a POST to the Power Automate webhook / backend proxy.
 */
export async function queueAvgEmail(payload: AvgEmailPayload): Promise<void> {
  // TODO: POST payload to Power Automate webhook
  console.info("QA avg email payload (Power Automate pending)", payload);
}
