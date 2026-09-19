export type CoachingSession = {
  id: string;
  agentId: string;
  agentName: string;
  qualityName: string;
  sessionDate: string; // YYYY-MM-DD
  topic: string;
  createdAt: string;
  updatedAt: string;
};

export type CoachingDraft = {
  agentId: string;
  agentName: string;
  qualityName: string;
  sessionDate: string;
  topic: string;
};

const storageKey = "daq_coaching_sessions_v1";

function readStore(): CoachingSession[] {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CoachingSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(rows: CoachingSession[]) {
  sessionStorage.setItem(storageKey, JSON.stringify(rows));
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function listCoachingSessions(): CoachingSession[] {
  return [...readStore()].sort((a, b) => {
    const byDate = b.sessionDate.localeCompare(a.sessionDate);
    if (byDate !== 0) return byDate;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function listQaNames(): string[] {
  const names = new Set<string>();
  for (const row of readStore()) {
    const name = row.qualityName.trim();
    if (name) names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function newCoachingId(): string {
  return `coach-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyCoachingDraft(qualityName: string): CoachingDraft {
  return {
    agentId: "",
    agentName: "",
    qualityName,
    sessionDate: todayIsoDate(),
    topic: "",
  };
}

export async function createCoachingSession(draft: CoachingDraft): Promise<CoachingSession> {
  const now = new Date().toISOString();
  const record: CoachingSession = {
    id: newCoachingId(),
    agentId: draft.agentId.trim(),
    agentName: draft.agentName.trim(),
    qualityName: draft.qualityName.trim(),
    sessionDate: draft.sessionDate.trim() || todayIsoDate(),
    topic: draft.topic.trim(),
    createdAt: now,
    updatedAt: now,
  };
  const { saveCoachingRemote } = await import("./externalApi");
  try {
    const remote = (await saveCoachingRemote(record as unknown as Record<string, unknown>)) as CoachingSession;
    const merged = { ...record, ...remote, id: String(remote.id || record.id) };
    const rows = readStore().filter((row) => row.id !== merged.id);
    rows.unshift(merged);
    writeStore(rows);
    return merged;
  } catch {
    const rows = readStore();
    rows.unshift(record);
    writeStore(rows);
    return record;
  }
}

export async function updateCoachingSession(id: string, draft: CoachingDraft): Promise<CoachingSession | null> {
  const rows = readStore();
  const index = rows.findIndex((row) => row.id === id);
  const current = index >= 0 ? rows[index]! : null;
  const next: CoachingSession = {
    id,
    agentId: draft.agentId.trim(),
    agentName: draft.agentName.trim(),
    qualityName: draft.qualityName.trim() || current?.qualityName || "",
    sessionDate: draft.sessionDate.trim() || current?.sessionDate || todayIsoDate(),
    topic: draft.topic.trim(),
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const { saveCoachingRemote } = await import("./externalApi");
  try {
    const remote = (await saveCoachingRemote(next as unknown as Record<string, unknown>)) as CoachingSession;
    const merged = { ...next, ...remote, id };
    if (index >= 0) rows[index] = merged;
    else rows.unshift(merged);
    writeStore(rows);
    return merged;
  } catch {
    if (index >= 0) rows[index] = next;
    else rows.unshift(next);
    writeStore(rows);
    return next;
  }
}

export async function deleteCoachingSession(id: string): Promise<void> {
  const { deleteCoachingRemote } = await import("./externalApi");
  try {
    await deleteCoachingRemote(id);
  } catch {
    /* local */
  }
  writeStore(readStore().filter((row) => row.id !== id));
}

export function formatSessionDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function coachingInRange(
  sessionDate: string,
  start: Date | null,
  end: Date | null,
): boolean {
  if (!start && !end) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return false;
  const [y, m, d] = sessionDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  const t = new Date(y, m - 1, d).getTime();
  if (start) {
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    if (t < s) return false;
  }
  if (end) {
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    if (t > e) return false;
  }
  return true;
}

export const COACHING_TEMPLATE_CSV = [
  "Agent Name,Agent ID,Quality Name,Session Date,Coaching Topic",
  "Jane Doe,,QA Lead,2026-09-19,Call soft skills",
].join("\n");

export type CoachingImportResult = {
  created: number;
  skipped: number;
  errors: string[];
};

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

function cellAt(row: unknown[], index: number): string {
  if (index < 0 || index >= row.length) return "";
  const value = row[index];
  if (value == null) return "";
  return String(value).trim();
}

function parseSessionDate(raw: string): string {
  const text = raw.trim();
  if (!text) return todayIsoDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    let y = Number(slash[3]);
    if (y < 100) y += 2000;
    // Prefer MDY for US org; if first > 12 treat as DMY.
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const asNum = Number(text);
  if (Number.isFinite(asNum) && asNum > 20000) {
    // Excel serial date
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + asNum * 86400000);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return todayIsoDate();
}

export async function parseCoachingImportFile(file: File): Promise<CoachingDraft[]> {
  const XLSX = await import("xlsx");
  const lower = file.name.toLowerCase();
  let matrix: unknown[][] = [];
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = await file.text();
    const workbook = XLSX.read(text, { type: "string" });
    const sheet = workbook.Sheets[workbook.SheetNames[0] || ""];
    if (sheet) {
      matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });
    }
  } else {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0] || ""];
    if (sheet) {
      matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });
    }
  }

  if (matrix.length < 2) return [];
  const headers = (matrix[0] || []).map(headerKey);
  const nameIdx = pickColumn(headers, ["agent name", "employee name", "name", "agent"]);
  const idIdx = pickColumn(headers, ["agent id", "employee id", "emp id", "id"]);
  const qaIdx = pickColumn(headers, ["quality name", "qa name", "qa", "coach"]);
  const dateIdx = pickColumn(headers, ["session date", "date", "coaching date"]);
  const topicIdx = pickColumn(headers, ["coaching topic", "topic", "subject", "notes"]);

  const drafts: CoachingDraft[] = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const row = Array.isArray(matrix[i]) ? (matrix[i] as unknown[]) : [];
    const agentName = cellAt(row, nameIdx);
    const topic = cellAt(row, topicIdx);
    if (!agentName || !topic) continue;
    drafts.push({
      agentId: cellAt(row, idIdx),
      agentName,
      qualityName: cellAt(row, qaIdx),
      sessionDate: parseSessionDate(cellAt(row, dateIdx)),
      topic,
    });
  }
  return drafts;
}

export async function importCoachingSessions(
  drafts: CoachingDraft[],
  options: {
    defaultQualityName: string;
    agents?: Array<{ id: string; name: string }>;
  },
): Promise<CoachingImportResult> {
  const defaultQualityName = options.defaultQualityName;
  const agents = options.agents ?? [];
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const draft of drafts) {
    const agentName = draft.agentName.trim();
    const topic = draft.topic.trim();
    if (!agentName || !topic) {
      skipped += 1;
      continue;
    }
    let agentId = draft.agentId.trim();
    if (!agentId && agents.length > 0) {
      const match = agents.find(
        (agent) => agent.name.trim().toLowerCase() === agentName.toLowerCase(),
      );
      if (match) agentId = match.id;
    }
    try {
      await createCoachingSession({
        agentId,
        agentName,
        qualityName: draft.qualityName.trim() || defaultQualityName,
        sessionDate: draft.sessionDate.trim() || todayIsoDate(),
        topic,
      });
      created += 1;
    } catch (error) {
      skipped += 1;
      errors.push(
        error instanceof Error
          ? `${agentName}: ${error.message}`
          : `${agentName}: import failed`,
      );
    }
  }

  return { created, skipped, errors };
}

export function downloadCoachingTemplate() {
  const blob = new Blob([COACHING_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "coaching-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
