import ExcelJS from "exceljs";

export type ReportExportPayload = {
  connected: boolean;
  detail?: string;
  meta: {
    team: string;
    teamLabel: string;
    teamTitle: string;
    rangeLabel: string;
    period?: "months" | "weeks";
    months: Array<{ key: string; label: string }>;
    subtitle: string;
    agentFilter?: string[];
    trendLabel?: string;
  };
  summary: {
    totalAudits: number;
    avgScore: string;
    agentsEvaluated: number;
  };
  masterTrend: Array<{
    metric: string;
    values: Record<string, string>;
    trend: string;
    bestMonth: string;
    worstMonth: string;
  }>;
  masterByAgent?: Array<{
    agentId: string;
    name: string;
    alias: string;
    team?: string;
    totalAudits: number;
    avgScore: string;
    teamAvg?: string;
    vsTeam?: string;
    masterTrend: Array<{
      metric: string;
      values: Record<string, string>;
      trend: string;
      bestMonth: string;
      worstMonth: string;
    }>;
  }>;
  agents: Array<{
    name: string;
    alias: string;
    team?: string;
    overallAvg: string;
    teamAvg?: string;
    vsTeam?: string;
    monthly: Record<string, string>;
    teamWeekly?: Record<string, string>;
    trend: string;
    delta: string;
    bestMonth: string;
  }>;
  criteria: {
    avgPassRate: string;
    weakest: string;
    rows: Array<{
      criterion: string;
      type: string;
      passRate: string;
      pass: number;
      border: number;
      fail: number;
      total: number;
      monthly: Record<string, string>;
      trend: string;
      delta: string;
    }>;
    byAgent?: Array<{
      agentId: string;
      name: string;
      alias: string;
      avgPassRate: string;
      weakest: string;
      rows: Array<{
        criterion: string;
        type: string;
        passRate: string;
        pass: number;
        border: number;
        fail: number;
        total: number;
        monthly: Record<string, string>;
        trend: string;
        delta: string;
      }>;
    }>;
  };
  caseTypes: {
    count: number;
    top: string;
    rows: Array<{
      caseType: string;
      total: number;
      share: string;
      avgScore: string;
      monthlyEvals: Record<string, number>;
      monthlyScore: Record<string, string>;
      bestMonth: string;
    }>;
    byAgent?: Array<{
      agentId: string;
      name: string;
      alias: string;
      count: number;
      top: string;
      rows: Array<{
        caseType: string;
        total: number;
        share: string;
        avgScore: string;
        monthlyEvals: Record<string, number>;
        monthlyScore: Record<string, string>;
        bestMonth: string;
      }>;
    }>;
  };
  quantity: Array<{
    index: number;
    name: string;
    agentId: string;
    monthly: Record<string, number>;
    total: number;
  }>;
};

/** Colors from QA_Report_Full template */
const C = {
  navy: "1A3A5C",
  navyDeep: "1F3864",
  ink: "1A2533",
  teal: "0F7B8C",
  slate: "2C3E50",
  green: "16A085",
  greenBright: "2ECC71",
  gold: "E8A838",
  orange: "F39C12",
  red: "E74C3C",
  muted: "5C6B7A",
  zebra: "F4F6F9",
  white: "FFFFFF",
  blue: "2E75B6",
} as const;

type FillColor = (typeof C)[keyof typeof C];

function fill(argb: FillColor): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: `FF${argb}` } };
}

function font(opts: {
  size?: number;
  bold?: boolean;
  color?: FillColor;
}): Partial<ExcelJS.Font> {
  return {
    name: "Calibri",
    size: opts.size ?? 11,
    bold: Boolean(opts.bold),
    color: { argb: `FF${opts.color ?? C.ink}` },
  };
}

function align(
  horizontal: ExcelJS.Alignment["horizontal"] = "left",
  vertical: ExcelJS.Alignment["vertical"] = "middle",
): Partial<ExcelJS.Alignment> {
  return { horizontal, vertical, wrapText: false };
}

function monthLabels(payload: ReportExportPayload): string[] {
  return payload.meta.months.map((month) => month.label);
}

function parsePct(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.trim().replace(",", "").match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  if (!match) return null;
  return Number(match[1]);
}

function scoreFill(value: string | number | null | undefined): FillColor | null {
  const pct = parsePct(value);
  if (pct === null) return null;
  if (pct >= 90) return C.greenBright;
  if (pct >= 80) return C.green;
  if (pct >= 70) return C.gold;
  if (pct >= 60) return C.orange;
  return C.red;
}

function styleTitle(cell: ExcelJS.Cell) {
  cell.fill = fill(C.navy);
  cell.font = font({ size: 26, bold: true, color: C.white });
  cell.alignment = align("left");
}

function styleSubtitle(cell: ExcelJS.Cell) {
  cell.fill = fill(C.teal);
  cell.font = font({ size: 11, color: C.white });
  cell.alignment = align("left");
}

function styleSection(cell: ExcelJS.Cell) {
  cell.fill = fill(C.navy);
  cell.font = font({ size: 11, bold: true, color: C.white });
  cell.alignment = align("left");
}

function styleHeader(cell: ExcelJS.Cell, bg: FillColor = C.navy) {
  cell.fill = fill(bg);
  cell.font = font({ size: 9, bold: true, color: C.white });
  cell.alignment = align("center");
}

