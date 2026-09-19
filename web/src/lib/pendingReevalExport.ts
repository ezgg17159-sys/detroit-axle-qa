import ExcelJS from "exceljs";
import JSZip from "jszip";

import {
  caseTypeLabel,
  formatAuditDate,
  formatEarned,
  resultLabel,
  teamLabel,
  type AuditRecord,
} from "./audits";
import { formatRangeLabel, toIsoDate, type DateRange } from "./dateRange";
import { isoInDateRange, type PendingReevalRow } from "./evaluationProgress";

function downloadBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B3A5B" },
    };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });
  row.height = 22;
}

/** Mark cell as boolean FALSE — real checkbox formatting is injected after write. */
function applyCheckboxPlaceholder(cell: ExcelJS.Cell) {
  cell.value = false;
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

const FEATURE_PROPERTY_BAG_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FeaturePropertyBags xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag"><bag type="Checkbox"/><bag type="XFControls"><bagId k="CellControl">0</bagId></bag><bag type="XFComplement"><bagId k="XFControls">1</bagId></bag><bag type="XFComplements" extRef="XFComplementsMapperExtRef"><a k="MappedFeaturePropertyBags"><bagId>2</bagId></a></bag></FeaturePropertyBags>`;

const CHECKBOX_XF_EXT = `<extLst><ext uri="{C7286773-470A-42A8-94C5-96B5CB345126}" xmlns:xfpb="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag"><xfpb:xfComplement i="0"/></ext></extLst>`;

/**
 * Patch an ExcelJS workbook buffer so boolean cells in column A on the given sheets
 * render as Microsoft 365 in-cell checkboxes.
 */
async function injectExcelCheckboxes(
  buffer: ArrayBuffer,
  sheetNames: string[],
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);

  zip.file("xl/featurePropertyBag/featurePropertyBag.xml", FEATURE_PROPERTY_BAG_XML);

  const contentTypesPath = Object.keys(zip.files).find((name) =>
    name.endsWith("[Content_Types].xml"),
  );
  if (contentTypesPath) {
    let typesXml = await zip.file(contentTypesPath)!.async("string");
    if (!typesXml.includes("featurepropertybag")) {
      typesXml = typesXml.replace(
        "</Types>",
        `<Override PartName="/xl/featurePropertyBag/featurePropertyBag.xml" ContentType="application/vnd.ms-excel.featurepropertybag+xml"/></Types>`,
      );
      zip.file(contentTypesPath, typesXml);
    }
  }

  const relsPath = "xl/_rels/workbook.xml.rels";
  const relsFile = zip.file(relsPath);
  if (relsFile) {
    let relsXml = await relsFile.async("string");
    if (!relsXml.includes("FeaturePropertyBag")) {
      const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
      const nextId = (ids.length ? Math.max(...ids) : 0) + 1;
      relsXml = relsXml.replace(
        "</Relationships>",
        `<Relationship Id="rId${nextId}" Type="http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag" Target="featurePropertyBag/featurePropertyBag.xml"/></Relationships>`,
      );
      zip.file(relsPath, relsXml);
    }
  }

  const stylesFile = zip.file("xl/styles.xml");
  if (!stylesFile) return buffer;
  let stylesXml = await stylesFile.async("string");
  const cellXfsMatch = stylesXml.match(/<cellXfs[^>]*count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!cellXfsMatch) return buffer;
  const oldCount = Number(cellXfsMatch[1]);
  const checkboxXf = `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0">${CHECKBOX_XF_EXT}</xf>`;
  const newCellXfs = stylesXml
    .replace(
      /<cellXfs([^>]*)count="\d+"/,
      `<cellXfs$1count="${oldCount + 1}"`,
    )
    .replace(`</cellXfs>`, `${checkboxXf}</cellXfs>`);
  stylesXml = newCellXfs;
  zip.file("xl/styles.xml", stylesXml);
  const checkboxStyleIndex = oldCount;

  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  const workbookRels = (await zip.file(relsPath)?.async("string")) || "";
  const sheetEntries = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)];
  const nameToTarget = new Map<string, string>();
  for (const [tag] of sheetEntries) {
    const name = tag.match(/name="([^"]+)"/)?.[1];
    const rId = tag.match(/r:id="(rId\d+)"/)?.[1];
    if (!name || !rId) continue;
    const rel =
      workbookRels.match(new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`)) ||
      workbookRels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rId}"`));
    if (rel?.[1]) {
      let target = rel[1].replace(/^\//, "");
      if (!target.startsWith("xl/")) target = `xl/${target}`;
      nameToTarget.set(name, target);
    }
  }

  for (const sheetName of sheetNames) {
    const path = nameToTarget.get(sheetName);
    if (!path || !zip.file(path)) continue;
    let sheetXml = await zip.file(path)!.async("string");

    // Drop dataValidations that target column A (legacy TRUE/FALSE lists).
    sheetXml = sheetXml.replace(/<dataValidations[\s\S]*?<\/dataValidations>/g, "");
    sheetXml = sheetXml.replace(/<dataValidation[\s\S]*?\/>/g, "");

    sheetXml = sheetXml.replace(
      /<c r="(A[2-9]|A\d{2,})"[^>]*>[\s\S]*?<\/c>/g,
      (_full, ref: string) => {
        const checked = /<v>\s*1\s*<\/v>/.test(_full);
        return `<c r="${ref}" s="${checkboxStyleIndex}" t="b"><v>${checked ? 1 : 0}</v></c>`;
      },
    );

    // Self-closing boolean cells ExcelJS might emit.
    sheetXml = sheetXml.replace(
      /<c r="(A[2-9]|A\d{2,})"([^>]*)\/>/g,
      `<c r="$1" s="${checkboxStyleIndex}" t="b"><v>0</v></c>`,
    );

    zip.file(path, sheetXml);
  }

  return zip.generateAsync({ type: "arraybuffer" });
}

