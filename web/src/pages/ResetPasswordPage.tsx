import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AppLoader } from "../components/AppLoader";
import { EyeIcon, EyeOffIcon } from "../icons/EyeIcon";
import { resetPasswordRequest } from "../lib/api";
import { useNotify } from "../notifications/NotificationContext";
import { LoginAuthShell } from "./LoginAuthShell";

export function ResetPasswordPage() {
  const { isAuthenticated, bootstrapping } = useAuth();
  const { notify } = useNotify();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const uid = useMemo(() => (params.get("uid") || "").trim(), [params]);
  const token = useMemo(() => (params.get("token") || "").trim(), [params]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (bootstrapping) {
    return (
      <main className="login-page">
        <AppLoader variant="page" label="Loading…" />
      </main>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const linkMissing = !uid || !token;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (linkMissing) {
      notify("This reset link is incomplete. Request a new one from sign in.", {
        variant: "error",
      });
      return;
    }
    if (password !== confirm) {
      notify("Passwords do not match.", { variant: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const detail = await resetPasswordRequest({
        uid,
        token,
        newPassword: password,
      });
      notify(detail, { variant: "success" });
      navigate("/login", { replace: true });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to reset password.", {
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LoginAuthShell titleId="reset-title" title="Choose a new password">
      {linkMissing ? (
        <div className="login-form">
          <p className="login-forgot-hint">
            This reset link is missing required details. Request a new link from
            the sign-in page.
          </p>
          <Link className="btn-primary login-submit" to="/login">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form className="login-form" onSubmit={onSubmit}>
          <div className="login-password">
            <input
              id="new-password"
              name="new-password"
              className="login-input login-input--password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              aria-label="New password"
            />
            <button
              type="button"
              className="login-password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          <div className="login-password">
            <input
              id="confirm-password"
              name="confirm-password"
              className="login-input login-input--password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              aria-label="Confirm password"
            />
            <button
              type="button"
              className="login-password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          <button
            className="btn-primary login-submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? (
              <AppLoader variant="button" label="Saving…" />
            ) : (
              "UPDATE PASSWORD"
            )}
          </button>

          <Link className="login-forgot login-forgot--back" to="/login">
            Back to sign in
          </Link>
        </form>
      )}
    </LoginAuthShell>
  );
}
