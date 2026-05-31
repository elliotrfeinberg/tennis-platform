"use client";
// Mobile Home — featured top player, headline, stat tiles, feature cards,
// distribution. Fed the same HomeView the desktop Home consumes.
import Link from "next/link";
import type { HomeView } from "@/components/mm/screens/Home";
import { MHero, Icon } from "./shell";

const FEATURES: Array<[string, string]> = [
  ["Daily updates", "Ratings recompute every night — not once a month."],
  ["Score-aware model", "Reads the scoreline, not just the W. Per-court doubles attribution."],
  ["Confidence intervals", "Match-count confidence flags new and inactive players."],
];

export function MobileHome({ view }: { view: HomeView }) {
  const t = view.top;
  const max = Math.max(1, ...view.dist.map((d) => d.count));
  return (
    <div className="mm-mscreen">
      <MHero kicker="Top perf rating" pad="20px 22px">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.82)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t ? t.name : "—"}</div>
            <div className="mm-num" style={{ fontSize: 78, lineHeight: 0.85, color: "#fff", marginTop: 2 }}>{t?.perf != null ? t.perf.toFixed(2) : "—"}</div>
          </div>
          {t?.band != null && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--on-ball)", background: "var(--ball)", padding: "4px 9px", borderRadius: 100, whiteSpace: "nowrap" }}>{t.band.toFixed(1)} BAND</span>
          )}
        </div>
        {t && (
          <Link href={`/players/${t.id}` as never} style={{ display: "inline-block", marginTop: 8, fontSize: 13, color: "var(--ball)", fontWeight: 700, textDecoration: "none" }}>View profile →</Link>
        )}
      </MHero>

      <h1 className="mm-disp" style={{ fontSize: 38, textTransform: "uppercase", color: "var(--ink)", margin: "4px 2px 0", lineHeight: 1.04 }}>
        Your rating, <span style={{ color: "var(--court)" }}>recomputed</span> nightly.
      </h1>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)", margin: "0 2px" }}>
        Estimated dynamic NTRP from real league scores — score-aware, confidence-rated, refreshed daily.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <Link href="/players" style={{ flex: 1, padding: 13, borderRadius: 11, background: "var(--court)", color: "#fff", fontSize: 14.5, fontWeight: 700, textAlign: "center", textDecoration: "none" }}>Find your rating</Link>
        <Link href="/captain" style={{ padding: "13px 16px", borderRadius: 11, background: "var(--card)", border: "1.5px solid var(--hair)", color: "var(--ink)", fontSize: 14.5, fontWeight: 700, textDecoration: "none" }}>Captain</Link>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {[[view.total.toLocaleString("en-US"), "players"], [view.rated.toLocaleString("en-US"), "rated"], ["Nightly", "refresh"]].map((s, i) => (
          <div key={i} className="mm-card" style={{ flex: 1, padding: "12px 12px" }}>
            <div className="mm-num" style={{ fontSize: 22, color: "var(--ink)" }}>{s[0]}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{s[1]}</div>
          </div>
        ))}
      </div>

      {view.dist.length > 0 && (
        <div className="mm-card" style={{ padding: "16px 18px" }}>
          <div className="mm-kicker">Where NorCal sits</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginTop: 12 }}>
            {view.dist.map((d) => (
              <div key={d.band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                <div style={{ width: "100%", height: (d.count / max) * 88, borderRadius: "5px 5px 0 0", background: "var(--court-tint-2)" }} />
                <div className="mm-num" style={{ fontSize: 14, color: "var(--ink-2)" }}>{d.band.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {FEATURES.map((f, i) => (
        <div key={i} className="mm-card" style={{ padding: "14px 16px", display: "flex", gap: 13, alignItems: "flex-start" }}>
          <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: "var(--court-tint)", color: "var(--court)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={18} /></div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{f[0]}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45, marginTop: 2 }}>{f[1]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
