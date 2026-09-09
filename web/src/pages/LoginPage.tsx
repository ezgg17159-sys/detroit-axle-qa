import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { MicrosoftIcon } from "../icons/MicrosoftIcon";
import { useNotify } from "../notifications/NotificationContext";

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const { notify } = useNotify();
  const navigate = useNavigate();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(loginValue.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to sign in.", {
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero" aria-label="Detroit Axle">
        <div className="login-page__scene" aria-hidden="true">
          <div className="blob blob--navy" />
          <div className="blob blob--indigo" />
          <div className="blob blob--cyan" />
          <div className="blob blob--teal" />
          <div className="blob blob--glow" />
          <div className="blob blob--soft-white" />
          <svg
            className="login-page__waves login-page__waves--a"
            viewBox="0 0 1440 900"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="waveWarm" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38b4e5" stopOpacity="0.95" />
                <stop offset="55%" stopColor="#5ec4eb" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.35" />
              </linearGradient>
              <linearGradient id="waveCool" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#111d33" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#0c1528" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <path
              className="wave-path wave-path--cool"
              fill="url(#waveCool)"
              d="M0,0 C240,120 360,280 520,340 C780,440 920,180 1440,260 L1440,0 Z"
            />
            <path
              className="wave-path wave-path--warm"
              fill="url(#waveWarm)"
              d="M0,520 C220,420 420,640 640,580 C900,500 1100,720 1440,620 L1440,900 L0,900 Z"
            />
            <path
              className="wave-path wave-path--accent"
              fill="#38b4e5"
              opacity="0.45"
              d="M0,700 C280,620 480,780 720,740 C980,690 1180,820 1440,760 L1440,900 L0,900 Z"
            />
          </svg>
          <svg
            className="login-page__waves login-page__waves--b"
            viewBox="0 0 1440 900"
            preserveAspectRatio="none"
          >
            <path
              fill="#38b4e5"
              opacity="0.22"
              d="M-200,400 C180,280 420,520 700,440 C980,360 1200,560 1640,420 L1640,900 L-200,900 Z"
            />
            <path
              fill="#ffffff"
              opacity="0.08"
              d="M-160,180 C200,80 480,260 760,160 C1040,60 1280,220 1600,120 L1600,0 L-160,0 Z"
            />
          </svg>
        </div>

        <div className="login-branding">
          <img
            className="login-logo"
            src="/detroit-axle-logo.png"
            alt="Detroit Axle"
          />
        </div>

        <p className="login-credit">Created by Rashed Kattan</p>
      </section>

      <aside className="login-side" aria-labelledby="login-title">
        <div className="login-panel">
          <h1 id="login-title" className="login-title">
            Quality Assurance
          </h1>

          <form className="login-form" onSubmit={onSubmit}>
            <input
              id="login"
              name="login"
              className="login-input"
              autoComplete="username"
              placeholder="Email ID"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              required
              aria-label="Email or username"
            />

            <input
              id="password"
              name="password"
              className="login-input"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-label="Password"
            />

            <div className="login-row">
              <label className="login-check">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                />
                <span>Keep me signed in</span>
              </label>
              <span className="login-link">Already a member?</span>
            </div>

            <button className="btn-primary login-submit" type="submit" disabled={submitting}>
              {submitting ? "SIGNING IN…" : "LOGIN"}
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
        </div>
      </aside>
    </main>
  );
}
