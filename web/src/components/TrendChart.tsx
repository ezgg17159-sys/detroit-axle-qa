import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { PageLoadingContext } from "./PageLoadingContext";

type TrendChartProps = {
  points?: number[];
  /** Kept for call-site compatibility; axis labels are not rendered. */
  labels?: string[];
  emptyMessage?: string;
  variant?: "compact" | "wide";
  className?: string;
};

const SIZES = {
  compact: { width: 560, height: 132, pad: { top: 10, right: 10, bottom: 10, left: 10 } },
  wide: { width: 960, height: 280, pad: { top: 16, right: 16, bottom: 16, left: 16 } },
} as const;

function clampScore(value: number) {
  return Math.min(100, Math.max(0, value));
}

function buildLine(
  points: number[],
  width: number,
  height: number,
  pad: { top: number; right: number; bottom: number; left: number },
) {
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;

  const coords = points.map((value, index) => ({
    x: pad.left + index * step,
    y: pad.top + plotH * (1 - clampScore(value) / 100),
  }));

  const d = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  return { d, coords, plotW, plotH, baselineY: pad.top + plotH };
}

function useRevealAfterLoad(active: boolean, seriesKey: string) {
  const loadingCtx = useContext(PageLoadingContext);
  const pageLoading = loadingCtx?.pageLoading ?? false;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active || pageLoading) {
      setReady(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [active, pageLoading, seriesKey]);

  return ready;
}

export function TrendChart({
  points = [],
  emptyMessage = "No trend data for this range",
  variant = "compact",
  className,
}: TrendChartProps) {
  const size = SIZES[variant];
  const series = points.length === 1 ? [points[0], points[0]] : points;
  const hasData = series.length >= 2;
  const seriesKey = hasData ? series.map((p) => p.toFixed(2)).join(",") : "";
  const ready = useRevealAfterLoad(hasData, seriesKey);
  const lineRef = useRef<SVGPathElement>(null);
  const reactId = useId();

  const { width, height, pad } = size;
  const built = hasData ? buildLine(series, width, height, pad) : null;
  const guides = built ? [0.25, 0.5, 0.75].map((t) => pad.top + built.plotH * (1 - t)) : [];

  useLayoutEffect(() => {
    const node = lineRef.current;
    if (!node || !hasData) return;
    const length = node.getTotalLength();
    node.style.setProperty("--trend-len", `${length}`);
  }, [hasData, seriesKey]);

  const rootClass = [
    "trend-chart",
    variant === "wide" ? "trend-chart--wide" : "trend-chart--compact",
    ready ? "trend-chart--ready" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const end = built?.coords[built.coords.length - 1];

  return (
    <div className={rootClass}>
      <div className="trend-chart__frame">
        <svg
          className="trend-chart__svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={hasData ? "Quality trend" : emptyMessage}
        >
          {built ? (
            <>
              {guides.map((y) => (
                <line
                  key={`${reactId}-g-${y}`}
                  x1={pad.left}
                  x2={pad.left + built.plotW}
                  y1={y}
                  y2={y}
                  className="trend-chart__guide"
                />
              ))}
              <line
                x1={pad.left}
                x2={pad.left + built.plotW}
                y1={built.baselineY}
                y2={built.baselineY}
                className="trend-chart__baseline"
              />
              <path ref={lineRef} d={built.d} className="trend-chart__line" />
              {end ? (
                <circle
                  cx={end.x}
                  cy={end.y}
                  r={variant === "wide" ? 4 : 3.25}
                  className="trend-chart__end"
                />
              ) : null}
            </>
          ) : (
            <text
              x={width / 2}
              y={height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="trend-chart__empty"
            >
              {emptyMessage}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}

/** @deprecated Prefer TrendChart — kept for existing imports. */
export function QualityTrendChart(props: TrendChartProps) {
  return <TrendChart variant="compact" {...props} />;
}

/** @deprecated Prefer TrendChart — kept for existing imports. */
export function PerformanceTrendChart(props: TrendChartProps) {
  return <TrendChart variant="wide" {...props} />;
}
