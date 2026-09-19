/** Shared 6-month default range for portal tables whose DB data is older than ~1 week. */
import { startOfDay, type DateRange } from "./dateRange";

export function defaultPortalRange(): DateRange {
  const end = startOfDay(new Date());
  const start = startOfDay(new Date());
  start.setMonth(start.getMonth() - 6);
  return { start, end };
}
