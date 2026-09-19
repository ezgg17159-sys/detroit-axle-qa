export type AuditListView = "audit" | "coaching";

const VIEW_KEY = "daq_audit_list_view_v1";

export function readAuditListView(): AuditListView {
  try {
    const raw = sessionStorage.getItem(VIEW_KEY);
    if (raw === "coaching" || raw === "audit") return raw;
  } catch {
    /* ignore */
  }
  return "audit";
}

export function writeAuditListView(view: AuditListView) {
  try {
    sessionStorage.setItem(VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}
