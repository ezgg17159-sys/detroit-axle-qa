export type CaseTypeRecord = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  team?: string;
};

export type CaseTypeDraft = Omit<CaseTypeRecord, "id">;

const storageKey = "daq_case_types_v2";

function normalizeRow(row: CaseTypeRecord): CaseTypeRecord {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    active: Boolean(row.active),
    team: row.team || undefined,
  };
}

function readAll(): CaseTypeRecord[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CaseTypeRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRow);
  } catch {
    return [];
  }
}

function writeAll(rows: CaseTypeRecord[]): void {
  sessionStorage.setItem(storageKey, JSON.stringify(rows));
}

export function listCaseTypes(): CaseTypeRecord[] {
  return readAll().slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function saveCaseType(record: CaseTypeRecord): void {
  const rows = readAll();
  const index = rows.findIndex((row) => row.id === record.id);
  if (index >= 0) rows[index] = record;
  else rows.push(record);
  writeAll(rows);
}

export function deleteCaseType(id: string): void {
  writeAll(readAll().filter((row) => row.id !== id));
}

export function newCaseTypeId(): string {
  return `case-type-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyCaseTypeDraft(): CaseTypeDraft {
  return {
    name: "",
    sortOrder: listCaseTypes().length + 1,
    active: true,
    team: "calls",
  };
}
