type QualityTrendChartProps = {
  points?: number[];
  labels?: string[];
};

const WIDTH = 560;
const HEIGHT = 140;
const PAD = { top: 8, right: 12, bottom: 18, left: 32 };

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

export function QualityTrendChart({
  points = [],
  labels = [],
}: QualityTrendChartProps) {
  const hasData = points.length >= 2;
  const guides = [0, 25, 50, 75, 100];
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const paths = hasData ? buildPath(points) : null;
  const xLabels = hasData && labels.length ? labels : ["", "", "", "", ""];

  return (
    <div className="quality-trend">
      <div className="quality-trend__chart-wrap">
        <svg
          className="quality-trend__svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={hasData ? "Quality trend chart" : "Quality trend chart with no data"}
        >
          {/* Plot frame */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            className="quality-trend__plot"
          />

          {guides.map((value) => {
            const y = PAD.top + plotH * (1 - value / 100);
            return (
              <g key={value}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={y}
                  y2={y}
                  className="quality-trend__guide"
                />
                <text
                  x={PAD.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="quality-trend__axis-label"
                >
                  {value}%
                </text>
              </g>
            );
          })}

          {hasData && paths ? (
            <>
              <path d={paths.area} className="quality-trend__area" />
              <path d={paths.line} className="quality-trend__line" />
              {points.map((value, index) => {
                const step = plotW / (points.length - 1);
                const x = PAD.left + index * step;
                const y = PAD.top + plotH * (1 - Math.min(100, Math.max(0, value)) / 100);
                return (
                  <circle
                    key={`${value}-${index}`}
                    cx={x}
                    cy={y}
                    r="3.25"
                    className="quality-trend__dot"
                  />
                );
              })}
            </>
          ) : (
            <text
              x={PAD.left + plotW / 2}
              y={PAD.top + plotH / 2 + 4}
              textAnchor="middle"
              className="quality-trend__empty-text"
            >
              No quality data for this range
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
                y={HEIGHT - 6}
                textAnchor="middle"
                className="quality-trend__axis-label"
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
