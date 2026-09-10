export type DateRange = {
  start: Date | null;
  end: Date | null;
};

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isBeforeDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() < startOfDay(b).getTime();
}

export function isAfterDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() > startOfDay(b).getTime();
}

export function isInRange(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const t = startOfDay(day).getTime();
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  return t > s && t < e;
}

export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRangeLabel(range: DateRange): string {
  if (range.start && range.end) {
    if (sameDay(range.start, range.end)) {
      return formatDisplayDate(range.start);
    }
    return `${formatDisplayDate(range.start)} – ${formatDisplayDate(range.end)}`;
  }
  if (range.start) return `${formatDisplayDate(range.start)} – …`;
  return "Select date range";
}

export function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

/** Calendar cells for a month view (Sunday-first), including leading/trailing days. */
export function buildMonthCells(viewMonth: Date): Date[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    cells.push(startOfDay(day));
  }
  return cells;
}

export function defaultAnalyticsRange(): DateRange {
  const end = startOfDay(new Date());
  const start = startOfDay(new Date());
  start.setDate(end.getDate() - 8);
  return { start, end };
}