function styleKpiLabel(cell: ExcelJS.Cell, bg: FillColor) {
  cell.fill = fill(bg);
  cell.font = font({ size: 8, bold: true, color: C.white });
  cell.alignment = align("center");
}

function styleKpiValue(cell: ExcelJS.Cell, bg: FillColor) {
  cell.fill = fill(bg);
  cell.font = font({ size: 20, bold: true, color: C.white });
  cell.alignment = align("center");
}

function styleKpiRule(cell: ExcelJS.Cell, bg: FillColor) {
  cell.fill = fill(bg);
  cell.font = font({ size: 7, color: C.white });
  cell.alignment = align("center");
}

function styleBody(
  cell: ExcelJS.Cell,
  opts?: { zebra?: boolean; bold?: boolean; center?: boolean; color?: FillColor },
) {
  cell.fill = fill(opts?.zebra ? C.zebra : C.white);
  cell.font = font({
    size: 10,
    bold: opts?.bold,
    color: opts?.color ?? C.ink,
  });
  cell.alignment = align(opts?.center ? "center" : "left");
}

function styleScoreCell(cell: ExcelJS.Cell, value: string | number, zebra = false) {
  const tone = scoreFill(value);
  if (tone) {
    cell.fill = fill(tone);
    cell.font = font({ size: 10, bold: true, color: C.white });
  } else {
    styleBody(cell, { zebra, center: true });
  }
  cell.alignment = align("center");
  cell.value = value;
}

function styleTrendCell(cell: ExcelJS.Cell, trend: string, zebra = false) {
  const color =
    trend.includes("↑") ? C.greenBright : trend.includes("↓") ? C.red : C.orange;
  cell.fill = fill(zebra ? C.zebra : C.white);
  cell.font = font({ size: 14, bold: true, color });
  cell.alignment = align("center");
  cell.value = trend;
}

function merge(ws: ExcelJS.Worksheet, range: string) {
  ws.mergeCells(range);
}

function setRowHeight(ws: ExcelJS.Worksheet, row: number, height: number) {
  ws.getRow(row).height = height;
}

function applyCols(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });
}

function paintMerged(
  ws: ExcelJS.Worksheet,
  startCol: number,
  endCol: number,
  row: number,
  painter: (cell: ExcelJS.Cell) => void,
) {
  for (let col = startCol; col <= endCol; col += 1) {
    painter(ws.getCell(row, col));
  }
}

function periodMode(payload: ReportExportPayload): "months" | "weeks" {
  return payload.meta.period === "months" ? "months" : "weeks";
}

function isWeekly(payload: ReportExportPayload): boolean {
  return periodMode(payload) === "weeks";
}

