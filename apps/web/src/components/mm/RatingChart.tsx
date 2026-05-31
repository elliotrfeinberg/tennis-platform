"use client";

// Interactive perf-rating-over-time chart. NTRP band shading + dashed midpoint
// (tied to the published/Adult band), W/L-colored markers, hover guide +
// tooltip with each player's snapshotted pre-match rating.
//
// Renders ONE LINE PER CATEGORY (Adult / Mixed), because those are independent
// NTRP rating tracks — interleaving them on a single line shows volatility that
// isn't real. The x-axis is time-based so multiple series with different match
// dates align on the same scale. Colors come from theme CSS vars.

import { useEffect, useRef, useState } from "react";
import { fmtDate, score, type Named } from "@/lib/demo";

export interface ChartPoint {
  date: string;
  post: number;
  // The player's individual performance rating for this match (the point's
  // contribution to the rolling rating). Null only for no-impact matches.
  perf?: number | null;
  won: boolean;
  kind: "S" | "D";
  line: number;
  opp: Named[];
  partner?: Named;
  sets: Array<[number, number]>;
}

export interface ChartSeries {
  key: string; // e.g. "adult" | "mixed"
  label: string; // e.g. "Adult" | "Mixed"
  color: string; // CSS var, e.g. "var(--court)"
  points: ChartPoint[];
}

const PADT = 18, PADB = 34, PADL = 6;
const ts = (d: string) => new Date(d).getTime();

