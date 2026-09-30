import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { DateRangePicker } from "../../components/DateRangePicker";
import { useConfirmDelete } from "../../components/ConfirmDeleteContext";
import { SortHeader, type SortDir } from "../../components/table/SortHeader";
import { TableRowActions } from "../../components/table/TableRowActions";
import {
  BulkDeleteButton,
  RowCheckboxCell,
  SelectAllCheckbox,
} from "../../components/table/TableSelection";
import { useRowSelection } from "../../hooks/useRowSelection";
import { EyeIcon, EyeOffIcon } from "../../icons/EyeIcon";
import { provisionLoginRequest } from "../../lib/api";
import { type DateRange } from "../../lib/dateRange";
import { fetchManagedUsers } from "../../lib/externalApi";
import { defaultPortalRange } from "../../lib/portalRange";
import { applyDir, compareText, nextSortState } from "../../lib/tableSort";
import { useShellPageLoading } from "../../components/PageLoadingContext";
import {
  CONFIGURABLE_ROLES,
  PERMISSION_VIEWS,
  PRIMARY_SUPER_ADMIN,
  SUPER_ADMIN_DEPARTMENT,
  SUPER_ADMIN_ROLE,
  SUPERVISOR_TEAM_OPTIONS,
  USER_DEPARTMENT_OPTIONS,
  USER_ROLE_OPTIONS,
  canDeleteManagedUser,
  createManagedUser,
  deleteManagedUser,
  departmentLabel,
  departmentOptionsForActor,
  emptyUserDraft,
  formatCreatedAt,
  isSuperAdmin,
  isSupervisorTeam,
  assertAllowedWorkEmail,
  listManagedUsers,
  listRolePermissions,
  loadRolePermissionsRemote,
  needsVonageId,
  resolveActorRole,
  roleLabel,
  roleOptionsForActor,
  saveRolePermissions,
  updateManagedUser,
  userCreatedInRange,
  type ConfigurableRole,
  type ManagedUser,
  type ManagedUserDraft,
  type PermissionView,
  type PermissionsMatrix,
  type UserDepartment,
  type UserRole,
} from "../../lib/managedUsers";
import { useNotify } from "../../notifications/NotificationContext";

const PAGE_SIZE = 30;

type TabId = "users" | "permissions";
type SortKey =
  | "agentName"
  | "department"
  | "role"
  | "email"
  | "createdBy"
  | "createdAt";