function buildMonthlyTrend(wb: ExcelJS.Workbook, payload: ReportExportPayload) {
  const team = payload.meta.teamLabel;
  const weekly = isWeekly(payload);
  const sheetName = weekly
    ? `Weekly Trend — ${team}`.slice(0, 31)
    : `Monthly Trend — ${team}`.slice(0, 31);
  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: false }],
  });
  const periods = monthLabels(payload);
  const last = periods[periods.length - 1] || "";
  const lastCol = weekly ? 4 + periods.length + 3 : 2 + periods.length + 3;

  applyCols(
    ws,
    weekly
      ? [28, 11, 11, 10, ...periods.map(() => 11), 10, 11, 12]
      : [28, 12, ...periods.map(() => 11), 10, 11, 12],
  );

  merge(ws, `A1:${col(lastCol)}1`);
  ws.getCell("A1").value = weekly
    ? ` ${payload.meta.teamTitle} — WEEKLY PERFORMANCE TREND (1-7 / 8-14 / 15-21 / 22-28 / 29-31)  |  ${payload.meta.rangeLabel}`
    : ` ${payload.meta.teamTitle} — MONTHLY PERFORMANCE TREND  |  ${payload.meta.rangeLabel}`;
  paintMerged(ws, 1, lastCol, 1, styleTitle);
  setRowHeight(ws, 1, 30);

  const kpis: Array<{ label: string; value: string | number; bg: FillColor }> = [
    { label: `TOTAL ${payload.meta.teamTitle}`, value: payload.summary.totalAudits, bg: C.teal },
    { label: "AGENTS", value: payload.summary.agentsEvaluated, bg: C.slate },
    { label: `AVG SCORE (${last})`, value: payload.summary.avgScore, bg: C.green },
  ];
  kpis.forEach((kpi, index) => {
    if (index === 0) {
      merge(ws, "A4:B4");
      merge(ws, "A5:B5");
      merge(ws, "A6:B6");
      paintMerged(ws, 1, 2, 4, (cell) => styleKpiLabel(cell, kpi.bg));
      paintMerged(ws, 1, 2, 5, (cell) => styleKpiValue(cell, kpi.bg));
      paintMerged(ws, 1, 2, 6, (cell) => styleKpiRule(cell, kpi.bg));
      ws.getCell(4, 1).value = kpi.label;
      ws.getCell(5, 1).value = kpi.value;
      ws.getCell(6, 1).value = "━━━━";
    } else {
      const c = index === 1 ? 3 : 4;
      styleKpiLabel(ws.getCell(4, c), kpi.bg);
      styleKpiValue(ws.getCell(5, c), kpi.bg);
      styleKpiRule(ws.getCell(6, c), kpi.bg);
      ws.getCell(4, c).value = kpi.label;
      ws.getCell(5, c).value = kpi.value;
      ws.getCell(6, c).value = "━━━━";
    }
  });
  setRowHeight(ws, 5, 32);
  setRowHeight(ws, 6, 10);

  const periodStartCol = weekly ? 5 : 3;
  periods.forEach((label, index) => {
    const cell = ws.getCell(8, periodStartCol + index);
    cell.value = label;
    styleHeader(cell, C.gold);
  });

  const headers = weekly
    ? [
        "AGENT NAME",
        "AGENT AVG",
        "TEAM AVG",
        "VS TEAM",
        ...periods,
        "TREND",
        "Δ CHANGE",
        "BEST WEEK",
      ]
    : ["AGENT NAME", "OVERALL AVG", ...periods, "TREND", "Δ CHANGE", "BEST MONTH"];
  headers.forEach((label, index) => {
    const cell = ws.getCell(9, index + 1);
    cell.value = label;
    styleHeader(cell, index === 0 ? C.navy : C.navyDeep);
  });

  payload.agents.forEach((agent, rowIndex) => {
    const r = 10 + rowIndex;
    const zebra = rowIndex % 2 === 1;
    styleBody(ws.getCell(r, 1), { zebra, bold: true });
    ws.getCell(r, 1).value = agent.name;
    if (weekly) {
      styleScoreCell(ws.getCell(r, 2), agent.overallAvg, zebra);
      styleScoreCell(ws.getCell(r, 3), agent.teamAvg ?? "-", zebra);
      styleBody(ws.getCell(r, 4), { zebra, center: true, bold: true });
      ws.getCell(r, 4).value = agent.vsTeam ?? "-";
      periods.forEach((label, index) => {
        styleScoreCell(ws.getCell(r, 5 + index), agent.monthly[label] ?? "-", zebra);
      });
      styleTrendCell(ws.getCell(r, 5 + periods.length), agent.trend, zebra);
      styleBody(ws.getCell(r, 6 + periods.length), { zebra, center: true, bold: true });
      ws.getCell(r, 6 + periods.length).value = agent.delta;
      styleBody(ws.getCell(r, 7 + periods.length), { zebra, center: true });
      ws.getCell(r, 7 + periods.length).value = agent.bestMonth;
    } else {
      styleScoreCell(ws.getCell(r, 2), agent.overallAvg, zebra);
      periods.forEach((label, index) => {
        styleScoreCell(ws.getCell(r, 3 + index), agent.monthly[label] ?? "-", zebra);
      });
      styleTrendCell(ws.getCell(r, 3 + periods.length), agent.trend, zebra);
      styleBody(ws.getCell(r, 4 + periods.length), { zebra, center: true, bold: true });
      ws.getCell(r, 4 + periods.length).value = agent.delta;
      styleBody(ws.getCell(r, 5 + periods.length), { zebra, center: true });
      ws.getCell(r, 5 + periods.length).value = agent.bestMonth;
    }
  });
}

