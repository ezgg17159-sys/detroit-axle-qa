type PerformanceTrendChartProps = {
  points?: number[];
  labels?: string[];
  emptyMessage?: string;
};

const WIDTH = 960;
const HEIGHT = 300;
const PAD = { top: 16, right: 24, bottom: 36, left: 52 };

function buildPath(points: number[]): { line: string; area: string } {
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;

  const coords = points.map((value, index) => {
    const x = PAD.left + index * step;
    const y = PAD.top + plotH * (1 - Math.min(100, Math.max(0, value)) / 100);
    return { x, y };
  });

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${line} L ${last.x.toFixed(2)} ${(PAD.top + plotH).toFixed(2)} L ${first.x.toFixed(2)} ${(PAD.top + plotH).toFixed(2)} Z`;

  return { line, area };
}

export function PerformanceTrendChart({
  points = [],
  labels = [],
  emptyMessage = "No performance data for this range",
}: PerformanceTrendChartProps) {
  const hasData = points.length >= 2;
  const guides = [0, 25, 50, 75, 100];
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const paths = hasData ? buildPath(points) : null;
  const xLabels = hasData && labels.length ? labels : [];

  return (
    <div className="performance-trend">
      <svg
        className="performance-trend__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={hasData ? "Performance trend chart" : "Performance trend chart with no data"}
      >
        {guides.map((value) => {
          const y = PAD.top + plotH * (1 - value / 100);
          return (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y}
                y2={y}
                className="performance-trend__guide"
              />
              <text
                x={PAD.left - 12}
                y={y + 4}
                textAnchor="end"
                className="performance-trend__axis-label"
              >
                {value}%
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={PAD.left}
          y1={PAD.top}
          y2={PAD.top + plotH}
          className="performance-trend__axis"
        />
        <line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          className="performance-trend__axis"
        />

        {hasData && paths ? (
          <>
            <path d={paths.area} className="performance-trend__area" />
            <path d={paths.line} className="performance-trend__line" />
            {points.map((value, index) => {
              const step = plotW / (points.length - 1);
              const x = PAD.left + index * step;
              const y = PAD.top + plotH * (1 - Math.min(100, Math.max(0, value)) / 100);
              return (
                <circle
                  key={`${value}-${index}`}
                  cx={x}
                  cy={y}
                  r="4"
                  className="performance-trend__dot"
                />
              );
            })}
          </>
        ) : (
          <text
            x={PAD.left + plotW / 2}
            y={PAD.top + plotH / 2 + 5}
            textAnchor="middle"
            className="performance-trend__empty-text"
          >
            {emptyMessage}
          </text>
        )}

        {xLabels.map((label, index, arr) => {
          if (!label) return null;
          const step = arr.length > 1 ? plotW / (arr.length - 1) : 0;
          const x = PAD.left + index * step;
          return (
            <text
              key={`${label}-${index}`}
              x={x}
              y={HEIGHT - 10}
              textAnchor="middle"
              className="performance-trend__axis-label"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