export function RatingChart({
  series,
  bandLow,
  bandHigh,
  midpoint,
  height = 270,
}: {
  series: ChartSeries[];
  bandLow: number;
  bandHigh: number;
  midpoint: number;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(640); // measured below; safe pre-measure default
  const [hover, setHover] = useState<number | null>(null);

  // Render at the container's REAL pixel size (no non-uniform SVG stretch), so
  // markers stay round and spacing is true at any width. The old fixed
  // 1000×300 viewBox + preserveAspectRatio="none" squished the chart on the
  // narrow mobile frame; measuring the container fixes that.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clean + sort each series by date; drop empties.
  const lines = series
    .map((s) => ({
      ...s,
      points: s.points
        .filter((m) => m.post != null && m.date)
        .sort((a, b) => ts(a.date) - ts(b.date)),
    }))
    .filter((s) => s.points.length > 0);

  // Flattened points (with their series identity) for hover + domain calc.
  const flat = lines.flatMap((s, si) =>
    s.points.map((m) => ({ m, si, color: s.color, label: s.label }))
  );

  if (flat.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 14 }}>
        No rated matches yet.
      </div>
    );
  }

  const W = w;
  const H = height;
  const narrow = W < 480;
  const PADR = narrow ? 46 : 92;

  const times = flat.map((f) => ts(f.m.date));
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const posts = flat.map((f) => f.m.post);
  const yMin = Math.min(bandLow, ...posts) - 0.05;
  const yMax = Math.max(bandHigh, ...posts) + 0.05;

  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;
  const xAt = (t: number) =>
    PADL + (tMax === tMin ? plotW / 2 : ((t - tMin) / (tMax - tMin)) * plotW);
  const yAt = (v: number) => PADT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const bandTop = yAt(bandHigh);
  const bandBot = yAt(bandLow);
  const mid = yAt(midpoint);

  // y gridlines spanning the band
  const ticks: number[] = [];
  for (let t = Math.ceil(yMin * 10) / 10; t <= yMax; t += 0.1) ticks.push(Math.round(t * 10) / 10);

  // ~5 evenly spaced date labels across the time range
  const nx = narrow ? 3 : 5;
  const xTicks: number[] =
    tMax === tMin ? [tMin] : Array.from({ length: nx }, (_, i) => tMin + ((tMax - tMin) * i) / (nx - 1));

  const onMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    let best = 0, bd = Infinity;
    flat.forEach((f, k) => {
      const dx = xAt(ts(f.m.date)) - px;
      const dy = yAt(f.m.post) - py;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    });
    setHover(best);
  };

  const h = hover != null ? flat[hover] : null;
  const single = lines.length === 1;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      {lines.length > 1 && (
        <div style={{ position: "absolute", top: 0, right: PADR / W * 100 + "%", display: "flex", gap: 16, zIndex: 4, fontSize: 12, fontFamily: "var(--font-body)", fontWeight: 600 }}>
          {lines.map((s) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-2)" }}>
              <span style={{ width: 16, height: 3, borderRadius: 2, background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg
        ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
      >
        <rect x={PADL} y={bandTop} width={plotW} height={bandBot - bandTop} style={{ fill: "var(--court)", opacity: 0.08 }} />
        <line x1={PADL} x2={PADL + plotW} y1={bandTop} y2={bandTop} style={{ stroke: "var(--court)", opacity: 0.5 }} strokeWidth={1} strokeDasharray="2 4" />
        {ticks.map((g) => (
          <line key={g} x1={PADL} x2={PADL + plotW} y1={yAt(g)} y2={yAt(g)} style={{ stroke: "var(--ink)", opacity: 0.06 }} strokeWidth={1} />
        ))}
        {ticks.map((g) => (
          <text key={"t" + g} x={PADL + plotW + (narrow ? 6 : 10)} y={yAt(g) + 4} style={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: narrow ? 11 : 13 }}>{g.toFixed(1)}</text>
        ))}
        <line x1={PADL} x2={PADL + plotW} y1={mid} y2={mid} style={{ stroke: "var(--court)", opacity: 0.55 }} strokeWidth={1.5} strokeDasharray="6 5" />
        <text x={PADL + 6} y={mid - 7} style={{ fill: "var(--court)", fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 12, letterSpacing: ".08em", opacity: 0.85 }}>
          {narrow ? `MID ${midpoint.toFixed(2)}` : `BAND MIDPOINT ${midpoint.toFixed(2)}`}
        </text>

        {/* per-series area (single series only — keeps the polish without clutter) + line */}
        {lines.map((s) => {
          const d = s.points.map((m, k) => `${k === 0 ? "M" : "L"} ${xAt(ts(m.date)).toFixed(1)} ${yAt(m.post).toFixed(1)}`).join(" ");
          const area = single
            ? `${d} L ${xAt(ts(s.points[s.points.length - 1]!.date)).toFixed(1)} ${yAt(yMin).toFixed(1)} L ${xAt(ts(s.points[0]!.date)).toFixed(1)} ${yAt(yMin).toFixed(1)} Z`
            : null;
          return (
            <g key={s.key}>
              {area && <path d={area} style={{ fill: s.color, opacity: 0.07 }} />}
              <path d={d} fill="none" style={{ stroke: s.color }} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {/* "current" ring on the latest point of each track */}
              <circle cx={xAt(ts(s.points[s.points.length - 1]!.date))} cy={yAt(s.points[s.points.length - 1]!.post)} r={8} fill="none" style={{ stroke: s.color }} strokeWidth={3} opacity={0.6} />
            </g>
          );
        })}

        {h && (
          <line x1={xAt(ts(h.m.date))} x2={xAt(ts(h.m.date))} y1={PADT - 6} y2={PADT + plotH} style={{ stroke: "var(--ink)", opacity: 0.25 }} strokeWidth={1} />
        )}
        {flat.map((f, k) => (
          <circle key={k} cx={xAt(ts(f.m.date))} cy={yAt(f.m.post)} r={hover === k ? 6 : 4}
            style={{ fill: f.m.won ? "var(--win)" : "var(--loss)", stroke: "var(--card)", transition: "r .1s" }} strokeWidth={2} />
        ))}

        {xTicks.map((t, i) => (
          <text key={"x" + i} x={Math.min(Math.max(xAt(t), PADL + 24), PADL + plotW - 24)} y={H - 10} textAnchor="middle" style={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: narrow ? 11 : 12 }}>
            {fmtDate(new Date(t).toISOString().slice(0, 10))}
          </text>
        ))}
      </svg>
      {h && <Tooltip m={h.m} catLabel={lines.length > 1 ? h.label : undefined} color={h.color} x={(xAt(ts(h.m.date)) / W) * 100} />}
    </div>
  );
}

function Tooltip({ m, catLabel, color, x }: { m: ChartPoint; catLabel?: string; color: string; x: number }) {
  const left = x > 62 ? `calc(${x}% - 12px)` : `calc(${x}% + 12px)`;
  const tx = x > 62 ? "translateX(-100%)" : "none";
  return (
    <div style={{ position: "absolute", top: 8, left, transform: tx, pointerEvents: "none", background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 10, boxShadow: "var(--shadow)", padding: "10px 13px", minWidth: 200, maxWidth: 360, zIndex: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDate(m.date)}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {catLabel && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color }}>{catLabel.toUpperCase()}</span>}
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, color: m.won ? "var(--win)" : "var(--loss)" }}>{m.won ? "WON" : "LOST"}</span>
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, lineHeight: 1.4, color: "var(--ink)", whiteSpace: "nowrap" }}>
        {`${m.kind}${m.line} · `}
        {m.opp.map((o, j) => (
          <span key={j}>
            {j > 0 && <span style={{ color: "var(--muted)", fontWeight: 500 }}> / </span>}
            {o[0]}
            <span className="mm-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)", marginLeft: 4 }}>{o[1] != null ? o[1].toFixed(2) : "—"}</span>
          </span>
        ))}
      </div>
      {m.partner && (
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2, whiteSpace: "nowrap" }}>
          with {m.partner[0]}
          <span className="mm-mono" style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>{m.partner[1] != null ? m.partner[1].toFixed(2) : "—"}</span>
        </div>
      )}
      <div className="mm-mono" style={{ fontSize: 13, marginTop: 3, color: "var(--ink-2)" }}>{score(m.sets)}</div>
      <div style={{ marginTop: 8, borderTop: "1px solid var(--hair-2)", paddingTop: 7, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Match perf</span>
          <span className="mm-mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>{m.perf != null ? m.perf.toFixed(2) : "—"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Rating after</span>
          <span className="mm-num" style={{ fontSize: 17, color }}>{m.post.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