function buildCriterionBreakdown(wb: ExcelJS.Workbook, payload: ReportExportPayload) {
  const ws = wb.addWorksheet("Criterion Breakdown", {
    views: [{ showGridLines: false }],
  });
  const months = monthLabels(payload);
  const team = payload.meta.teamTitle;
  const first = months[0] || "";
  const last = months[months.length - 1] || "";
  const lastCol = 7 + months.length + 2;
  const byAgent = payload.criteria.byAgent ?? [];

  applyCols(ws, [22, 12, 11, 9, 10, 9, 9, ...months.map(() => 10), 10, 12]);

  merge(ws, `A1:${col(lastCol)}1`);
  ws.getCell("A1").value = ` CRITERION BREAKDOWN  —  ${team}`;
  paintMerged(ws, 1, lastCol, 1, styleTitle);
  setRowHeight(ws, 1, 30);

  const headers = [
    "CRITERION",
    "TYPE",
    "PASS RATE",
    "# PASS",
    "# BORDER",
    "# FAIL",
    "TOTAL",
    ...months,
    "TREND",
    `Δ ${first}→${last}`,
  ];
  // months = week labels (1-7 / 8-14 / …)

  const writeCriteriaRows = (
    startRow: number,
    rows: ReportExportPayload["criteria"]["rows"],
  ) => {
    rows.forEach((row, rowIndex) => {
      const r = startRow + rowIndex;
      const zebra = rowIndex % 2 === 1;
      const values: Array<string | number> = [
        row.criterion,
        row.type,
        row.passRate,
        row.pass,
        row.border,
        row.fail,
        row.total,
        ...months.map((label) => row.monthly[label] ?? "-"),
        row.trend,
        row.delta,
      ];
      values.forEach((value, index) => {
        const cell = ws.getCell(r, index + 1);
        if (index === 0) {
          styleBody(cell, { zebra, bold: true });
          cell.value = value;
        } else if (index === 2 || (index >= 7 && index < 7 + months.length)) {
          styleScoreCell(cell, value, zebra);
        } else if (index === 7 + months.length) {
          styleTrendCell(cell, String(value), zebra);
        } else {
          styleBody(cell, { zebra, center: index !== 1 });
          cell.value = value;
        }
      });
    });
    return startRow + rows.length;
  };

  if (byAgent.length > 0) {
    merge(ws, `A2:${col(lastCol)}2`);
    ws.getCell("A2").value =
      `Per-agent criterion pass rates  |  ${payload.meta.rangeLabel}  |  ${byAgent.length} agent${byAgent.length === 1 ? "" : "s"}`;
    paintMerged(ws, 1, lastCol, 2, styleSubtitle);

    let rowCursor = 4;
    byAgent.forEach((agent) => {
      const agentLabel = agent.alias
        ? `${agent.name} (${agent.alias})`
        : agent.name;

      merge(ws, `A${rowCursor}:${col(lastCol)}${rowCursor}`);
      ws.getCell(rowCursor, 1).value = `  ${agentLabel}`;
      paintMerged(ws, 1, lastCol, rowCursor, styleSection);
      rowCursor += 1;

      merge(ws, `A${rowCursor}:C${rowCursor}`);
      merge(ws, `A${rowCursor + 1}:C${rowCursor + 1}`);
      merge(ws, `A${rowCursor + 2}:C${rowCursor + 2}`);
      merge(ws, `D${rowCursor}:F${rowCursor}`);
      merge(ws, `D${rowCursor + 1}:F${rowCursor + 1}`);
      merge(ws, `D${rowCursor + 2}:F${rowCursor + 2}`);
      paintMerged(ws, 1, 3, rowCursor, (cell) => styleKpiLabel(cell, C.teal));
      paintMerged(ws, 1, 3, rowCursor + 1, (cell) => styleKpiValue(cell, C.teal));
      paintMerged(ws, 1, 3, rowCursor + 2, (cell) => styleKpiRule(cell, C.teal));
      paintMerged(ws, 4, 6, rowCursor, (cell) => styleKpiLabel(cell, C.red));
      paintMerged(ws, 4, 6, rowCursor + 1, (cell) => {
        cell.fill = fill(C.red);
        cell.font = font({ size: 16, bold: true, color: C.white });
        cell.alignment = align("center");
      });
      paintMerged(ws, 4, 6, rowCursor + 2, (cell) => styleKpiRule(cell, C.red));
      ws.getCell(rowCursor, 1).value = "AVG PASS RATE";
      ws.getCell(rowCursor + 1, 1).value = agent.avgPassRate;
      ws.getCell(rowCursor + 2, 1).value = "━━━━";
      ws.getCell(rowCursor, 4).value = "WEAKEST CRITERION";
      ws.getCell(rowCursor + 1, 4).value = agent.weakest;
      ws.getCell(rowCursor + 2, 4).value = "━━━━";
      setRowHeight(ws, rowCursor + 1, 28);
      rowCursor += 4;

      headers.forEach((label, index) => {
        const cell = ws.getCell(rowCursor, index + 1);
        cell.value = label;
        styleHeader(cell);
      });
      rowCursor += 1;
      rowCursor = writeCriteriaRows(rowCursor, agent.rows);
      rowCursor += 2;
    });
    return;
  }

  merge(ws, "A4:C4");
  merge(ws, "A5:C5");
  merge(ws, "A6:C6");
  merge(ws, "D4:F4");
  merge(ws, "D5:F5");
  merge(ws, "D6:F6");
  paintMerged(ws, 1, 3, 4, (cell) => styleKpiLabel(cell, C.teal));
  paintMerged(ws, 1, 3, 5, (cell) => styleKpiValue(cell, C.teal));
  paintMerged(ws, 1, 3, 6, (cell) => styleKpiRule(cell, C.teal));
  paintMerged(ws, 4, 6, 4, (cell) => styleKpiLabel(cell, C.red));
  paintMerged(ws, 4, 6, 5, (cell) => {
    cell.fill = fill(C.red);
    cell.font = font({ size: 16, bold: true, color: C.white });
    cell.alignment = align("center");
  });
  paintMerged(ws, 4, 6, 6, (cell) => styleKpiRule(cell, C.red));
  ws.getCell("A4").value = `${team} AVG PASS RATE`;
  ws.getCell("A5").value = payload.criteria.avgPassRate;
  ws.getCell("A6").value = "━━━━";
  ws.getCell("D4").value = `${team} WEAKEST CRITERION`;
  ws.getCell("D5").value = payload.criteria.weakest;
  ws.getCell("D6").value = "━━━━";
  setRowHeight(ws, 5, 32);

  merge(ws, `A8:${col(lastCol)}8`);
  ws.getCell("A8").value = `   ${team} — CRITERION PASS RATE `;
  paintMerged(ws, 1, lastCol, 8, styleSection);

  headers.forEach((label, index) => {
    const cell = ws.getCell(9, index + 1);
    cell.value = label;
    styleHeader(cell);
  });

  writeCriteriaRows(10, payload.criteria.rows);
}

