import * as XLSX from "xlsx";

import {
  findProductionMatch,
  listProduction,
  normalizeId,
  normalizePersonName,
  parseDepartment,
  upsertProduction,
  type ProductionDepartment,
  type ProductionPatch,
  type ProductionRecord,
} from "./production";

export type ImportRowWarning = {
  source: string;
  row: number;
  message: string;
};

export type ParsedImportRow = {
  source: string;
  row: number;
  patch: ProductionPatch;
  matchHint: "vonage" | "employeeId" | "name" | "none";
};

export type ImportPreview = {
  rows: ParsedImportRow[];
  warnings: ImportRowWarning[];
  summary: {
    sources: string[];
    totalParsed: number;
    wouldCreate: number;
    wouldUpdate: number;
    nameOnlyMatches: number;
  };
};

export type ImportResult = {
  created: number;
  updated: number;
  nameOnlyMatches: number;
  warnings: ImportRowWarning[];
};

function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  const cleaned = String(raw).replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function headerKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ");
}

function pickColumn(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.findIndex((header) => header === alias);
    if (index >= 0) return index;
  }
  for (const alias of aliases) {
    const index = headers.findIndex((header) => header.includes(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function detectLayout(headers: string[]): {
  name: number;
  employeeId: number;
  vonageId: number;
  department: number;
  calls: number;
  tickets: number;
  sales: number;
} {
  return {
    name: pickColumn(headers, [
      "employee name",
      "agent name",
      "agent",
      "name",
      "employee",
    ]),
    employeeId: pickColumn(headers, ["employee id", "emp id", "empid", "hr id"]),
    vonageId: pickColumn(headers, [
      "vonage id",
      "vonage",
      "agent id",
      "agentid",
      "extension",
    ]),
    department: pickColumn(headers, ["department", "team", "dept"]),
    calls: pickColumn(headers, [
      "calls handled",
      "calls",
      "handled",
      "inbound handled",
      "answer",
    ]),
    tickets: pickColumn(headers, ["tickets", "ticket"]),
    sales: pickColumn(headers, ["sales", "sale", "revenue"]),
  };
}

function cell(row: unknown[], index: number): unknown {
  if (index < 0 || index >= row.length) return undefined;
  return row[index];
}

function rowsFromSheet(sheet: XLSX.WorkSheet): unknown[][] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  return matrix.filter((row) =>
    row.some((value) => String(value ?? "").trim() !== ""),
  );
}

function parseMatrix(
  source: string,
  matrix: unknown[][],
): { rows: ParsedImportRow[]; warnings: ImportRowWarning[] } {
  const warnings: ImportRowWarning[] = [];
  if (matrix.length === 0) {
    warnings.push({ source, row: 0, message: "File is empty." });
    return { rows: [], warnings };
  }

  // Prefer a header row that contains recognizable labels.
  let headerIndex = 0;
  for (let i = 0; i < Math.min(5, matrix.length); i += 1) {
    const keys = (matrix[i] ?? []).map(headerKey);
    const layout = detectLayout(keys);
    if (layout.name >= 0 && (layout.calls >= 0 || layout.tickets >= 0 || layout.sales >= 0 || layout.vonageId >= 0)) {
      headerIndex = i;
      break;
    }
  }

  const headers = (matrix[headerIndex] ?? []).map(headerKey);
  const layout = detectLayout(headers);
  if (layout.name < 0) {
    warnings.push({
      source,
      row: headerIndex + 1,
      message: "Could not find an employee/agent name column.",
    });
    return { rows: [], warnings };
  }

  const rows: ParsedImportRow[] = [];
  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const raw = matrix[i] ?? [];
    const employeeName = String(cell(raw, layout.name) ?? "")
      .replace(/\u00a0/g, " ")
      .trim();
    if (!employeeName) continue;

    const employeeId = normalizeId(cell(raw, layout.employeeId) as string | number);
    const vonageId = normalizeId(cell(raw, layout.vonageId) as string | number);
    const departmentRaw = String(cell(raw, layout.department) ?? "").trim();
    const department = parseDepartment(departmentRaw);

    const callsHandled = layout.calls >= 0 ? parseNumber(cell(raw, layout.calls)) : null;
    const tickets = layout.tickets >= 0 ? parseNumber(cell(raw, layout.tickets)) : null;
    const sales = layout.sales >= 0 ? parseNumber(cell(raw, layout.sales)) : null;

    if (callsHandled === null && tickets === null && sales === null && !vonageId && !employeeId) {
      // Skip junk / total rows with only a name
      if (!departmentRaw) continue;
    }

    const patch: ProductionPatch = {
      employeeName,
      employeeId: employeeId || undefined,
      vonageId: vonageId || undefined,
      department: (department ?? undefined) as ProductionDepartment | undefined,
      callsHandled: callsHandled ?? undefined,
      tickets: tickets ?? undefined,
      sales: sales ?? undefined,
    };

    let matchHint: ParsedImportRow["matchHint"] = "none";
    const existing = findProductionMatch(listProduction(), patch);
    if (existing) matchHint = existing.via;
    else if (vonageId) matchHint = "vonage";
    else if (employeeId) matchHint = "employeeId";
    else matchHint = "name";

    rows.push({
      source,
      row: i + 1,
      patch,
      matchHint,
    });
  }

  if (rows.length === 0) {
    warnings.push({ source, row: 0, message: "No employee rows were detected." });
  }

  return { rows, warnings };
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export async function parseProductionFile(file: File): Promise<{
  rows: ParsedImportRow[];
  warnings: ImportRowWarning[];
}> {
  const name = file.name;
  const lower = name.toLowerCase();
  const buffer = await readFileAsArrayBuffer(file);

  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const workbook = XLSX.read(text, { type: "string" });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) {
      return {
        rows: [],
        warnings: [{ source: name, row: 0, message: "CSV has no sheet data." }],
      };
    }
    return parseMatrix(name, rowsFromSheet(sheet));
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const preferred =
      workbook.SheetNames.find((sheetName) => sheetName.toLowerCase() === "in") ??
      workbook.SheetNames[0];
    const sheet = preferred ? workbook.Sheets[preferred] : undefined;
    if (!sheet) {
      return {
        rows: [],
        warnings: [{ source: name, row: 0, message: "Workbook has no sheets." }],
      };
    }
    return parseMatrix(name, rowsFromSheet(sheet));
  }

  return {
    rows: [],
    warnings: [
      {
        source: name,
        row: 0,
        message: "Unsupported file type. Use .csv or .xlsx.",
      },
    ],
  };
}

