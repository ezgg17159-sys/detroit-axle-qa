import type { AuditTeam } from "./audits";

export type CaseRecord = {
  id: string;
  key: string;
  label: string;
  team: AuditTeam;
  sortOrder: number;
  passPoints: number;
  borderlinePoints: number;
  countsTowardScore: boolean;
  canAutoFail: boolean;
  active: boolean;
};

export type CaseDraft = Omit<CaseRecord, "id">;

const storageKey = "daq_cases_v2";

function readStore(): CaseRecord[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CaseRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(rows: CaseRecord[]) {
  sessionStorage.setItem(storageKey, JSON.stringify(rows));
}

export function listCases(): CaseRecord[] {
  return [...readStore()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
}

export function getCase(id: string): CaseRecord | null {
  return readStore().find((row) => row.id === id) ?? null;
}

export function saveCase(record: CaseRecord): void {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === record.id);
  if (index >= 0) rows[index] = record;
  else rows.unshift(record);
  writeStore(rows);
}

export function deleteCase(id: string): void {
  writeStore(readStore().filter((row) => row.id !== id));
}

export function newCaseId(): string {
  return `case-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyCaseDraft(team: AuditTeam = "calls"): CaseDraft {
  return {
    key: "",
    label: "",
    team,
    sortOrder: listCases().length + 1,
    passPoints: 1,
    borderlinePoints: 0.5,
    countsTowardScore: true,
    canAutoFail: false,
    active: true,
  };
}

export function slugifyCaseKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
