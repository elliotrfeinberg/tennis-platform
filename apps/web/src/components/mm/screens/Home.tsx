"use client";
// Home / landing — Center Court. Headline stats, distribution, and the
// featured rating card are wired to real section data via props.
import Link from "next/link";
import type { ReactNode } from "react";
import { Chip } from "@/components/mm/ui";

export interface HomeView {
  total: number;
  rated: number;
  dist: { band: number; count: number }[];
  top: { id: string; name: string; perf: number | null; band: number | null } | null;
}

function Hero({ v }: { v: HomeView }) {
  const t = v.top;
  return (
    <div className="mm-stack" style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 36, alignItems: "stretch" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "8px 0" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <span style={{ width: 7, height: 7, borderRadius: 7, background: "var(--court)" }} />
          <span className="mm-kicker">Updated nightly from TennisLink</span>
        </div>
        <h1 className="mm-disp" style={{ fontSize: "clamp(38px, 8.5vw, 82px)", textTransform: "uppercase", color: "var(--ink)", margin: 0 }}>
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
          {[
            [v.total.toLocaleString("en-US"), "NorCal players"],
            [v.rated.toLocaleString("en-US"), "players rated"],
            ["Nightly", "rating refresh"],
          ].map((s, i) => (
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
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.85)" }}>Top perf rating</span>
          </div>
          {t?.band != null && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ball-ink)", background: "var(--ball)", padding: "3px 9px", borderRadius: 100 }}>{t.band.toFixed(1)} BAND</span>}
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", fontWeight: 600 }}>{t ? t.name : "—"} · USTA NorCal</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <div className="mm-num" style={{ fontSize: "clamp(72px, 20vw, 132px)", lineHeight: 0.82, color: "#fff" }}>{t?.perf != null ? t.perf.toFixed(2) : "—"}</div>
          </div>
          {t && (
            <Link href={`/players/${t.id}` as never} style={{ fontSize: 13, color: "var(--ball)", fontWeight: 700, textDecoration: "none" }}>View profile →</Link>
          )}
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

function DistViz({ v }: { v: HomeView }) {
  const max = Math.max(1, ...v.dist.map((d) => d.count));
  return (
    <div className="mm-card mm-stack" style={{ padding: "24px 28px", display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 36, alignItems: "center" }}>
      <div>
        <div className="mm-kicker">Section snapshot</div>
        <h3 style={{ fontSize: 26, fontWeight: 700, margin: "8px 0 10px", color: "var(--ink)" }}>Where NorCal sits</h3>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>Published NTRP across the section — league play is thickest in the middle of the curve.</p>
        <div style={{ marginTop: 16 }}><Chip tone="court">{v.total.toLocaleString("en-US")} players rated</Chip></div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 180 }}>
        {v.dist.map((d) => (
          <div key={d.band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
            <div className="mm-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{d.count.toLocaleString("en-US")}</div>
            <div style={{ width: "100%", height: (d.count / max) * 130, borderRadius: "6px 6px 0 0", background: "var(--court-tint-2)" }} />
            <div className="mm-num" style={{ fontSize: 18, color: "var(--ink-2)" }}>{d.band.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ic = (d: ReactNode) => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export function Home({ view }: { view: HomeView }) {
  return (
    <div className="mm-screen" style={{ maxWidth: 1320, margin: "0 auto", padding: "44px 44px 52px", display: "flex", flexDirection: "column", gap: 40 }}>
      <Hero v={view} />
      <div className="mm-stack" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
        <Feature title="Daily updates" body="Scores hit TennisLink within hours; ratings recompute every night — not once a month. See exactly how today's match moved your number." icon={ic(<path d="M10 5v5l3 2M10 2a8 8 0 100 16 8 8 0 000-16z" />)} />
        <Feature title="Score-aware model" body="A symmetric perf model reads the scoreline, not just the W. Per-court doubles attribution preserves partner spread across the lineup." icon={ic(<path d="M3 14l4-5 3 3 5-7M3 17h14" />)} />
        <Feature title="Confidence intervals" body="Match-count confidence flags new and inactive players as low-confidence. No more single-number lies about who's really a sandbagger." icon={ic(<path d="M10 2l7 4v5c0 4-3 6-7 7-4-1-7-3-7-7V6z" />)} />
      </div>
      <DistViz v={view} />
    </div>
  );
}