/** Merge multiple parsed file rows into unique employee patches (later files patch earlier). */
export function mergeParsedRows(parsed: ParsedImportRow[]): {
  patches: ProductionPatch[];
  nameOnlyCount: number;
  warnings: ImportRowWarning[];
} {
  const warnings: ImportRowWarning[] = [];
  const merged: ProductionPatch[] = [];
  let nameOnlyCount = 0;

  const findInMerged = (patch: ProductionPatch) => {
    const asRecords: ProductionRecord[] = merged.map((item, index) => ({
      id: `tmp-${index}`,
      employeeName: item.employeeName ?? "",
      employeeId: item.employeeId ?? "",
      vonageId: item.vonageId ?? "",
      department: item.department ?? "unassigned",
      callsHandled: item.callsHandled ?? null,
      tickets: item.tickets ?? null,
      sales: item.sales ?? null,
      periodStart: item.periodStart ?? null,
      periodEnd: item.periodEnd ?? null,
      updatedAt: "",
    }));
    return findProductionMatch(asRecords, patch);
  };

  for (const item of parsed) {
    const hit = findInMerged(item.patch);
    if (!hit) {
      if (!item.patch.vonageId && !item.patch.employeeId) nameOnlyCount += 1;
      merged.push({ ...item.patch });
      continue;
    }

    if (hit.via === "name") nameOnlyCount += 1;
    const index = Number(hit.row.id.replace("tmp-", ""));
    const current = merged[index]!;
    merged[index] = {
      ...current,
      employeeName: item.patch.employeeName || current.employeeName,
      employeeId: item.patch.employeeId || current.employeeId,
      vonageId: item.patch.vonageId || current.vonageId,
      department:
        item.patch.department && item.patch.department !== "unassigned"
          ? item.patch.department
          : current.department,
      callsHandled:
        item.patch.callsHandled !== undefined && item.patch.callsHandled !== null
          ? item.patch.callsHandled
          : current.callsHandled,
      tickets:
        item.patch.tickets !== undefined && item.patch.tickets !== null
          ? item.patch.tickets
          : current.tickets,
      sales:
        item.patch.sales !== undefined && item.patch.sales !== null
          ? item.patch.sales
          : current.sales,
    };

    if (hit.via === "name") {
      warnings.push({
        source: item.source,
        row: item.row,
        message: `Matched “${item.patch.employeeName}” by name only.`,
      });
    }
  }

  return { patches: merged, nameOnlyCount, warnings };
}