function buildCaseTypeAnalysis(wb: ExcelJS.Workbook, payload: ReportExportPayload) {
  const ws = wb.addWorksheet("Case Type Analysis", {
    views: [{ showGridLines: false }],
  });
  const months = monthLabels(payload);
  const title = payload.meta.teamTitle;
  const lastCol = 4 + months.length * 2 + 1;
  const byAgent = payload.caseTypes.byAgent ?? [];

  applyCols(ws, [28, 10, 10, 12, ...months.flatMap(() => [10, 11]), 12]);

  merge(ws, `A1:${col(lastCol)}1`);
  ws.getCell("A1").value = `CASE TYPE ANALYSIS  —  ${title}`;
  paintMerged(ws, 1, lastCol, 1, styleTitle);
  setRowHeight(ws, 1, 30);

  const writeCaseRows = (
    startRow: number,
    rows: ReportExportPayload["caseTypes"]["rows"],
  ) => {
    rows.forEach((row, rowIndex) => {
      const r = startRow + rowIndex;
      const zebra = rowIndex % 2 === 1;
      styleBody(ws.getCell(r, 1), { zebra, bold: true });
      ws.getCell(r, 1).value = row.caseType;
      styleBody(ws.getCell(r, 2), { zebra, center: true });
      ws.getCell(r, 2).value = row.total;
      styleBody(ws.getCell(r, 3), { zebra, center: true });
      ws.getCell(r, 3).value = row.share;
      styleScoreCell(ws.getCell(r, 4), row.avgScore, zebra);
      months.forEach((label, index) => {
        const evalsCell = ws.getCell(r, 5 + index * 2);
        const scoreCell = ws.getCell(r, 6 + index * 2);
        styleBody(evalsCell, { zebra, center: true });
        evalsCell.value = row.monthlyEvals[label] ?? 0;
        styleScoreCell(scoreCell, row.monthlyScore[label] ?? "-", zebra);
      });
      styleBody(ws.getCell(r, lastCol), { zebra, center: true });
      ws.getCell(r, lastCol).value = row.bestMonth;
    });
    return startRow + rows.length;
  };

  const writeCaseHeaders = (headerRow: number) => {
    months.forEach((label, index) => {
      const start = 5 + index * 2;
      merge(ws, `${col(start)}${headerRow}:${col(start + 1)}${headerRow}`);
      paintMerged(ws, start, start + 1, headerRow, (cell) => styleHeader(cell, C.gold));
      ws.getCell(headerRow, start).value = label;
    });

    const headers = [
      "QUESTION / CASE TYPE",
      "TOTAL",
      "SHARE",
      "AVG SCORE",
      ...months.flatMap((label) => [`# Evals (${label})`, `Avg Score (${label})`]),
      "BEST WEEK",
    ];
    if (!isWeekly(payload)) {
      headers[headers.length - 1] = "BEST MONTH";
    }
    headers.forEach((label, index) => {
      const cell = ws.getCell(headerRow + 1, index + 1);
      cell.value = label;
      styleHeader(cell);
    });
  };

  if (byAgent.length > 0) {
    merge(ws, `A2:${col(lastCol)}2`);
    ws.getCell("A2").value =
      `Per-agent case type volume & score  |  ${payload.meta.rangeLabel}  |  ${byAgent.length} agent${byAgent.length === 1 ? "" : "s"}`;
    paintMerged(ws, 1, lastCol, 2, styleSubtitle);

    let rowCursor = 4;
    byAgent.forEach((agent) => {
      const agentLabel = agent.alias
        ? `${agent.name} (${agent.alias})`
        : agent.name;

      merge(ws, `A${rowCursor}:${col(lastCol)}${rowCursor}`);
      ws.getCell(rowCursor, 1).value = `  ${agentLabel}`;
      paintMerged(ws, 1, lastCol, rowCursor, styleSection);
      rowCursor += 1;

      merge(ws, `A${rowCursor}:C${rowCursor}`);
      merge(ws, `A${rowCursor + 1}:C${rowCursor + 1}`);
      merge(ws, `A${rowCursor + 2}:C${rowCursor + 2}`);
      merge(ws, `D${rowCursor}:F${rowCursor}`);
      merge(ws, `D${rowCursor + 1}:F${rowCursor + 1}`);
      merge(ws, `D${rowCursor + 2}:F${rowCursor + 2}`);
      paintMerged(ws, 1, 3, rowCursor, (cell) => styleKpiLabel(cell, C.teal));
      paintMerged(ws, 1, 3, rowCursor + 1, (cell) => styleKpiValue(cell, C.teal));
      paintMerged(ws, 1, 3, rowCursor + 2, (cell) => styleKpiRule(cell, C.teal));
      paintMerged(ws, 4, 6, rowCursor, (cell) => styleKpiLabel(cell, C.slate));
      paintMerged(ws, 4, 6, rowCursor + 1, (cell) => {
        cell.fill = fill(C.slate);
        cell.font = font({ size: 16, bold: true, color: C.white });
        cell.alignment = align("center");
      });
      paintMerged(ws, 4, 6, rowCursor + 2, (cell) => styleKpiRule(cell, C.slate));
      ws.getCell(rowCursor, 1).value = "CASE TYPES";
      ws.getCell(rowCursor + 1, 1).value = `${agent.count} types`;
      ws.getCell(rowCursor + 2, 1).value = "━━━━";
      ws.getCell(rowCursor, 4).value = "TOP CASE";
      ws.getCell(rowCursor + 1, 4).value = agent.top;
      ws.getCell(rowCursor + 2, 4).value = "━━━━";
      setRowHeight(ws, rowCursor + 1, 28);
      rowCursor += 4;

      writeCaseHeaders(rowCursor);
      rowCursor += 2;
      rowCursor = writeCaseRows(rowCursor, agent.rows);
      rowCursor += 2;
    });
    return;
  }

  merge(ws, `A2:${col(lastCol)}2`);
  ws.getCell("A2").value = isWeekly(payload)
    ? `Volume & average QA score by case type  |  Weekly breakdown 1-7 / 8-14 / … (${payload.meta.rangeLabel})`
    : `Volume & average QA score by case type  |  Monthly breakdown (${payload.meta.rangeLabel})`;
  paintMerged(ws, 1, lastCol, 2, styleSubtitle);

  merge(ws, "A4:C4");
  merge(ws, "A5:C5");
  merge(ws, "A6:C6");
  merge(ws, "D4:F4");
  merge(ws, "D5:F5");
  merge(ws, "D6:F6");
  paintMerged(ws, 1, 3, 4, (cell) => styleKpiLabel(cell, C.teal));
  paintMerged(ws, 1, 3, 5, (cell) => styleKpiValue(cell, C.teal));
  paintMerged(ws, 1, 3, 6, (cell) => styleKpiRule(cell, C.teal));
  paintMerged(ws, 4, 6, 4, (cell) => styleKpiLabel(cell, C.slate));
  paintMerged(ws, 4, 6, 5, (cell) => {
    cell.fill = fill(C.slate);
    cell.font = font({ size: 16, bold: true, color: C.white });
    cell.alignment = align("center");
  });
  paintMerged(ws, 4, 6, 6, (cell) => styleKpiRule(cell, C.slate));
  ws.getCell("A4").value = `${title} CASE TYPES`;
  ws.getCell("A5").value = `${payload.caseTypes.count} types`;
  ws.getCell("A6").value = "━━━━";
  ws.getCell("D4").value = `TOP ${title} CASE`;
  ws.getCell("D5").value = payload.caseTypes.top;
  ws.getCell("D6").value = "━━━━";
  setRowHeight(ws, 5, 32);

  merge(ws, `A8:${col(lastCol)}8`);
  ws.getCell("A8").value = isWeekly(payload)
    ? `  ${title} — TOP CASE TYPES  (All-Time + Weekly Volume & Score)`
    : `  ${title} — TOP CASE TYPES  (All-Time + Monthly Volume & Score)`;
  paintMerged(ws, 1, lastCol, 8, styleSection);

  writeCaseHeaders(9);
  writeCaseRows(11, payload.caseTypes.rows);
}

