import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AppLoader } from "../components/AppLoader";
import { EyeIcon, EyeOffIcon } from "../icons/EyeIcon";
import { MicrosoftIcon } from "../icons/MicrosoftIcon";
import { useNotify } from "../notifications/NotificationContext";

const HERO_AUTO_MS = 20_000;

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const { notify } = useNotify();
  const navigate = useNavigate();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [heroPage, setHeroPage] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const heroSlides = [
    {
      id: "brand",
      content: (
            <div className="login-branding">
              <img
                className="login-logo"
                src="/detroit-axle-logo.png"
                alt="Detroit Axle"
              />
            </div>
      ),
    },
    {
      id: "quality",
      content: (
        <div className="login-hero-copy">
          <h2 className="login-hero-copy__title">Stay on track</h2>
          <p className="login-hero-copy__text">
            Keep on track with your employees’ quality work, catch issues early,
            and notify them the moment something needs attention.
          </p>
        </div>
      ),
    },
    {
      id: "performance",
      content: (
        <div className="login-hero-copy">
          <h2 className="login-hero-copy__title">
            Keep track on your QA for better performance and get notified
          </h2>
          <p className="login-hero-copy__text">
            Monitor audit scores, spot trends across teams, and get alerts when
            quality drops so you can act before it becomes a bigger problem.
          </p>
        </div>
      ),
    },
  ] as const;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroPage((page) => (page + 1) % heroSlides.length);
    }, HERO_AUTO_MS);
    return () => window.clearInterval(timer);
  }, [heroPage, heroSlides.length]);

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

        <div
          className="login-hero-slider"
          onTouchStart={(event) => setTouchStartX(event.changedTouches[0]?.clientX ?? null)}
          onTouchEnd={(event) => {
            if (touchStartX === null) return;
            const delta = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
            if (Math.abs(delta) < 40) return;
            setHeroPage((page) =>
              delta < 0
                ? Math.min(page + 1, heroSlides.length - 1)
                : Math.max(page - 1, 0),
            );
            setTouchStartX(null);
          }}
        >
          <div
            className="login-hero-track"
            style={{ transform: `translateX(-${heroPage * 100}%)` }}
          >
            {heroSlides.map((slide) => (
              <div className="login-hero-slide" key={slide.id}>
                {slide.content}
              </div>
            ))}
          </div>
        </div>

        <div className="login-pager" role="tablist" aria-label="Intro pages">
          {heroSlides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={heroPage === index}
              aria-label={`Go to page ${index + 1}`}
              className={
                heroPage === index
                  ? "login-pager__dot login-pager__dot--active"
                  : "login-pager__dot"
              }
              onClick={() => setHeroPage(index)}
            />
          ))}
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
                onClick={() =>
                  notify("Password reset will be available soon.", {
                    variant: "info",
                  })
                }
              >
                Forgot password?
              </button>
            </div>

            <button className="btn-primary login-submit" type="submit" disabled={submitting}>
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
        </div>
      </aside>
    </main>
  );
}