export async function buildImportPreview(
  files: File[],
  period?: { start: string | null; end: string | null },
): Promise<ImportPreview> {
  const allRows: ParsedImportRow[] = [];
  const warnings: ImportRowWarning[] = [];
  const sources: string[] = [];

  for (const file of files) {
    sources.push(file.name);
    const parsed = await parseProductionFile(file);
    warnings.push(...parsed.warnings);
    for (const row of parsed.rows) {
      allRows.push({
        ...row,
        patch: {
          ...row.patch,
          periodStart: period?.start ?? row.patch.periodStart,
          periodEnd: period?.end ?? row.patch.periodEnd,
        },
      });
    }
  }

  const { patches, nameOnlyCount, warnings: mergeWarnings } = mergeParsedRows(allRows);
  warnings.push(...mergeWarnings);

  const existing = listProduction();
  let wouldCreate = 0;
  let wouldUpdate = 0;
  for (const patch of patches) {
    const hit = findProductionMatch(existing, patch);
    if (hit) wouldUpdate += 1;
    else wouldCreate += 1;
  }

  return {
    rows: allRows,
    warnings,
    summary: {
      sources,
      totalParsed: patches.length,
      wouldCreate,
      wouldUpdate,
      nameOnlyMatches: nameOnlyCount,
    },
  };
}

export async function applyProductionImport(
  files: File[],
  period?: { start: string | null; end: string | null },
): Promise<ImportResult> {
  const preview = await buildImportPreview(files, period);
  const { patches, nameOnlyCount, warnings: mergeWarnings } = mergeParsedRows(preview.rows);

  let created = 0;
  let updated = 0;
  const warnings = [...preview.warnings, ...mergeWarnings];

  for (const patch of patches) {
    if (!patch.employeeName || !normalizePersonName(patch.employeeName)) {
      warnings.push({
        source: "import",
        row: 0,
        message: "Skipped a row with no employee name.",
      });
      continue;
    }
    const result = upsertProduction({
      ...patch,
      periodStart: period?.start ?? patch.periodStart,
      periodEnd: period?.end ?? patch.periodEnd,
    });
    if (result.created) created += 1;
    else updated += 1;
    if (result.matchedVia === "name") {
      warnings.push({
        source: "import",
        row: 0,
        message: `Updated “${result.record.employeeName}” via name match.`,
      });
    }
  }

  try {
    const { importProductionRemote } = await import("./externalApi");
    const remoteRows = patches
      .filter((patch) => patch.employeeName && normalizePersonName(patch.employeeName))
      .map((patch) => ({
        employeeName: patch.employeeName,
        employeeId: patch.employeeId || "",
        vonageId: patch.vonageId || "",
        callsHandled: patch.callsHandled ?? null,
        tickets: patch.tickets ?? null,
        sales: patch.sales ?? null,
        periodStart: period?.start ?? patch.periodStart ?? null,
        periodEnd: period?.end ?? patch.periodEnd ?? null,
      }));
    if (remoteRows.length > 0) {
      await importProductionRemote(remoteRows);
    }
  } catch {
    warnings.push({
      source: "import",
      row: 0,
      message: "Saved locally; remote production write failed.",
    });
  }

  return {
    created,
    updated,
    nameOnlyMatches: nameOnlyCount,
    warnings,
  };
}

export const PRODUCTION_TEMPLATE_CSV = `employee_name,employee_id,vonage_id,department,calls_handled,tickets,sales
Jordan Lee,E1001,400426,calls,1150,12,0
Maya Singh,E1002,42326,tickets,0,2649,0
`;
