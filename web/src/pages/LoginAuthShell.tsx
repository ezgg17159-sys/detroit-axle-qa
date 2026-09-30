import { useEffect, useState, type ReactNode } from "react";

import { surfaceLabel } from "../theme/surface";

const HERO_AUTO_MS = 20_000;

const HERO_SLIDES = [
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

type LoginAuthShellProps = {
  titleId: string;
  title: string;
  children: ReactNode;
};

export function LoginAuthShell({ titleId, title, children }: LoginAuthShellProps) {
  const [heroPage, setHeroPage] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroPage((page) => (page + 1) % HERO_SLIDES.length);
    }, HERO_AUTO_MS);
    return () => window.clearInterval(timer);
  }, [heroPage]);

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
          onTouchStart={(event) =>
            setTouchStartX(event.changedTouches[0]?.clientX ?? null)
          }
          onTouchEnd={(event) => {
            if (touchStartX === null) return;
            const delta =
              (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
            if (Math.abs(delta) < 40) return;
            setHeroPage((page) =>
              delta < 0
                ? Math.min(page + 1, HERO_SLIDES.length - 1)
                : Math.max(page - 1, 0),
            );
            setTouchStartX(null);
          }}
        >
          <div
            className="login-hero-track"
            style={{ transform: `translateX(-${heroPage * 100}%)` }}
          >
            {HERO_SLIDES.map((slide) => (
              <div className="login-hero-slide" key={slide.id}>
                {slide.content}
              </div>
            ))}
          </div>
        </div>

        <div className="login-pager" role="tablist" aria-label="Intro pages">
          {HERO_SLIDES.map((slide, index) => (
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

        <p className="login-credit">{surfaceLabel()}</p>
      </section>

      <aside className="login-side" aria-labelledby={titleId}>
        <div className="login-panel">
          <h1 id={titleId} className="login-title">
            {title}
          </h1>
          {children}
        </div>
      </aside>
    </main>
  );
}
