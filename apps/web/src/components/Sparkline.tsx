// Pure SVG sparkline — no client JS needed. Renders a series of
// (x, y) points as a stroke; optionally a fill below the line, a
// trailing dot, and reference axes (e.g. NTRP band midpoint).

export interface SparklinePoint {
  // Used to space points along the x axis. Equal-spaced if all values are
  // the same. For a time series, pass dates as milliseconds since epoch.
  x: number;
  // The plotted value.
  y: number;
  // Optional label shown on hover (browser tooltip via <title>).
  label?: string;
}

export interface SparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  // Padding inside the viewbox so the stroke isn't clipped at the edges.
  pad?: number;
  // y-axis range. If omitted, derived from the data with a small margin.
  yMin?: number;
  yMax?: number;
  stroke?: string;
  fill?: string;
  // Reference lines drawn behind the stroke (e.g. NTRP band midpoint).
  // Each value is a y in the same units as data.
  yRefs?: Array<{ y: number; color?: string; label?: string }>;
  // Show a dot at the last point.
  showLastDot?: boolean;
  // Optional aria-label.
  ariaLabel?: string;
}

export function Sparkline({
  data,
  width = 360,
  height = 80,
  pad = 6,
  yMin,
  yMax,
  stroke = "#0d7a4d", // court-700-ish green
  fill = "rgba(13, 122, 77, 0.08)",
  yRefs = [],
  showLastDot = true,
  ariaLabel,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel ?? "Empty sparkline"}
      >
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fontSize="11"
          fill="#9ca3af"
        >
          no match history
        </text>
      </svg>
    );
  }

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = xMax - xMin || 1;
  const yLo = yMin ?? Math.min(...ys, ...yRefs.map((r) => r.y)) - 0.05;
  const yHi = yMax ?? Math.max(...ys, ...yRefs.map((r) => r.y)) + 0.05;
  const ySpan = yHi - yLo || 1;

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const toX = (x: number): number => pad + ((x - xMin) / xSpan) * innerW;
  const toY = (y: number): number => pad + innerH - ((y - yLo) / ySpan) * innerH;

  // Path string for the line.
  let linePath = "";
  for (let i = 0; i < data.length; i++) {
    const p = data[i]!;
    linePath += `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)} `;
  }

  // Closed path for fill below the line.
  const fillPath =
    data.length > 1
      ? linePath +
        `L ${toX(xMax).toFixed(1)} ${toY(yLo).toFixed(1)} ` +
        `L ${toX(xMin).toFixed(1)} ${toY(yLo).toFixed(1)} Z`
      : "";

  const last = data[data.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? "Sparkline"}
    >
      {yRefs.map((r, i) => {
        const y = toY(r.y);
        return (
          <g key={i}>
            <line
              x1={pad}
              x2={width - pad}
              y1={y}
              y2={y}
              stroke={r.color ?? "#d6d3d1"}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {r.label && (
              <text
                x={width - pad}
                y={y - 2}
                textAnchor="end"
                fontSize="9"
                fill="#9ca3af"
              >
                {r.label}
              </text>
            )}
          </g>
        );
      })}
      {fillPath && <path d={fillPath} fill={fill} />}
      <path
        d={linePath}
        stroke={stroke}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLastDot && (
        <circle cx={toX(last.x)} cy={toY(last.y)} r={2.5} fill={stroke} />
      )}
      {data.map((p, i) =>
        p.label ? (
          <title key={i}>{p.label}</title>
        ) : null
      )}
    </svg>
  );
}