function getPageItems(totalPages: number, current: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) items.push("ellipsis");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value)?.label ?? value;
  const labelId = `mu-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="audits-filter" ref={rootRef}>
      <span className="audits-filter__label" id={labelId}>
        {label}
      </span>
      <button
        type="button"
        className={`audits-filter__trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="audits-filter__value">{selected}</span>
        <svg className="audits-filter__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="audits-filter__menu" role="listbox" aria-labelledby={labelId}>
          {options.map((option) => {
            const isActive = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`audits-filter__option${isActive ? " is-active" : ""}`}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = `mu-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <label className="cases-field">
      <span className="cases-field__label">{label}</span>
      <div className="mu-password">
        <input
          id={id}
          className="cases-field__control mu-password__input"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="mu-password__toggle"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
        </button>
      </div>
    </label>
  );
}

function RowActions({
  onEdit,
  onView,
  onDelete,
  canDelete,
}: {
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <TableRowActions
      label="User actions"
      items={[
        { label: "View", onClick: onView },
        { label: "Edit", onClick: onEdit },
        { label: "Delete", onClick: onDelete, danger: true, hidden: !canDelete },
      ]}
    />
  );
}

function UserFormModal({
  open,
  initial,
  createdBy,
  actorRole,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: ManagedUser | null;
  createdBy: string;
  actorRole: UserRole | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useNotify();
  const [draft, setDraft] = useState<ManagedUserDraft>(() => emptyUserDraft());
  const editing = Boolean(initial);
  const deptOptions = departmentOptionsForActor(actorRole);
  const roleOptions = roleOptionsForActor(actorRole);
  const lockPrimary = initial?.id === PRIMARY_SUPER_ADMIN.id;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        agentName: initial.agentName,
        alias: initial.alias,
        email: initial.email,
        employeeId: initial.employeeId,
        vonageId: initial.vonageId,
        department: initial.department,
        role: initial.role,
        password: "",
        confirmPassword: "",
      });
    } else {
      setDraft(emptyUserDraft());
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const patch = (partial: Partial<ManagedUserDraft>) => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const showVonage = needsVonageId(draft.department);
  const isSupervisor = draft.role === "supervisor";
  const passwordOk = editing
    ? draft.password.length === 0 ||
      (draft.password.length >= 6 && draft.password === draft.confirmPassword)
    : draft.password.length >= 6 && draft.password === draft.confirmPassword;

  const canSave =
    draft.agentName.trim().length > 0 &&
    draft.email.trim().length > 0 &&
    passwordOk &&
    (!isSupervisor || isSupervisorTeam(draft.department));

  const handleSave = async () => {
    if (!draft.agentName.trim() || !draft.email.trim()) {
      notify("Agent name and email are required.", { variant: "error" });
      return;
    }
    try {
      assertAllowedWorkEmail(draft.email);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Invalid work email.", {
        variant: "error",
      });
      return;
    }
    if (isSupervisor && !isSupervisorTeam(draft.department)) {
      notify("Supervisors must have a team (Calls, Tickets, Live Chat, or Sales).", {
        variant: "error",
      });
      return;
    }
    if (!editing && draft.password.length < 6) {
      notify("Password must be at least 6 characters.", { variant: "error" });
      return;
    }
    if (draft.password && draft.password !== draft.confirmPassword) {
      notify("Passwords do not match.", { variant: "error" });
      return;
    }

    try {
      if (initial) {
        const saved = await updateManagedUser(initial.id, draft, actorRole);
        if (!saved) {
          throw new Error("Unable to update user.");
        }
      } else {
        await createManagedUser(draft, createdBy, actorRole);
      }

      if (draft.password) {
        const result = await provisionLoginRequest({
          email: draft.email.trim(),
          password: draft.password,
          username: draft.alias.trim() || draft.employeeId.trim() || undefined,
          fullName: draft.agentName.trim(),
        });
        notify(
          initial
            ? `User updated. ${result.detail}`
            : `User added. ${result.detail}`,
          { variant: "success" },
        );
      } else {
        notify(initial ? "User updated." : "User added.", { variant: "success" });
      }
      onSaved();
      onClose();
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : "Unable to save user.",
        { variant: "error" },
      );
    }
  };

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog mu-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mu-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="mu-form-title" className="cases-modal__title">
              {editing ? "Edit user" : "Add user"}
            </h2>
            <p className="cases-modal__subtitle">
              {editing ? "Update account details" : "Create a new team account"}
            </p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cases-modal__body">
          <div className="mu-form-grid">
            <label className="cases-field">
              <span className="cases-field__label">Agent name</span>
              <input
                className="cases-field__control"
                type="text"
                value={draft.agentName}
                placeholder="Full name"
                onChange={(event) => patch({ agentName: event.target.value })}
              />
            </label>

            <label className="cases-field">
              <span className="cases-field__label">Agent alias (optional)</span>
              <input
                className="cases-field__control"
                type="text"
                value={draft.alias}
                placeholder="Alias"
                onChange={(event) => patch({ alias: event.target.value })}
              />
            </label>

            <label className="cases-field">
              <span className="cases-field__label">Email</span>
              <input
                className="cases-field__control"
                type="email"
                value={draft.email}
                placeholder="name@detroitaxle.com"
                onChange={(event) => patch({ email: event.target.value })}
              />
            </label>

            <label className="cases-field">
              <span className="cases-field__label">Employee ID (optional)</span>
              <input
                className="cases-field__control"
                type="text"
                value={draft.employeeId}
                placeholder="Employee ID"
                onChange={(event) => patch({ employeeId: event.target.value })}
              />
            </label>

            <div className="mu-field-slot">
              <FilterSelect
                label="Role"
                value={draft.role}
                options={roleOptions}
                onChange={(role) =>
                  patch({
                    role,
                    department:
                      role === "superadmin"
                        ? "super-admin"
                        : role === "supervisor"
                          ? isSupervisorTeam(draft.department)
                            ? draft.department
                            : "calls"
                          : draft.department === "super-admin"
                            ? "calls"
                            : draft.department,
                  })
                }
              />
            </div>

            {isSupervisor ? (
              <div className="mu-field-slot">
                <FilterSelect
                  label="Team"
                  value={
                    isSupervisorTeam(draft.department) ? draft.department : "calls"
                  }
                  options={SUPERVISOR_TEAM_OPTIONS}
                  onChange={(department) =>
                    patch({
                      department,
                      vonageId: needsVonageId(department) ? draft.vonageId : "",
                    })
                  }
                />
              </div>
            ) : (
              <div className="mu-field-slot">
                <FilterSelect
                  label="Department"
                  value={draft.department}
                  options={deptOptions}
                  onChange={(department) =>
                    patch({
                      department,
                      role:
                        department === "super-admin"
                          ? "superadmin"
                          : draft.role === "superadmin"
                            ? "admin"
                            : draft.role,
                      vonageId: needsVonageId(department) ? draft.vonageId : "",
                    })
                  }
                />
              </div>
            )}

            {isSupervisor ? (
              <p className="mu-form-note mu-span-2">
                Supervisors only see data for their assigned team across every permitted view.
              </p>
            ) : null}

            {lockPrimary ? (
              <p className="mu-form-note mu-span-2">
                Primary super admin department and role cannot be changed.
              </p>
            ) : null}

            {showVonage ? (
              <label className="cases-field mu-span-2">
                <span className="cases-field__label">Vonage ID</span>
                <input
                  className="cases-field__control"
                  type="text"
                  value={draft.vonageId}
                  placeholder="Vonage ID"
                  onChange={(event) => patch({ vonageId: event.target.value })}
                />
              </label>
            ) : null}

            <PasswordField
              label={editing ? "Password (optional)" : "Password"}
              value={draft.password}
              autoComplete="new-password"
              placeholder={editing ? "Leave blank to keep current" : "At least 6 characters"}
              onChange={(password) => patch({ password })}
            />

            <PasswordField
              label="Confirm password"
              value={draft.confirmPassword}
              autoComplete="new-password"
              placeholder="Re-enter password"
              onChange={(confirmPassword) => patch({ confirmPassword })}
            />
          </div>
        </div>

        <footer className="cases-wizard-footer">
          <button
            type="button"
            className="cases-btn cases-btn--primary"
            disabled={!canSave}
            onClick={handleSave}
          >
            {editing ? "Save changes" : "Add user"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ViewUserModal({
  open,
  record,
  onClose,
}: {
  open: boolean;
  record: ManagedUser | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !record) return null;

  return (
    <div className="cases-modal" role="presentation" onMouseDown={onClose}>
      <div
        className="cases-modal__dialog mu-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mu-view-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="cases-modal__header">
          <div>
            <h2 id="mu-view-title" className="cases-modal__title">
              User details
            </h2>
            <p className="cases-modal__subtitle">{record.agentName}</p>
          </div>
          <button type="button" className="cases-modal__close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cases-modal__body mu-view-body">
          <div className="mu-view-meta">
            <div><span>Agent name</span><strong>{record.agentName}</strong></div>
            <div><span>Alias</span><strong>{record.alias || "—"}</strong></div>
            <div><span>Email</span><strong>{record.email}</strong></div>
            <div><span>Employee ID</span><strong>{record.employeeId || "—"}</strong></div>
            <div><span>Department</span><strong>{departmentLabel(record.department)}</strong></div>
            <div><span>Role</span><strong>{roleLabel(record.role)}</strong></div>
            {needsVonageId(record.department) ? (
              <div><span>Vonage ID</span><strong>{record.vonageId || "—"}</strong></div>
            ) : null}
            <div><span>Created by</span><strong>{record.createdBy}</strong></div>
            <div><span>Created</span><strong>{formatCreatedAt(record.createdAt)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PermissionsTab() {
  const { notify } = useNotify();
  const [matrix, setMatrix] = useState<PermissionsMatrix>(() => listRolePermissions());

  useEffect(() => {
    void loadRolePermissionsRemote().then(setMatrix);
  }, []);

  const toggle = (role: ConfigurableRole, view: PermissionView) => {
    setMatrix((current) => ({
      ...current,
      [role]: {
        ...current[role],
        [view]: !current[role][view],
      },
    }));
  };

  const handleSave = async () => {
    try {
      await saveRolePermissions(matrix);
      notify("Permissions saved.", { variant: "success" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save permissions.", {
        variant: "error",
      });
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, typeof PERMISSION_VIEWS>();
    for (const view of PERMISSION_VIEWS) {
      const list = map.get(view.group) ?? [];
      list.push(view);
      map.set(view.group, list);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <section className="mu-permissions" aria-label="Permissions">
      <div className="mu-permissions__toolbar">
        <button type="button" className="cases-add-btn" onClick={handleSave}>
          Save permissions
        </button>
      </div>

      <div className="mu-permissions__panel">
        <div className="mu-permissions__scroll">
          <div className="mu-permissions__grid-head" role="row">
            <div className="mu-permissions__col-label" role="columnheader">
              Sub tab
            </div>
            {CONFIGURABLE_ROLES.map((role) => (
              <div key={role.id} className="mu-permissions__col-view" role="columnheader">
                {role.label}
              </div>
            ))}
          </div>
          {groups.map(([group, views]) => (
            <div key={group} className="mu-permissions__group">
              <div className="mu-permissions__group-title">{group}</div>
              {views.map((view) => (
                <div key={view.id} className="mu-permissions__row" role="row">
                  <div className="mu-permissions__col-label">{view.label}</div>
                  {CONFIGURABLE_ROLES.map((role) => (
                    <div key={role.id} className="mu-permissions__col-view">
                      <label className="mu-check">
                        <input
                          type="checkbox"
                          checked={matrix[role.id][view.id]}
                          onChange={() => toggle(role.id, view.id)}
                          aria-label={`${role.label} view ${view.label}`}
                        />
                        <span className="mu-check__box" aria-hidden="true" />
                      </label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function UsersTab() {
  const { user } = useAuth();
  const { notify } = useNotify();
  const { confirmDelete } = useConfirmDelete();
  const createdBy = user?.full_name?.trim() || user?.username || "";
  const actorRole = resolveActorRole(user);

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<"all" | UserDepartment>("all");
  const [role, setRole] = useState<"all" | UserRole>("all");
  const [range, setRange] = useState<DateRange>(() => defaultPortalRange());
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("agentName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [viewing, setViewing] = useState<ManagedUser | null>(null);

  useShellPageLoading(loading);

  const refresh = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      // Load full page once; search/department/role filter client-side.
      const payload = await fetchManagedUsers({ search: "", limit: 2000 });
      if (payload.connected) {
        const live = payload.items.flatMap((raw) => {
          const row = raw as Partial<ManagedUser> & { id?: string; active?: boolean };
          if (!row.id || row.active === false) return [];
          return [
            {
              id: String(row.id),
              agentName: String(row.agentName || ""),
              alias: String(row.alias || ""),
              email: String(row.email || ""),
              employeeId: String(row.employeeId || ""),
              vonageId: String(row.vonageId || ""),
              department: (row.department as UserDepartment) || "calls",
              role: (row.role as UserRole) || "agent",
              createdBy: String(row.createdBy || ""),
              createdAt: String(row.createdAt || ""),
              updatedAt: String(row.updatedAt || ""),
            } satisfies ManagedUser,
          ];
        });
        setRows(live);
      } else {
        setRows(listManagedUsers());
      }
    } catch {
      setRows(listManagedUsers());
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  const deptFilterOptions = useMemo(
    () => [
      { id: "all" as const, label: "All departments" },
      ...USER_DEPARTMENT_OPTIONS,
      SUPER_ADMIN_DEPARTMENT,
    ],
    [],
  );

  const roleFilterOptions = useMemo(
    () => [
      { id: "all" as const, label: "All roles" },
      ...USER_ROLE_OPTIONS,
      SUPER_ADMIN_ROLE,
    ],
    [],
  );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onFocus = () => {
      void refresh({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (department !== "all" && row.department !== department) return false;
      if (role !== "all" && row.role !== role) return false;
      if (!userCreatedInRange(row.createdAt, range.start, range.end)) return false;
      if (!q) return true;
      return (
        row.agentName.toLowerCase().includes(q) ||
        row.alias.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.employeeId.toLowerCase().includes(q) ||
        row.createdBy.toLowerCase().includes(q) ||
        roleLabel(row.role).toLowerCase().includes(q) ||
        departmentLabel(row.department).toLowerCase().includes(q)
      );
    });
  }, [rows, search, department, role, range.start, range.end]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "agentName":
          result = compareText(a.agentName, b.agentName);
          break;
        case "department":
          result = compareText(departmentLabel(a.department), departmentLabel(b.department));
          break;
        case "role":
          result = compareText(roleLabel(a.role), roleLabel(b.role));
          break;
        case "email":
          result = compareText(a.email, b.email);
          break;
        case "createdBy":
          result = compareText(a.createdBy, b.createdBy);
          break;
        case "createdAt":
          result = compareText(a.createdAt, b.createdAt);
          break;
      }
      return applyDir(result, sortDir);
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [search, department, role, range.start, range.end]);

  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage],
  );
  const pageIds = useMemo(() => pageRows.map((row) => row.id), [pageRows]);
  const {
    selectedIds,
    isSelected,
    allPageSelected,
    somePageSelected,
    toggleRow,
    toggleAllPage,
    clearSelection,
  } = useRowSelection(pageIds);
  const pageItems = useMemo(
    () => getPageItems(totalPages, currentPage),
    [totalPages, currentPage],
  );
  const rangeStart = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalRows);

  const deleteBlockedMessage = (targets: ManagedUser[]) => {
    if (targets.some((row) => isSuperAdmin(row.role))) {
      return "Super admins cannot be deleted.";
    }
    return "You don’t have permission to delete this user.";
  };

  const handleDelete = async (row: ManagedUser) => {
    if (!canDeleteManagedUser(actorRole, row)) {
      notify(deleteBlockedMessage([row]), { variant: "error" });
      return;
    }
    const ok = await confirmDelete({
      title: `Delete user “${row.agentName}”?`,
      description: row.email || "This user account will be removed.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const removed = await deleteManagedUser(row.id, actorRole, row);
      if (!removed) {
        notify("Could not delete this user.", { variant: "error" });
        return;
      }
      void refresh();
      notify("User deleted.", { variant: "success" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not delete this user.", {
        variant: "error",
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
    const deletable = selectedRows.filter((row) => canDeleteManagedUser(actorRole, row));
    if (deletable.length === 0) {
      notify(deleteBlockedMessage(selectedRows), { variant: "error" });
      return;
    }
    const count = deletable.length;
    const ok = await confirmDelete({
      title: count === 1 ? "Delete 1 user?" : `Delete ${count} users?`,
      description:
        count === 1
          ? "This user account will be removed."
          : "These user accounts will be removed.",
      confirmLabel: count === 1 ? "Delete user" : "Delete users",
    });
    if (!ok) return;
    let removed = 0;
    for (const row of deletable) {
      try {
        if (await deleteManagedUser(row.id, actorRole, row)) removed += 1;
      } catch {
        /* count as failed */
      }
    }
    clearSelection();
    void refresh();
    if (removed === 0) {
      notify("Could not delete the selected users.", { variant: "error" });
      return;
    }
    notify(
      removed === 1 ? "1 user deleted." : `${removed} users deleted.`,
      { variant: "success" },
    );
  };

  return (
    <>
      <div className="audits-page__toolbar">
        <div className="audits-page__controls">
          <label className="audits-search">
            <span className="audits-search__label">Search</span>
            <span className="audits-search__field">
              <svg className="audits-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                className="audits-search__input"
                type="search"
                placeholder="Search name, email…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>

          <FilterSelect
            label="Filter by department"
            value={department}
            options={deptFilterOptions}
            onChange={setDepartment}
          />

          <FilterSelect
            label="Filter by role"
            value={role}
            options={roleFilterOptions}
            onChange={setRole}
          />

          <BulkDeleteButton
            count={selectedIds.length}
            onClick={() => void handleDeleteSelected()}
            noun="users"
          />
        </div>

        <div className="mu-toolbar-right">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            className="cases-add-btn"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add user
          </button>
        </div>
      </div>

      <section className="mu-page__table-wrap" aria-label="Users table">
        <div className="data-table-shell">
          <div className="data-table-shell__scroll">
            <table className="data-table mu-table">
              <thead>
                <tr>
                  <SelectAllCheckbox
                    allSelected={allPageSelected}
                    someSelected={somePageSelected}
                    onToggle={toggleAllPage}
                    disabled={pageRows.length === 0}
                  />
                  <SortHeader
                    label="Agent name"
                    active={sortKey === "agentName"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "agentName", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Department"
                    active={sortKey === "department"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "department", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Role"
                    active={sortKey === "role"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "role", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Email"
                    active={sortKey === "email"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "email", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Created by"
                    active={sortKey === "createdBy"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "createdBy", "asc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <SortHeader
                    label="Create date and time"
                    active={sortKey === "createdAt"}
                    dir={sortDir}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDir, "createdAt", "desc");
                      setSortKey(next.key);
                      setSortDir(next.dir);
                      setPage(1);
                    }}
                  />
                  <th scope="col" className="cases-table__actions-col">
                    <span className="data-table__th-static">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="audits-table__empty">
                      No users found. Add a user to get started.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const checked = isSelected(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={`audits-table__row${checked ? " is-selected" : ""}`}
                      >
                        <RowCheckboxCell
                          checked={checked}
                          onToggle={() => toggleRow(row.id)}
                          label={`Select user ${row.agentName}`}
                        />
                        <td>{row.agentName}</td>
                        <td>{departmentLabel(row.department)}</td>
                        <td>{roleLabel(row.role)}</td>
                        <td>{row.email}</td>
                        <td>{row.createdBy}</td>
                        <td>{formatCreatedAt(row.createdAt)}</td>
                        <td className="cases-table__actions-col">
                          <RowActions
                            canDelete={canDeleteManagedUser(actorRole, row)}
                            onView={() => setViewing(row)}
                            onEdit={() => {
                              setEditing(row);
                              setFormOpen(true);
                            }}
                            onDelete={() => void handleDelete(row)}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <footer className="data-table-footer" aria-label="Table pagination">
            <span className="data-table-footer__meta">
              Showing {rangeStart}–{rangeEnd} of {totalRows} · {PAGE_SIZE} per page
            </span>
            <nav className="data-table-pager" aria-label="Pages">
              <button
                type="button"
                className="data-table-pager__btn"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                ‹
              </button>
              {pageItems.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="data-table-pager__ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={`data-table-pager__btn${item === currentPage ? " is-active" : ""}`}
                    aria-label={`Page ${item}`}
                    aria-current={item === currentPage ? "page" : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                className="data-table-pager__btn"
                aria-label="Next page"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                ›
              </button>
            </nav>
          </footer>
        </div>
      </section>

      <UserFormModal
        open={formOpen}
        initial={editing}
        createdBy={createdBy}
        actorRole={actorRole}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => { void refresh(); }}
      />
      <ViewUserModal
        open={Boolean(viewing)}
        record={viewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}

export function ManageUsersPage() {
  const location = useLocation();
  const tab: TabId = location.pathname.includes("/permissions") ? "permissions" : "users";

  return (
    <main className="mu-page" aria-label="Manage users">
      {tab === "users" ? <UsersTab /> : <PermissionsTab />}
    </main>
  );
}
