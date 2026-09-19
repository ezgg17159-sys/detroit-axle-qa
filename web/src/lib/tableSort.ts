import type { SortDir } from "../components/table/SortHeader";

export type { SortDir };

/** Toggle sort key/direction. Same key flips dir; new key uses preferredDir. */
export function nextSortState<K extends string>(
  currentKey: K,
  currentDir: SortDir,
  nextKey: K,
  preferredDir: SortDir = "asc",
): { key: K; dir: SortDir } {
  if (currentKey === nextKey) {
    return { key: currentKey, dir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { key: nextKey, dir: preferredDir };
}

export function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function compareNumber(a: unknown, b: unknown): number {
  const left = typeof a === "number" ? a : Number(String(a ?? "").replace(/[^\d.-]/g, ""));
  const right = typeof b === "number" ? b : Number(String(b ?? "").replace(/[^\d.-]/g, ""));
  const leftOk = Number.isFinite(left);
  const rightOk = Number.isFinite(right);
  if (leftOk && rightOk) return left - right;
  if (leftOk) return -1;
  if (rightOk) return 1;
  return compareText(String(a ?? ""), String(b ?? ""));
}

export function compareBool(a: boolean | null | undefined, b: boolean | null | undefined): number {
  return Number(Boolean(a)) - Number(Boolean(b));
}

export function applyDir(result: number, dir: SortDir): number {
  return dir === "asc" ? result : -result;
}
