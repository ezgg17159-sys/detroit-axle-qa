import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AppLoader } from "../components/AppLoader";
import { EyeIcon, EyeOffIcon } from "../icons/EyeIcon";
import { MicrosoftIcon } from "../icons/MicrosoftIcon";
import { forgotPasswordRequest } from "../lib/api";
import { useNotify } from "../notifications/NotificationContext";
import { LoginAuthShell } from "./LoginAuthShell";

export function LoginPage() {
  const { isAuthenticated, bootstrapping, login } = useAuth();
  const { notify } = useNotify();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [loginValue, setLoginValue] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(loginValue.trim(), password, keepSignedIn);
      navigate("/", { replace: true });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to sign in.", {
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgotSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const detail = await forgotPasswordRequest(forgotEmail.trim());
      notify(detail, { variant: "success" });
      setMode("login");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to send reset link.", {
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LoginAuthShell
      titleId="login-title"
      title={mode === "forgot" ? "Reset password" : "Quality Assurance"}
    >
      {mode === "forgot" ? (
        <form className="login-form" onSubmit={onForgotSubmit}>
          <p className="login-forgot-hint">
            Enter your work email. If it matches a QA user, we&apos;ll send a
            reset link.
          </p>
          <input
            id="forgot-email"
            name="email"
            type="email"
            className="login-input"
            autoComplete="email"
            placeholder="Email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            required
            aria-label="Email"
          />
          <button
            className="btn-primary login-submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? (
              <AppLoader variant="button" label="Sending…" />
            ) : (
              "SEND RESET LINK"
            )}
          </button>
          <button
            type="button"
            className="login-forgot login-forgot--back"
            onClick={() => setMode("login")}
          >
            Back to sign in
          </button>
        </form>
      ) : (
        <form className="login-form" onSubmit={onSubmit}>
          <input
            id="login"
            name="login"
            className="login-input"
            autoComplete="username"
            placeholder="Email or username"
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            required
            aria-label="Email or username"
          />

          <div className="login-password">
            <input
              id="password"
              name="password"
              className="login-input login-input--password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-label="Password"
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

          <div className="login-row">
            <label className="login-check">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
              />
              <span>Keep me signed in</span>
            </label>
            <button
              type="button"
              className="login-forgot"
              onClick={() => {
                setForgotEmail(loginValue.includes("@") ? loginValue.trim() : "");
                setMode("forgot");
              }}
            >
              Forgot password?
            </button>
          </div>

          <button
            className="btn-primary login-submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? (
              <AppLoader variant="button" label="Signing in…" />
            ) : (
              "LOGIN"
            )}
          </button>

          <div className="login-divider" role="separator" aria-label="or">
            <span>or</span>
          </div>

          <button
            className="btn-secondary login-microsoft"
            type="button"
            onClick={() =>
              notify("Microsoft sign-in will be available soon.", {
                variant: "error",
              })
            }
          >
            <MicrosoftIcon className="login-microsoft__icon" />
            Login with Microsoft
          </button>
        </form>
      )}
    </LoginAuthShell>
  );
}
