import {
  earnedForResult,
  listAgents,
  listAudits,
  type AuditRecord,
  type AuditTeam,
  type EvalResult,
} from "./audits";
import { startOfDay, type DateRange } from "./dateRange";

export type HeatmapMetricId =
  | "procedure"
  | "a-form"
  | "accuracy"
  | "call-managing"
  | "creating-ref-order"
  | "ending"
  | "friendliness"
  | "greeting";

export type HeatmapMetricDef = {
  id: HeatmapMetricId;
  label: string;
  /** Match audit metric id/name (case-insensitive includes). */
  matchers: string[];
};

export const HEATMAP_METRICS: HeatmapMetricDef[] = [
  { id: "procedure", label: "Procedure", matchers: ["procedure"] },
  { id: "a-form", label: "A-form", matchers: ["a-form", "a form", "aform"] },
  { id: "accuracy", label: "Accuracy", matchers: ["accuracy", "information accuracy"] },
  {
    id: "call-managing",
    label: "Call managing",
    matchers: ["call managing", "call-managing", "call management"],
  },
  {
    id: "creating-ref-order",
    label: "Creating ref order",
    matchers: ["creating ref", "ref order", "creating-ref", "reference order"],
  },
  { id: "ending", label: "Ending", matchers: ["ending", "closing", "proper closing"] },
  { id: "friendliness", label: "Friendliness", matchers: ["friendliness", "tone"] },
  { id: "greeting", label: "Greeting", matchers: ["greeting", "opening"] },
];

export type HeatmapCell = {
  pct: number | null;
  earned: number;
  possible: number;
};

export type HeatmapRow = {
  agentId: string;
  agentName: string;
  alias: string;
  team: AuditTeam;
  avg: HeatmapCell;
  metrics: Record<HeatmapMetricId, HeatmapCell>;
};

function emptyCell(): HeatmapCell {
  return { pct: null, earned: 0, possible: 0 };
}

function parseIsoDay(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return startOfDay(new Date(y, m - 1, d));
}

function auditInRange(audit: AuditRecord, range: DateRange): boolean {
  if (!range.start || !range.end) return true;
  const day = parseIsoDay(audit.date);
  if (!day) return false;
  const t = day.getTime();
  return t >= startOfDay(range.start).getTime() && t <= startOfDay(range.end).getTime();
}

function metricMatches(def: HeatmapMetricDef, metricId: string, metricLabel: string): boolean {
  const hay = `${metricId} ${metricLabel}`.toLowerCase();
  return def.matchers.some((matcher) => hay.includes(matcher.toLowerCase()));
}

function earnedPoints(result: EvalResult, earnedRaw: string): number | null {
  if (result === "n/a") return null;
  const fromResult = Number(earnedForResult(result));
  if (!Number.isNaN(fromResult) && earnedForResult(result) !== "—") return fromResult;
  const parsed = Number(earnedRaw);
  return Number.isFinite(parsed) ? parsed : null;
}

function finalizeCell(earned: number, possible: number): HeatmapCell {
  if (possible <= 0) return emptyCell();
  return {
    earned,
    possible,
    pct: Math.round((earned / possible) * 100),
  };
}

export function formatHeatmapCell(cell: HeatmapCell): string {
  if (cell.pct === null || cell.possible <= 0) return "—";
  return `${cell.pct}% ${cell.earned}/${cell.possible}`;
}

/**
 * Color bands by magnitude:
 * red = highest, yellow = mid, blue = before least, green = least.
 */
export function heatmapTone(pct: number | null): string {
  if (pct === null) return "";
  if (pct >= 90) return " is-highest";
  if (pct >= 80) return " is-mid";
  if (pct >= 70) return " is-before-least";
  return " is-least";
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 1000;
  }
  return hash;
}

/** Deterministic mock cell so the heatmap is usable before API data exists. */
function mockCell(agentId: string, metricId: string): HeatmapCell {
  const seed = hashSeed(`${agentId}:${metricId}`);
  const possible = 8 + (seed % 13); // 8–20
  const band = seed % 4;
  let pctTarget = 62;
  if (band === 1) pctTarget = 74;
  if (band === 2) pctTarget = 85;
  if (band === 3) pctTarget = 94;
  const earned = Math.min(possible, Math.round((pctTarget / 100) * possible));
  return finalizeCell(earned, possible);
}

