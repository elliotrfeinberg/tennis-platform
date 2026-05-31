"use client";
// Mobile Ratings — scope total hero, distribution bars, coverage %, top list.
import Link from "next/link";
import type { RatingsView } from "@/components/mm/screens/Ratings";
import { Avatar } from "@/components/mm/ui";
import { MHero, MSectionTitle } from "./shell";

export function MobileRatings({ view }: { view: RatingsView }) {
  const v = view;
  const max = Math.max(1, ...v.dist.map((d) => d.count));
  const pct = v.total ? Math.round((v.rated / v.total) * 100) : 0;
  return (
    <div className="mm-mscreen">
      <MHero kicker="Performance NTRP">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
          <div className="mm-num" style={{ fontSize: 44, color: "#fff", lineHeight: 1 }}>{v.total.toLocaleString("en-US")}</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", fontWeight: 600 }}>players in scope</div>
        </div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.82)", marginTop: 8, lineHeight: 1.45 }}>Score-aware dynamic ratings, recomputed every night.</div>
      </MHero>

      <div className="mm-card" style={{ padding: "16px 18px" }}>
        <div className="mm-kicker">Distribution</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 130, marginTop: 12 }}>
          {v.dist.map((d) => (
            <div key={d.band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
              <div className="mm-mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>{d.count.toLocaleString("en-US")}</div>
              <div style={{ width: "100%", height: (d.count / max) * 92, borderRadius: "5px 5px 0 0", background: "var(--court-tint-2)" }} />
              <div className="mm-num" style={{ fontSize: 14, color: "var(--ink-2)" }}>{d.band.toFixed(1)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mm-card" style={{ padding: "16px 18px" }}>
        <div className="mm-kicker">Perf-rating coverage</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          <span className="mm-num" style={{ fontSize: 46, color: "var(--court)" }}>{pct}%</span>
          <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>have a perf rating</span>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--court-tint)" }}>
            <div className="mm-num" style={{ fontSize: 22, color: "var(--court)" }}>{v.rated.toLocaleString("en-US")}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Players rated</div>
          </div>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--paper)", border: "1px solid var(--hair)" }}>
            <div className="mm-num" style={{ fontSize: 22, color: "var(--ink)" }}>Nightly</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Recompute</div>
          </div>
        </div>
      </div>

      <MSectionTitle>Top perf ratings</MSectionTitle>
      <div className="mm-card" style={{ overflow: "hidden" }}>
        {v.topRated.length === 0 ? (
          <div style={{ padding: "22px 16px", color: "var(--muted)", fontSize: 13.5 }}>No perf ratings yet — crawl some flights first.</div>
        ) : v.topRated.map((m, i) => (
          <Link key={m.id} href={`/players/${m.id}` as never} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderTop: i ? "1px solid var(--hair-2)" : "none", textDecoration: "none" }}>
            <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)", width: 18 }}>{i + 1}</span>
            <Avatar name={m.name} />
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
            {m.band != null && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", background: "var(--hair-2)", padding: "2px 7px", borderRadius: 6 }}>{m.band.toFixed(1)}</span>}
            <span className="mm-num" style={{ fontSize: 18, color: "var(--court)", width: 50, textAlign: "right" }}>{m.perf.toFixed(2)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
