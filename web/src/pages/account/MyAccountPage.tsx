import { useMemo, useState, type FormEvent } from "react";

import { useAuth } from "../../auth/AuthContext";
import { EyeIcon, EyeOffIcon } from "../../icons/EyeIcon";
import { changePasswordRequest } from "../../lib/api";
import {
  departmentLabel,
  formatCreatedAt,
  listManagedUsers,
  resolveActorRole,
  roleLabel,
  type ManagedUser,
} from "../../lib/managedUsers";
import { useNotify } from "../../notifications/NotificationContext";
import { useTheme } from "../../theme/ThemeContext";
import type { ThemePreference } from "../../theme/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string; description: string }[] = [
  {
    value: "light",
    label: "Light",
    description: "Bright surfaces for daytime use",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Dim surfaces that are easier on the eyes",
  },
  {
    value: "system",
    label: "System",
    description: "Match your device appearance setting",
  },
];

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
  const id = `account-${label.toLowerCase().replace(/\s+/g, "-")}`;

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

export function MyAccountPage() {
  const { user } = useAuth();
  const { notify } = useNotify();
  const { preference, setPreference } = useTheme();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const profile = useMemo(() => {
    if (!user) return null;
    const email = user.email?.trim().toLowerCase() ?? "";
    const name = user.full_name?.trim().toLowerCase() ?? "";
    const managed = listManagedUsers().find((row: ManagedUser) => {
      if (email && row.email.toLowerCase() === email) return true;
      if (name && row.agentName.toLowerCase() === name) return true;
      return false;
    });
    const role = resolveActorRole(user);
    return {
      name: managed?.agentName || user.full_name || user.username || "—",
      alias: managed?.alias || "",
      email: managed?.email || user.email || "—",
      username: user.username || "—",
      employeeId: managed?.employeeId || "",
      vonageId: managed?.vonageId || "",
      department: managed ? departmentLabel(managed.department) : "—",
      role: role ? roleLabel(role) : user.is_superuser ? "Super Admin" : "—",
      createdBy: managed?.createdBy || "—",
      createdAt: managed?.createdAt ? formatCreatedAt(managed.createdAt) : "—",
      staff: Boolean(user.is_staff),
      superuser: Boolean(user.is_superuser),
    };
  }, [user]);

  if (!user || !profile) {
    return (
      <main className="account-page" aria-label="My account">
        <p className="account-empty">Sign in to view your account.</p>
      </main>
    );
  }

  const canReset =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword;

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!canReset) {
      if (newPassword.length < 6) {
        notify("New password must be at least 6 characters.", { variant: "error" });
        return;
      }
      if (newPassword !== confirmPassword) {
        notify("New passwords do not match.", { variant: "error" });
        return;
      }
      notify("Enter your current password to continue.", { variant: "error" });
      return;
    }

    try {
      await changePasswordRequest(currentPassword, newPassword);
      notify("Password updated. You can sign in with your username or email.", {
        variant: "success",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to update password.", {
        variant: "error",
      });
    }
  };

  return (
    <main className="account-page" aria-label="My account">
      <section className="account-card" aria-labelledby="account-profile-title">
        <header className="account-card__header">
          <div>
            <h2 id="account-profile-title" className="account-card__title">
              Profile
            </h2>
            <p className="account-card__subtitle">Your account details</p>
          </div>
          <span className="account-role-badge">{profile.role}</span>
        </header>

        <div className="account-profile-grid">
          <div>
            <span>Full name</span>
            <strong>{profile.name}</strong>
          </div>
          <div>
            <span>Username</span>
            <strong>{profile.username}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{profile.email}</strong>
          </div>
          <div>
            <span>Alias</span>
            <strong>{profile.alias || "—"}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{profile.role}</strong>
          </div>
          <div>
            <span>Department</span>
            <strong>{profile.department}</strong>
          </div>
          <div>
            <span>Employee ID</span>
            <strong>{profile.employeeId || "—"}</strong>
          </div>
          <div>
            <span>Vonage ID</span>
            <strong>{profile.vonageId || "—"}</strong>
          </div>
          <div>
            <span>Created by</span>
            <strong>{profile.createdBy}</strong>
          </div>
          <div>
            <span>Created</span>
            <strong>{profile.createdAt}</strong>
          </div>
        </div>
      </section>

      <section className="account-card" aria-labelledby="account-appearance-title">
        <header className="account-card__header">
          <div>
            <h2 id="account-appearance-title" className="account-card__title">
              Appearance
            </h2>
            <p className="account-card__subtitle">Choose light, dark, or match your system</p>
          </div>
        </header>

        <div className="account-theme" role="radiogroup" aria-labelledby="account-appearance-title">
          {THEME_OPTIONS.map((option) => {
            const selected = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`account-theme__option${selected ? " is-active" : ""}`}
                onClick={() => setPreference(option.value)}
              >
                <span
                  className={`account-theme__swatch account-theme__swatch--${option.value}`}
                  aria-hidden
                />
                <span className="account-theme__copy">
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="account-card" aria-labelledby="account-password-title">
        <header className="account-card__header">
          <div>
            <h2 id="account-password-title" className="account-card__title">
              Reset password
            </h2>
            <p className="account-card__subtitle">Update the password for this account</p>
          </div>
        </header>

        <form className="account-password-form" onSubmit={handleReset}>
          <PasswordField
            label="Current password"
            value={currentPassword}
            autoComplete="current-password"
            placeholder="Enter current password"
            onChange={setCurrentPassword}
          />
          <PasswordField
            label="New password"
            value={newPassword}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            onChange={setNewPassword}
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            autoComplete="new-password"
            placeholder="Re-enter new password"
            onChange={setConfirmPassword}
          />

          <div className="account-password-form__actions">
            <button type="submit" className="cases-add-btn" disabled={!canReset}>
              Reset password
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
