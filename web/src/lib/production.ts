export type ProductionDepartment =
  | "calls"
  | "tickets"
  | "live-chat"
  | "sales"
  | "unassigned";

export type ProductionRecord = {
  id: string;
  employeeName: string;
  employeeId: string;
  vonageId: string;
  department: ProductionDepartment;
  callsHandled: number | null;
  tickets: number | null;
  sales: number | null;
  /** ISO date range for the import batch */
  periodStart: string | null;
  periodEnd: string | null;
  updatedAt: string;
};

export type ProductionPatch = Partial<
  Omit<ProductionRecord, "id" | "updatedAt">
> & {
  employeeName?: string;
};

export const PRODUCTION_DEPARTMENTS: Array<{
  id: ProductionDepartment;
  label: string;
}> = [
  { id: "calls", label: "Calls" },
  { id: "tickets", label: "Tickets" },
  { id: "live-chat", label: "Live Chat" },
  { id: "sales", label: "Sales" },
  { id: "unassigned", label: "Unassigned" },
];

const storageKey = "daq_production_v1";

export function normalizePersonName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeId(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function departmentLabel(department: ProductionDepartment | "all"): string {
  if (department === "all") return "All departments";
  return PRODUCTION_DEPARTMENTS.find((item) => item.id === department)?.label ?? department;
}

export function parseDepartment(raw: string | null | undefined): ProductionDepartment | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (value === "calls" || value === "call") return "calls";
  if (value === "tickets" || value === "ticket") return "tickets";
  if (value === "live-chat" || value === "livechat" || value === "live chat") return "live-chat";
  if (value === "sales" || value === "sale") return "sales";
  if (value === "unassigned" || value === "unknown" || value === "n/a") return "unassigned";
  return null;
}

function readStore(): ProductionRecord[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(rows: ProductionRecord[]) {
  sessionStorage.setItem(storageKey, JSON.stringify(rows));
}

export function listProduction(): ProductionRecord[] {
  return [...readStore()].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" }),
  );
}

export function getProduction(id: string): ProductionRecord | null {
  return readStore().find((row) => row.id === id) ?? null;
}

export function newProductionId(): string {
  return `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function findProductionMatch(
  rows: ProductionRecord[],
  candidate: {
    vonageId?: string;
    employeeId?: string;
    employeeName?: string;
  },
): { row: ProductionRecord; via: "vonage" | "employeeId" | "name" } | null {
  const vonageId = normalizeId(candidate.vonageId);
  if (vonageId) {
    const hit = rows.find((row) => normalizeId(row.vonageId) === vonageId);
    if (hit) return { row: hit, via: "vonage" };
  }

  const employeeId = normalizeId(candidate.employeeId);
  if (employeeId) {
    const hit = rows.find((row) => normalizeId(row.employeeId) === employeeId);
    if (hit) return { row: hit, via: "employeeId" };
  }

  const name = candidate.employeeName ? normalizePersonName(candidate.employeeName) : "";
  if (name) {
    const hit = rows.find((row) => normalizePersonName(row.employeeName) === name);
    if (hit) return { row: hit, via: "name" };
  }

  return null;
}

function mergeMetric(
  current: number | null,
  incoming: number | null | undefined,
): number | null {
  if (incoming === null || incoming === undefined) return current;
  return incoming;
}

/** Upsert one employee row; only patches non-empty metrics / ids. */
export function upsertProduction(patch: ProductionPatch): {
  record: ProductionRecord;
  created: boolean;
  matchedVia: "vonage" | "employeeId" | "name" | "new";
} {
  const rows = readStore();
  const match = findProductionMatch(rows, {
    vonageId: patch.vonageId,
    employeeId: patch.employeeId,
    employeeName: patch.employeeName,
  });

  const now = new Date().toISOString();

  if (!match) {
    const name = (patch.employeeName ?? "").trim();
    if (!name) {
      throw new Error("Employee name is required to create a production record.");
    }
    const record: ProductionRecord = {
      id: newProductionId(),
      employeeName: name,
      employeeId: normalizeId(patch.employeeId),
      vonageId: normalizeId(patch.vonageId),
      department: patch.department ?? "unassigned",
      callsHandled: patch.callsHandled ?? null,
      tickets: patch.tickets ?? null,
      sales: patch.sales ?? null,
      periodStart: patch.periodStart ?? null,
      periodEnd: patch.periodEnd ?? null,
      updatedAt: now,
    };
    rows.push(record);
    writeStore(rows);
    return { record, created: true, matchedVia: "new" };
  }

  const current = match.row;
  const next: ProductionRecord = {
    ...current,
    employeeName: (patch.employeeName ?? current.employeeName).trim() || current.employeeName,
    employeeId: normalizeId(patch.employeeId) || current.employeeId,
    vonageId: normalizeId(patch.vonageId) || current.vonageId,
    department:
      patch.department && patch.department !== "unassigned"
        ? patch.department
        : current.department !== "unassigned"
          ? current.department
          : patch.department ?? current.department,
    callsHandled: mergeMetric(current.callsHandled, patch.callsHandled),
    tickets: mergeMetric(current.tickets, patch.tickets),
    sales: mergeMetric(current.sales, patch.sales),
    periodStart: patch.periodStart ?? current.periodStart,
    periodEnd: patch.periodEnd ?? current.periodEnd,
    updatedAt: now,
  };

  const index = rows.findIndex((row) => row.id === current.id);
  rows[index] = next;
  writeStore(rows);
  return { record: next, created: false, matchedVia: match.via };
}

export function saveProduction(record: ProductionRecord): void {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === record.id);
  const next = { ...record, updatedAt: new Date().toISOString() };
  if (index >= 0) rows[index] = next;
  else rows.push(next);
  writeStore(rows);
}

export function deleteProduction(id: string): void {
  writeStore(readStore().filter((row) => row.id !== id));
}

export function formatMetric(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}