const MOCK_HEATMAP_AGENTS: Array<{
  id: string;
  name: string;
  alias: string;
  team: AuditTeam;
}> = [
  { id: "heat-agent-jl06", name: "Jordan Lee", alias: "JL06", team: "calls" },
  { id: "heat-agent-ms12", name: "Maya Singh", alias: "MS12", team: "calls" },
  { id: "heat-agent-tr04", name: "Tyler Reed", alias: "TR04", team: "calls" },
  { id: "heat-agent-ak19", name: "Aisha Khan", alias: "AK19", team: "tickets" },
  { id: "heat-agent-cw08", name: "Chris Wong", alias: "CW08", team: "tickets" },
  { id: "heat-agent-np21", name: "Nora Patel", alias: "NP21", team: "tickets" },
  { id: "heat-agent-dl15", name: "Diego Lopez", alias: "DL15", team: "live-chat" },
  { id: "heat-agent-eb03", name: "Emma Brooks", alias: "EB03", team: "live-chat" },
  { id: "heat-agent-rh11", name: "Ryan Hayes", alias: "RH11", team: "sales" },
  { id: "heat-agent-sc07", name: "Sofia Chen", alias: "SC07", team: "sales" },
];

export function buildHeatmapRows(
  range: DateRange,
  options?: {
    audits?: AuditRecord[];
    agents?: Array<{ id: string; name: string; alias: string; team: AuditTeam }>;
    allowMock?: boolean;
  },
): HeatmapRow[] {
  const sourceAudits = options?.audits ?? listAudits();
  const sourceAgents = options?.agents ?? listAgents();
  const allowMock = false;

  const audits = sourceAudits.filter(
    (audit) => audit.evaluate === "done" && auditInRange(audit, range),
  );

  type Acc = {
    agentId: string;
    agentName: string;
    alias: string;
    team: AuditTeam;
    metrics: Record<HeatmapMetricId, { earned: number; possible: number }>;
  };

  const byAgent = new Map<string, Acc>();

  const ensure = (audit: AuditRecord): Acc => {
    const existing = byAgent.get(audit.agentId);
    if (existing) {
      if (!existing.agentName && audit.agentName) existing.agentName = audit.agentName;
      if (!existing.alias && audit.alias) existing.alias = audit.alias;
      return existing;
    }
    const metrics = Object.fromEntries(
      HEATMAP_METRICS.map((metric) => [metric.id, { earned: 0, possible: 0 }]),
    ) as Acc["metrics"];
    const created: Acc = {
      agentId: audit.agentId,
      agentName: audit.agentName,
      alias: audit.alias,
      team: audit.team,
      metrics,
    };
    byAgent.set(audit.agentId, created);
    return created;
  };

  for (const agent of sourceAgents) {
    if (byAgent.has(agent.id)) continue;
    const metrics = Object.fromEntries(
      HEATMAP_METRICS.map((metric) => [metric.id, { earned: 0, possible: 0 }]),
    ) as Acc["metrics"];
    byAgent.set(agent.id, {
      agentId: agent.id,
      agentName: agent.name,
      alias: agent.alias,
      team: agent.team,
      metrics,
    });
  }

  for (const audit of audits) {
    if (!audit.agentId) continue;
    const row = ensure(audit);
    for (const metric of audit.metrics ?? []) {
      const points = earnedPoints(metric.result, metric.earned);
      if (points === null) continue;
      const def = HEATMAP_METRICS.find((item) =>
        metricMatches(item, metric.id, metric.metric),
      );
      if (!def) continue;
      row.metrics[def.id].earned += points;
      row.metrics[def.id].possible += 1;
    }
  }

  const useMock = allowMock && sourceAgents.length === 0 && audits.length === 0;
  if (useMock) {
    for (const agent of MOCK_HEATMAP_AGENTS) {
      if (byAgent.has(agent.id)) continue;
      const metrics = Object.fromEntries(
        HEATMAP_METRICS.map((metric) => [metric.id, { earned: 0, possible: 0 }]),
      ) as Acc["metrics"];
      byAgent.set(agent.id, {
        agentId: agent.id,
        agentName: agent.name,
        alias: agent.alias,
        team: agent.team,
        metrics,
      });
    }
  }

  return Array.from(byAgent.values())
    .map((row) => {
      const metrics = Object.fromEntries(
        HEATMAP_METRICS.map((def) => {
          const bucket = row.metrics[def.id];
          const cell = finalizeCell(bucket.earned, bucket.possible);
          return [def.id, useMock && cell.pct === null ? mockCell(row.agentId, def.id) : cell];
        }),
      ) as Record<HeatmapMetricId, HeatmapCell>;

      let earned = 0;
      let possible = 0;
      for (const cell of Object.values(metrics)) {
        earned += cell.earned;
        possible += cell.possible;
      }

      return {
        agentId: row.agentId,
        agentName: row.agentName || "—",
        alias: row.alias,
        team: row.team,
        avg: finalizeCell(earned, possible),
        metrics,
      };
    })
    .sort((a, b) => a.agentName.localeCompare(b.agentName));
}
