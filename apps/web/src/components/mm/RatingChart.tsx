"use client";

// Interactive perf-rating-over-time chart: NTRP band shading, dashed midpoint,
// gridlines, W/L-colored markers, hover guide + tooltip (with each player's
// snapshotted pre-match rating). Colors come from theme CSS vars so it reskins
// per light/dark. Ported + generalized from the design bundle's chart.jsx.

import { useRef, useState } from "react";
import { fmtDate, score, type Named } from "@/lib/demo";

export interface ChartPoint {
  date: string;
  post: number;
  won: boolean;
  kind: "S" | "D";
  line: number;
  opp: Named[];
  partner?: Named;
  sets: Array<[number, number]>;
}

const W = 1000, H = 300;
const PADT = 18, PADB = 34, PADL = 6, PADR = 92;

export function RatingChart({
  series,
  bandLow,
  bandHigh,
  midpoint,
  height = 270,
}: {
  series: ChartPoint[];
  bandLow: number;
  bandHigh: number;
  midpoint: number;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const pts = series.filter((m) => m.post != null);
  const posts = pts.map((m) => m.post);
  const yMin = Math.min(bandLow, ...posts) - 0.05;
  const yMax = Math.max(bandHigh, ...posts) + 0.05;

  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;
  const xAt = (idx: number) =>
    PADL + (pts.length <= 1 ? plotW / 2 : (idx / (pts.length - 1)) * plotW);
  const yAt = (v: number) => PADT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  if (pts.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 14 }}>
        No rated matches yet.
      </div>
    );
  }

  const line = pts.map((m, k) => `${k === 0 ? "M" : "L"} ${xAt(k).toFixed(1)} ${yAt(m.post).toFixed(1)}`).join(" ");
  const area = `${line} L ${xAt(pts.length - 1).toFixed(1)} ${yAt(yMin).toFixed(1)} L ${xAt(0).toFixed(1)} ${yAt(yMin).toFixed(1)} Z`;

  const bandTop = yAt(bandHigh);
  const bandBot = yAt(bandLow);
  const mid = yAt(midpoint);

  // evenly spaced gridlines spanning the band
  const ticks: number[] = [];
  for (let t = Math.ceil(yMin * 10) / 10; t <= yMax; t += 0.1) ticks.push(Math.round(t * 10) / 10);

  const onMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach((_, k) => { const d = Math.abs(xAt(k) - px); if (d < bd) { bd = d; best = k; } });
    setHover(best);
  };

  const h = hover != null ? pts[hover] : null;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={height}
        preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
      >
        <rect x={PADL} y={bandTop} width={plotW} height={bandBot - bandTop} style={{ fill: "var(--court)", opacity: 0.08 }} />
        <line x1={PADL} x2={PADL + plotW} y1={bandTop} y2={bandTop} style={{ stroke: "var(--court)", opacity: 0.5 }} strokeWidth={1} strokeDasharray="2 4" />
        {ticks.map((g) => (
          <line key={g} x1={PADL} x2={PADL + plotW} y1={yAt(g)} y2={yAt(g)} style={{ stroke: "var(--ink)", opacity: 0.06 }} strokeWidth={1} />
        ))}
        {ticks.map((g) => (
          <text key={"t" + g} x={PADL + plotW + 10} y={yAt(g) + 4} style={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 13 }}>{g.toFixed(1)}</text>
        ))}
        <line x1={PADL} x2={PADL + plotW} y1={mid} y2={mid} style={{ stroke: "var(--court)", opacity: 0.55 }} strokeWidth={1.5} strokeDasharray="6 5" />
        <text x={PADL + 6} y={mid - 7} style={{ fill: "var(--court)", fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 12, letterSpacing: ".08em", opacity: 0.85 }}>
          {`BAND MIDPOINT ${midpoint.toFixed(2)}`}
        </text>
        <path d={area} style={{ fill: "var(--court)", opacity: 0.07 }} />
        <path d={line} fill="none" style={{ stroke: "var(--court)" }} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {h && (
          <line x1={xAt(hover!)} x2={xAt(hover!)} y1={PADT - 6} y2={PADT + plotH} style={{ stroke: "var(--ink)", opacity: 0.25 }} strokeWidth={1} />
        )}
        {pts.map((m, k) => (
          <circle key={k} cx={xAt(k)} cy={yAt(m.post)} r={hover === k ? 6 : 4}
            style={{ fill: m.won ? "var(--win)" : "var(--loss)", stroke: "var(--card)", transition: "r .1s" }} strokeWidth={2} />
        ))}
        <circle cx={xAt(pts.length - 1)} cy={yAt(pts[pts.length - 1]!.post)} r={8} fill="none" style={{ stroke: "var(--ball)" }} strokeWidth={3} />
        {pts.map((m, k) =>
          (k % 3 === 0 || k === pts.length - 1) ? (
            <text key={"x" + k} x={xAt(k)} y={H - 10} textAnchor="middle" style={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtDate(m.date)}</text>
          ) : null
        )}
      </svg>
      {h && <Tooltip m={h} x={(xAt(hover!) / W) * 100} />}
    </div>
  );
}

function Tooltip({ m, x }: { m: ChartPoint; x: number }) {
  const left = x > 62 ? `calc(${x}% - 12px)` : `calc(${x}% + 12px)`;
  const tx = x > 62 ? "translateX(-100%)" : "none";
  return (
    <div style={{ position: "absolute", top: 8, left, transform: tx, pointerEvents: "none", background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 10, boxShadow: "var(--shadow)", padding: "10px 13px", minWidth: 200, maxWidth: 360, zIndex: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDate(m.date)}</span>
        <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, color: m.won ? "var(--win)" : "var(--loss)" }}>{m.won ? "WON" : "LOST"}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, lineHeight: 1.4, color: "var(--ink)", whiteSpace: "nowrap" }}>
        {`${m.kind}${m.line} · `}
        {m.opp.map((o, j) => (
          <span key={j}>
            {j > 0 && <span style={{ color: "var(--muted)", fontWeight: 500 }}> / </span>}
            {o[0]}
            <span className="mm-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)", marginLeft: 4 }}>{o[1].toFixed(2)}</span>
          </span>
        ))}
      </div>
      {m.partner && (
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2, whiteSpace: "nowrap" }}>
          with {m.partner[0]}
          <span className="mm-mono" style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>{m.partner[1].toFixed(2)}</span>
        </div>
      )}
      <div className="mm-mono" style={{ fontSize: 13, marginTop: 3, color: "var(--ink-2)" }}>{score(m.sets)}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, borderTop: "1px solid var(--hair-2)", paddingTop: 7 }}>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>Rating after</span>
        <span className="mm-num" style={{ fontSize: 17, color: "var(--court)" }}>{m.post.toFixed(2)}</span>
      </div>
    </div>
  );
}
