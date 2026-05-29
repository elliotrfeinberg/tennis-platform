"use client";
// Home / landing — Center Court.
import Link from "next/link";
import type { ReactNode } from "react";
import { Chip } from "@/components/mm/ui";
import * as MM from "@/lib/demo";

function Hero() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 36, alignItems: "stretch" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "8px 0" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <span style={{ width: 7, height: 7, borderRadius: 7, background: "var(--court)" }} />
          <span className="mm-kicker">Updated nightly from TennisLink</span>
        </div>
        <h1 className="mm-disp" style={{ fontSize: 82, textTransform: "uppercase", color: "var(--ink)", margin: 0 }}>
          Your rating,<br /><span style={{ color: "var(--court)" }}>recomputed</span> every night.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.55, color: "var(--ink-2)", maxWidth: 540, marginTop: 22 }}>
          Estimated dynamic NTRP from real league match scores — score-aware, confidence-rated, and refreshed daily. Plus captain tools that find the lineup with the best win probability before you submit it.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
          <Link href="/players" style={{ padding: "14px 24px", borderRadius: 11, background: "var(--court)", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>Find your rating</Link>
          <Link href="/captain" style={{ padding: "14px 22px", borderRadius: 11, background: "transparent", border: "1.5px solid var(--hair)", color: "var(--ink)", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>Captain tools →</Link>
        </div>
        <div style={{ display: "flex", gap: 28, marginTop: 34 }}>
          {[["20,180", "NorCal players"], ["1.4M", "sets scored"], ["~85%", "agree w/ USTA year-end"]].map((s, i) => (
            <div key={i}>
              <div className="mm-num" style={{ fontSize: 30, color: "var(--ink)" }}>{s[0]}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{s[1]}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", borderRadius: 18, background: "var(--hero-bg)", overflow: "hidden", padding: 30, color: "#fff", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 420 }}>
        <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5 }} />
        <svg viewBox="0 0 400 460" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.22 }}>
          <rect x={40} y={20} width={320} height={420} fill="none" stroke="#fff" strokeWidth={2} />
          <line x1={40} y1={230} x2={360} y2={230} stroke="#fff" strokeWidth={2} />
          <line x1={110} y1={120} x2={290} y2={120} stroke="#fff" strokeWidth={1.5} />
          <line x1={110} y1={340} x2={290} y2={340} stroke="#fff" strokeWidth={1.5} />
          <line x1={200} y1={120} x2={200} y2={340} stroke="#fff" strokeWidth={1.5} />
        </svg>
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: "var(--ball)", boxShadow: "0 0 0 4px rgba(215,232,77,.25)" }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.85)" }}>Live perf rating</span>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ball-ink)", background: "var(--ball)", padding: "3px 9px", borderRadius: 100 }}>4.0 BAND</span>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", fontWeight: 600 }}>Marcus Holloway · Cedar Park</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <div className="mm-num" style={{ fontSize: 132, lineHeight: 0.82, color: "#fff" }}>3.94</div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--ball)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 15 }}>
              <svg width={12} height={12} viewBox="0 0 12 12"><path d="M6 1l5 7H1z" fill="currentColor" /></svg>+0.06
            </span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", marginTop: 8 }}>9–4 this season · High confidence · approaching 4.0</div>
        </div>
      </div>
    </div>
  );
}

function Feature({ title, body, icon }: { title: string; body: string; icon: ReactNode }) {
  return (
    <div className="mm-card" style={{ padding: "22px 22px" }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--court-tint)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--court)", marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 16.5, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 8, marginBottom: 0 }}>{body}</p>
    </div>
  );
}

function DistViz() {
  const max = Math.max(...MM.dist.map((d) => d.n));
  return (
    <div className="mm-card" style={{ padding: "24px 28px", display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 36, alignItems: "center" }}>
      <div>
        <div className="mm-kicker">Section snapshot</div>
        <h3 style={{ fontSize: 26, fontWeight: 700, margin: "8px 0 10px", color: "var(--ink)" }}>Where NorCal sits</h3>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>Published NTRP across the section — the bell sits squarely at 3.5–4.0, where league play is thickest.</p>
        <div style={{ marginTop: 16 }}><Chip tone="court">20,180 players rated</Chip></div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 180 }}>
        {MM.dist.map((d) => (
          <div key={d.band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
            <div className="mm-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{d.n.toLocaleString()}</div>
            <div style={{ width: "100%", height: (d.n / max) * 130, borderRadius: "6px 6px 0 0", background: d.band === 4.0 ? "var(--court)" : "var(--court-tint-2)" }} />
            <div className="mm-num" style={{ fontSize: 18, color: d.band === 4.0 ? "var(--court)" : "var(--ink-2)" }}>{d.band.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ic = (d: ReactNode) => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export function Home() {
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "44px 44px 52px", display: "flex", flexDirection: "column", gap: 40 }}>
      <Hero />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
        <Feature title="Daily updates" body="Scores hit TennisLink within hours; ratings recompute every night — not once a month. See exactly how today's match moved your number." icon={ic(<path d="M10 5v5l3 2M10 2a8 8 0 100 16 8 8 0 000-16z" />)} />
        <Feature title="Score-aware model" body="A symmetric perf model reads the scoreline, not just the W. Per-court doubles attribution preserves partner spread across the lineup." icon={ic(<path d="M3 14l4-5 3 3 5-7M3 17h14" />)} />
        <Feature title="Confidence intervals" body="Rating deviation flags new and inactive players as low-confidence. No more single-number lies about who's really a sandbagger." icon={ic(<path d="M10 2l7 4v5c0 4-3 6-7 7-4-1-7-3-7-7V6z" />)} />
      </div>
      <DistViz />
    </div>
  );
}