function isCheckedValue(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "number" && value !== 0) return true;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "y" ||
      normalized === "1" ||
      normalized === "x" ||
      normalized === "✓" ||
      normalized === "checked"
    );
  }
  if (value && typeof value === "object" && "text" in value) {
    return isCheckedValue((value as { text?: unknown }).text);
  }
  if (value && typeof value === "object" && "result" in value) {
    return isCheckedValue((value as { result?: unknown }).result);
  }
  return false;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && value && "text" in value) {
    return String((value as { text?: string }).text ?? "").trim();
  }
  if (typeof value === "object" && value && "result" in value) {
    return String((value as { result?: unknown }).result ?? "").trim();
  }
  return String(value).trim();
}

function formatMetricsBlock(audit: AuditRecord): string {
  if (!audit.metrics?.length) return "";
  return audit.metrics
    .map((row) => {
      const parts = [
        row.metric || "Metric",
        resultLabel(row.result),
        formatEarned(row.earned),
      ];
      if (row.qaNote?.trim()) parts.push(`Note: ${row.qaNote.trim()}`);
      return parts.join(" | ");
    })
    .join("\n");
}

export type PendingReevalExportInput = {
  pending: PendingReevalRow[];
  audits: AuditRecord[];
  range: DateRange;
  selectedAgentIds: string[];
};

/** Audits for selected agents in range that still need re-evaluation. */
export function pendingAuditsForExport(
  audits: AuditRecord[],
  selectedAgentIds: string[],
  range: DateRange,
): AuditRecord[] {
  if (!range.start || !range.end) return [];
  const idSet = new Set(selectedAgentIds);
  return audits
    .filter((audit) => {
      if (!idSet.has(audit.agentId)) return false;
      if (!audit.date || !isoInDateRange(audit.date, range)) return false;
      return !audit.reevaluated;
    })
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return (a.agentName || "").localeCompare(b.agentName || "");
    });
}