function buildQuantity(wb: ExcelJS.Workbook, payload: ReportExportPayload) {
  const team = payload.meta.teamLabel;
  const ws = wb.addWorksheet(`${team} Quantity`.slice(0, 31), {
    views: [{ showGridLines: false }],
  });
  const months = monthLabels(payload);
  const lastCol = 3 + months.length + 1;

  applyCols(ws, [6, 28, 14, ...months.map(() => 14), 10]);

  merge(ws, `A1:${col(lastCol)}1`);
  ws.getCell("A1").value = isWeekly(payload)
    ? `${payload.meta.teamTitle} QUANTITY – WEEKLY TRACKER (1-7 / 8-14 / …)`
    : `${payload.meta.teamTitle} QUANTITY – MONTHLY TRACKER`;
  paintMerged(ws, 1, lastCol, 1, styleTitle);
  setRowHeight(ws, 1, 30);

  const headers = ["#", "Agent Name", "Agent ID", ...months, "Total"];
  headers.forEach((label, index) => {
    const cell = ws.getCell(3, index + 1);
    cell.value = label;
    styleHeader(cell, index >= 3 && index < 3 + months.length ? C.gold : C.navy);
  });

  payload.quantity.forEach((row, rowIndex) => {
    const r = 4 + rowIndex;
    const zebra = rowIndex % 2 === 1;
    styleBody(ws.getCell(r, 1), { zebra, center: true });
    ws.getCell(r, 1).value = row.index;
    styleBody(ws.getCell(r, 2), { zebra, bold: true });
    ws.getCell(r, 2).value = row.name;
    styleBody(ws.getCell(r, 3), { zebra, center: true, color: C.muted });
    ws.getCell(r, 3).value = row.agentId;
    months.forEach((label, index) => {
      const cell = ws.getCell(r, 4 + index);
      styleBody(cell, { zebra, center: true });
      cell.value = row.monthly[label] ?? 0;
    });
    styleBody(ws.getCell(r, lastCol), { zebra, center: true, bold: true, color: C.navy });
    ws.getCell(r, lastCol).value = row.total;
  });
}

function col(index: number): string {
  let n = index;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function scoreSeriesFromTrend(
  lines: ReportExportPayload["masterTrend"],
  months: string[],
): { labels: string[]; values: number[] } {
  const scoreLine =
    lines.find((line) => String(line.metric).toLowerCase().includes("score")) ?? lines[0];
  if (!scoreLine) return { labels: [], values: [] };
  const labels: string[] = [];
  const values: number[] = [];
  months.forEach((month) => {
    const pct = parsePct(scoreLine.values[month]);
    if (pct === null) return;
    labels.push(month);
    values.push(pct);
  });
  return { labels, values };
}

async function renderTrendChartPng(
  labels: string[],
  values: number[],
  title: string,
): Promise<string | null> {
  if (values.length < 1 || typeof document === "undefined") return null;

  const width = 920;
  const height = 300;
  const pad = { top: 44, right: 28, bottom: 40, left: 48 };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const series = values.length === 1 ? [values[0], values[0]] : values;
  const labelSeries = labels.length === 1 ? [labels[0], labels[0]] : labels;
  const step = series.length > 1 ? plotW / (series.length - 1) : 0;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = `#${C.navy}`;
  ctx.font = "600 15px Calibri, Segoe UI, sans-serif";
  ctx.fillText(title, pad.left, 26);

  for (const guide of [0.25, 0.5, 0.75, 1]) {
    const y = pad.top + plotH * (1 - guide);
    ctx.strokeStyle = "rgba(92, 107, 122, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(92, 107, 122, 0.45)";
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + plotH);
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.stroke();

  const coords = series.map((value, index) => ({
    x: pad.left + index * step,
    y: pad.top + plotH * (1 - Math.min(100, Math.max(0, value)) / 100),
  }));

  ctx.strokeStyle = `#${C.teal}`;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  coords.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  const end = coords[coords.length - 1];
  if (end) {
    ctx.fillStyle = `#${C.teal}`;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = `#${C.muted}`;
  ctx.font = "500 11px Calibri, Segoe UI, sans-serif";
  const labelStep = Math.max(1, Math.ceil(labelSeries.length / 8));
  labelSeries.forEach((label, index) => {
    if (index % labelStep !== 0 && index !== labelSeries.length - 1) return;
    const x = pad.left + index * step;
    ctx.textAlign =
      index === 0 ? "left" : index === labelSeries.length - 1 ? "right" : "center";
    ctx.fillText(label, x, height - 14);
  });

  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

async function embedTrendChart(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  options: {
    row: number;
    labels: string[];
    values: number[];
    title: string;
  },
) {
  const { row, labels, values, title } = options;
  const png = await renderTrendChartPng(labels, values, title);
  if (!png) return row;
  const imageId = wb.addImage({ base64: png, extension: "png" });
  ws.addImage(imageId, {
    tl: { col: 0, row: row - 1 },
    ext: { width: 720, height: 240 },
  });
  for (let i = 0; i < 13; i += 1) {
    setRowHeight(ws, row + i, 18);
  }
  return row + 14;
}

async function buildMasterDashboard(wb: ExcelJS.Workbook, payload: ReportExportPayload) {
  const ws = wb.addWorksheet("Master Dashboard", {
    views: [{ showGridLines: false }],
  });
  const months = monthLabels(payload);
  const weekly = isWeekly(payload);
  const titleTeam = payload.meta.teamTitle;
  const lastCol = Math.max(weekly ? 8 : 5, 1 + months.length + 3);
  const byAgent = payload.masterByAgent ?? [];
  const bestLabel = weekly ? "Best Week" : "Best Month";
  const worstLabel = weekly ? "Worst Week" : "Worst Month";
  const trendTitle = weekly
    ? `WEEKLY PERFORMANCE TREND (1-7 / 8-14 / …) — ${payload.meta.rangeLabel}`
    : `MONTHLY PERFORMANCE TREND — ${payload.meta.rangeLabel}`;

  applyCols(ws, [28, ...Array(Math.max(months.length, 2)).fill(13), 12, 12, 12]);

  merge(ws, `A1:${col(lastCol)}1`);
  ws.getCell("A1").value = "QA PERFORMANCE REPORT";
  paintMerged(ws, 1, lastCol, 1, styleTitle);
  setRowHeight(ws, 1, 38);

  merge(ws, `A2:${col(lastCol)}2`);
  ws.getCell("A2").value = payload.meta.subtitle;
  paintMerged(ws, 1, lastCol, 2, styleSubtitle);
  setRowHeight(ws, 2, 18);

  const writeTrendBlock = (
    startRow: number,
    lines: ReportExportPayload["masterTrend"],
  ) => {
    const headers = ["Metric", ...months, "Trend ↑↓", bestLabel, worstLabel];
    headers.forEach((label, index) => {
      const cell = ws.getCell(startRow, index + 1);
      cell.value = label;
      styleHeader(
        cell,
        index === 0
          ? C.navy
          : index <= months.length
            ? C.gold
            : index === months.length + 1
              ? C.greenBright
              : C.red,
      );
    });
    setRowHeight(ws, startRow, 22);

    lines.forEach((line, rowIndex) => {
      const r = startRow + 1 + rowIndex;
      const zebra = rowIndex % 2 === 1;
      const values = [
        line.metric,
        ...months.map((label) => line.values[label] ?? "-"),
        line.trend,
        line.bestMonth,
        line.worstMonth,
      ];
      values.forEach((value, index) => {
        const cell = ws.getCell(r, index + 1);
        if (index === 0) {
          styleBody(cell, { zebra, bold: true, color: C.navy });
          cell.value = value;
        } else if (index >= 1 && index <= months.length) {
          if (String(line.metric).toLowerCase().includes("score")) {
            styleScoreCell(cell, value, zebra);
          } else {
            styleBody(cell, { zebra, center: true });
            cell.value = value;
          }
        } else if (index === months.length + 1) {
          styleTrendCell(cell, String(value), zebra);
        } else {
          styleBody(cell, { zebra, center: true, bold: true });
          cell.value = value;
        }
      });
    });
    return startRow + 1 + lines.length;
  };

  if (byAgent.length > 0) {
    let rowCursor = 4;
    for (const agent of byAgent) {
      const agentLabel = agent.alias
        ? `${agent.name} (${agent.alias})`
        : agent.name;

      merge(ws, `A${rowCursor}:${col(lastCol)}${rowCursor}`);
      ws.getCell(rowCursor, 1).value = `  ${agentLabel}`;
      paintMerged(ws, 1, lastCol, rowCursor, styleSection);
      rowCursor += 1;

      const kpiDefs: Array<{ label: string; value: string | number; bg: FillColor }> = weekly
        ? [
            { label: "TOTAL AUDITS", value: agent.totalAudits, bg: C.teal },
            { label: "AGENT AVG", value: agent.avgScore, bg: C.slate },
            { label: "TEAM AVG", value: agent.teamAvg ?? "-", bg: C.green },
            { label: "VS TEAM", value: agent.vsTeam ?? "-", bg: C.gold },
          ]
        : [
            { label: "TOTAL AUDITS", value: agent.totalAudits, bg: C.teal },
            { label: "AVG SCORE", value: agent.avgScore, bg: C.slate },
          ];
      kpiDefs.forEach((kpi, index) => {
        const start = 1 + index * 2;
        const end = start + 1;
        merge(ws, `${col(start)}${rowCursor}:${col(end)}${rowCursor}`);
        merge(ws, `${col(start)}${rowCursor + 1}:${col(end)}${rowCursor + 1}`);
        merge(ws, `${col(start)}${rowCursor + 2}:${col(end)}${rowCursor + 2}`);
        paintMerged(ws, start, end, rowCursor, (cell) => styleKpiLabel(cell, kpi.bg));
        paintMerged(ws, start, end, rowCursor + 1, (cell) => styleKpiValue(cell, kpi.bg));
        paintMerged(ws, start, end, rowCursor + 2, (cell) => styleKpiRule(cell, kpi.bg));
        ws.getCell(rowCursor, start).value = kpi.label;
        ws.getCell(rowCursor + 1, start).value = kpi.value;
        ws.getCell(rowCursor + 2, start).value = "━━━━";
      });
      setRowHeight(ws, rowCursor + 1, 28);
      rowCursor += 4;

      merge(ws, `A${rowCursor}:${col(lastCol)}${rowCursor}`);
      ws.getCell(rowCursor, 1).value = `   ${trendTitle}`;
      paintMerged(ws, 1, lastCol, rowCursor, styleSection);
      setRowHeight(ws, rowCursor, 20);
      rowCursor += 1;

      const trendLines = weekly
        ? agent.masterTrend
        : agent.masterTrend.filter(
            (line) => !String(line.metric).toLowerCase().includes("team avg"),
          );
      rowCursor = writeTrendBlock(rowCursor, trendLines);
      rowCursor += 1;

      const series = scoreSeriesFromTrend(trendLines, months);
      if (series.values.length > 0) {
        rowCursor = await embedTrendChart(wb, ws, {
          row: rowCursor,
          labels: series.labels,
          values: series.values,
          title: `${agentLabel} — Avg Score Trend`,
        });
      }
      rowCursor += 1;
    }
    return;
  }

  const kpiDefs: Array<{ label: string; value: string | number; bg: FillColor }> = [
    { label: `TOTAL ${titleTeam}`, value: payload.summary.totalAudits, bg: C.teal },
    { label: `AVG ${titleTeam} SCORE`, value: payload.summary.avgScore, bg: C.slate },
    { label: "AGENTS EVALUATED", value: payload.summary.agentsEvaluated, bg: C.green },
  ];

  kpiDefs.forEach((kpi, index) => {
    const start = 1 + index * 2;
    const end = start + 1;
    merge(ws, `${col(start)}4:${col(end)}4`);
    merge(ws, `${col(start)}5:${col(end)}5`);
    merge(ws, `${col(start)}6:${col(end)}6`);
    paintMerged(ws, start, end, 4, (cell) => styleKpiLabel(cell, kpi.bg));
    paintMerged(ws, start, end, 5, (cell) => styleKpiValue(cell, kpi.bg));
    paintMerged(ws, start, end, 6, (cell) => styleKpiRule(cell, kpi.bg));
    ws.getCell(4, start).value = kpi.label;
    ws.getCell(5, start).value = kpi.value;
    ws.getCell(6, start).value = "━━━━";
  });
  setRowHeight(ws, 5, 32);
  setRowHeight(ws, 6, 10);

  merge(ws, `A8:${col(lastCol)}8`);
  ws.getCell("A8").value = `   ${trendTitle}`;
  paintMerged(ws, 1, lastCol, 8, styleSection);
  setRowHeight(ws, 8, 22);

  const afterTrend = writeTrendBlock(9, payload.masterTrend);
  const series = scoreSeriesFromTrend(payload.masterTrend, months);
  if (series.values.length > 0) {
    await embedTrendChart(wb, ws, {
      row: afterTrend + 2,
      labels: series.labels,
      values: series.values,
      title: `${payload.meta.teamLabel} — Avg Score Trend (${payload.meta.rangeLabel})`,
    });
  }
}

export async function downloadQaReportWorkbook(payload: ReportExportPayload) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Detroit Axle QA";
  wb.created = new Date();

  await buildMasterDashboard(wb, payload);
  buildMonthlyTrend(wb, payload);
  buildCriterionBreakdown(wb, payload);
  buildCaseTypeAnalysis(wb, payload);
  buildQuantity(wb, payload);

  const year = new Date().getFullYear();
  const safeTeam = payload.meta.teamLabel.replace(/\s+/g, "_");
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `QA_Report_Full_${safeTeam}_${year}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