export async function exportPendingReevalWorkbook(input: PendingReevalExportInput): Promise<void> {
  const { pending, audits, range, selectedAgentIds } = input;
  const pendingAudits = pendingAuditsForExport(audits, selectedAgentIds, range);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Detroit Axle QA";
  wb.created = new Date();

  const daysSheet = wb.addWorksheet("Pending days", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  daysSheet.columns = [
    { header: "Agent name", key: "name", width: 28 },
    { header: "Agent ID", key: "agentId", width: 18 },
    { header: "Date", key: "date", width: 14 },
    { header: "Date label", key: "dateLabel", width: 16 },
  ];
  styleHeader(daysSheet.getRow(1));
  for (const row of pending) {
    for (const day of row.days) {
      daysSheet.addRow({
        name: row.name,
        agentId: row.agentId,
        date: day,
        dateLabel: formatAuditDate(day),
      });
    }
  }

  const auditsSheet = wb.addWorksheet("Bulk re-evaluate", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  auditsSheet.columns = [
    { header: "Re-evaluate", key: "reevaluate", width: 14 },
    { header: "Audit ID", key: "id", width: 38 },
    { header: "Date", key: "date", width: 14 },
    { header: "Date label", key: "dateLabel", width: 16 },
    { header: "Agent name", key: "agentName", width: 26 },
    { header: "Alias", key: "alias", width: 20 },
    { header: "Agent ID", key: "agentId", width: 18 },
    { header: "Team", key: "team", width: 12 },
    { header: "Quality score", key: "score", width: 12 },
    { header: "Case type", key: "caseType", width: 18 },
    { header: "Status", key: "status", width: 12 },
    { header: "Shared", key: "shared", width: 10 },
    { header: "Ticket number", key: "ticket", width: 16 },
    { header: "Order number", key: "order", width: 16 },
    { header: "Phone number", key: "phone", width: 16 },
    { header: "Issue resolved", key: "issueResolved", width: 14 },
    { header: "Issue resolved note", key: "issueResolvedNote", width: 28 },
    { header: "Comments", key: "comments", width: 40 },
    { header: "Other information", key: "otherInformation", width: 40 },
    { header: "Created by", key: "createdBy", width: 22 },
    { header: "Last internal audit", key: "lastInternalAudit", width: 18 },
    { header: "Metrics summary", key: "metricsSummary", width: 56 },
  ];
  styleHeader(auditsSheet.getRow(1));

  pendingAudits.forEach((audit, index) => {
    const rowNumber = index + 2;
    const excelRow = auditsSheet.addRow({
      reevaluate: false,
      id: audit.id,
      date: audit.date,
      dateLabel: formatAuditDate(audit.date),
      agentName: audit.agentName || "",
      alias: audit.alias || "",
      agentId: audit.agentId || "",
      team: teamLabel(audit.team),
      score: audit.qualityScore || audit.score || "",
      caseType: caseTypeLabel(audit.caseType) || audit.caseType || "",
      status: audit.status || "",
      shared: audit.shared ? "Yes" : "No",
      ticket: audit.ticketNumber || "",
      order: audit.orderNumber || "",
      phone: audit.phoneNumber || "",
      issueResolved: audit.issueResolved || "",
      issueResolvedNote: audit.issueResolvedNote || "",
      comments: audit.comments || "",
      otherInformation: audit.otherInformation || "",
      createdBy: audit.createdBy || "",
      lastInternalAudit: audit.lastInternalAudit
        ? formatAuditDate(audit.lastInternalAudit)
        : "",
      metricsSummary: formatMetricsBlock(audit),
    });
    excelRow.alignment = { vertical: "top", wrapText: true };
    if ((audit.metrics?.length || 0) > 1 || (audit.comments || "").length > 80) {
      excelRow.height = Math.min(120, 18 + (audit.metrics?.length || 1) * 14);
    }
    applyCheckboxPlaceholder(auditsSheet.getCell(rowNumber, 1));
  });

  const metricsSheet = wb.addWorksheet("Metrics", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  metricsSheet.columns = [
    { header: "Re-evaluate", key: "reevaluate", width: 14 },
    { header: "Audit ID", key: "auditId", width: 38 },
    { header: "Date", key: "date", width: 14 },
    { header: "Date label", key: "dateLabel", width: 16 },
    { header: "Agent name", key: "agentName", width: 26 },
    { header: "Alias", key: "alias", width: 20 },
    { header: "Agent ID", key: "agentId", width: 18 },
    { header: "Team", key: "team", width: 12 },
    { header: "Quality score", key: "score", width: 12 },
    { header: "Metric", key: "metric", width: 28 },
    { header: "Result", key: "result", width: 12 },
    { header: "Earned", key: "earned", width: 12 },
    { header: "QA note", key: "qaNote", width: 40 },
    { header: "Comments", key: "comments", width: 36 },
    { header: "Other information", key: "otherInformation", width: 36 },
    { header: "Created by", key: "createdBy", width: 22 },
  ];
  styleHeader(metricsSheet.getRow(1));

  let metricsRowNumber = 2;
  for (const audit of pendingAudits) {
    const metrics = audit.metrics?.length
      ? audit.metrics
      : [
          {
            id: "",
            metric: "",
            result: "n/a" as const,
            earned: "",
            qaNote: "",
          },
        ];
    for (const metric of metrics) {
      metricsSheet.addRow({
        reevaluate: false,
        auditId: audit.id,
        date: audit.date,
        dateLabel: formatAuditDate(audit.date),
        agentName: audit.agentName || "",
        alias: audit.alias || "",
        agentId: audit.agentId || "",
        team: teamLabel(audit.team),
        score: audit.qualityScore || audit.score || "",
        metric: metric.metric || "",
        result: metric.metric ? resultLabel(metric.result) : "",
        earned: metric.metric ? formatEarned(metric.earned) : "",
        qaNote: metric.qaNote || "",
        comments: audit.comments || "",
        otherInformation: audit.otherInformation || "",
        createdBy: audit.createdBy || "",
      });
      applyCheckboxPlaceholder(metricsSheet.getCell(metricsRowNumber, 1));
      metricsRowNumber += 1;
    }
  }

  const note = wb.addWorksheet("Instructions");
  note.getCell("A1").value = "Bulk re-evaluate export";
  note.getCell("A1").font = { bold: true, size: 14 };
  note.getCell("A3").value =
    "Sheet “Pending days” lists each agent and day that still needs re-evaluation.";
  note.getCell("A4").value =
    "Sheet “Bulk re-evaluate” has the full audit. Check the Re-evaluate box for rows to mark, then import.";
  note.getCell("A5").value =
    "Sheet “Metrics” has one row per QA metric. Import uses Audit ID + checked Re-evaluate boxes.";
  note.getCell("A6").value = `Range: ${formatRangeLabel(range)}`;
  note.getCell("A7").value = `Exported: ${new Date().toLocaleString()}`;
  note.columns = [{ width: 110 }];

  const rawBuffer = await wb.xlsx.writeBuffer();
  const withCheckboxes = await injectExcelCheckboxes(rawBuffer as ArrayBuffer, [
    "Bulk re-evaluate",
    "Metrics",
  ]);
  const start = toIsoDate(range.start) || "start";
  const end = toIsoDate(range.end) || "end";
  downloadBuffer(withCheckboxes, `pending_reevaluate_${start}_${end}.xlsx`);
}

export type BulkReevalImportResult = {
  selectedIds: string[];
  skipped: number;
};

/** Read Bulk re-evaluate / Metrics sheet; return unique audit IDs marked TRUE. */
export async function parseBulkReevalImport(file: File): Promise<BulkReevalImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const preferred =
    wb.getWorksheet("Bulk re-evaluate") ||
    wb.getWorksheet("Metrics") ||
    wb.worksheets.find((ws) => /re-?eval|metric/i.test(ws.name)) ||
    wb.worksheets[1] ||
    wb.worksheets[0];

  if (!preferred) {
    throw new Error("Could not find the Bulk re-evaluate sheet in this file.");
  }

  const sheets = [
    preferred,
    ...wb.worksheets.filter((ws) => ws !== preferred && /re-?eval|metric|bulk/i.test(ws.name)),
  ];

  const selected = new Set<string>();
  let skipped = 0;

  for (const sheet of sheets) {
    const headers = new Map<number, string>();
    sheet.getRow(1).eachCell((cell, col) => {
      headers.set(
        col,
        String(cell.value ?? "")
          .trim()
          .toLowerCase(),
      );
    });

    let reevalIndex = 1;
    let idIndex = 2;
    for (const [col, header] of headers) {
      if (header === "re-evaluate" || header === "reevaluate" || header.includes("re-eval")) {
        reevalIndex = col;
      }
      if (header === "audit id" || header === "auditid" || header === "id") {
        idIndex = col;
      }
    }

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = cellText(row.getCell(idIndex).value);
      if (!id) {
        skipped += 1;
        return;
      }
      if (isCheckedValue(row.getCell(reevalIndex).value)) {
        selected.add(id);
      } else {
        skipped += 1;
      }
    });
  }

  if (selected.size === 0) {
    throw new Error("No audits have the Re-evaluate checkbox checked.");
  }

  return { selectedIds: Array.from(selected), skipped };
}
