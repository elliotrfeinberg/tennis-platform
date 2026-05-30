"use client";
// Ratings overview — Center Court. Prop-driven from real DB aggregates.
import Link from "next/link";
import { PageHero, Avatar } from "@/components/mm/ui";

export interface RatingsView {
  dist: { band: number; count: number }[];
  total: number;
  rated: number;
  topRated: Array<{ id: string; name: string; perf: number; band: number | null }>;
}

function Distribution({ v }: { v: RatingsView }) {
  const max = Math.max(1, ...v.dist.map((d) => d.count));
  return (
    <div className="mm-card" style={{ padding: "22px 26px", flex: "1.6 1 0" }}>
      <div className="mm-kicker">Published NTRP distribution</div>
      <h3 style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 18px", color: "var(--ink)" }}>Where the section sits</h3>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 180 }}>
        {v.dist.map((d) => (
          <div key={d.band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
            <div className="mm-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{d.count.toLocaleString("en-US")}</div>
            <div style={{ width: "100%", height: (d.count / max) * 128, borderRadius: "6px 6px 0 0", background: "var(--court-tint-2)" }} />
            <div className="mm-num" style={{ fontSize: 18, color: "var(--ink-2)" }}>{d.band.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoverageCard({ v }: { v: RatingsView }) {
  const pct = v.total ? Math.round((v.rated / v.total) * 100) : 0;
  return (
    <div className="mm-card" style={{ padding: "22px 24px", flex: "1 1 0", display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="mm-kicker">Perf-rating coverage</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
          <span className="mm-num" style={{ fontSize: 52, color: "var(--court)" }}>{pct}%</span>
          <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>of players have a perf rating</span>
        </div>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>
        Coverage grows as more flights are crawled. Score-aware dynamic ratings carry over year-to-year (clamped into each new band) and are recomputed nightly.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
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
  );
}

function TopRated({ v }: { v: RatingsView }) {
  return (
    <div className="mm-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "15px 20px", borderBottom: "1px solid var(--hair)", fontSize: 15, fontWeight: 700 }}>Top perf ratings</div>
      {v.topRated.length === 0 ? (
        <div style={{ padding: "24px 20px", color: "var(--muted)", fontSize: 13.5 }}>No perf ratings yet — crawl some flights first.</div>
      ) : v.topRated.map((m, i) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
          <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)", width: 22 }}>{i + 1}</span>
          <Avatar name={m.name} />
          <Link href={`/players/${m.id}` as never} style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13.5, color: "var(--ink)", textDecoration: "none" }}>{m.name}</Link>
          {m.band != null && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", background: "var(--hair-2)", padding: "2px 7px", borderRadius: 6 }}>{m.band.toFixed(1)}</span>}
          <span className="mm-num" style={{ fontSize: 18, color: "var(--court)", width: 52, textAlign: "right" }}>{m.perf.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function BandTable({ v }: { v: RatingsView }) {
  const max = Math.max(1, ...v.dist.map((d) => d.count));
  const total = v.dist.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div className="mm-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "15px 20px", borderBottom: "1px solid var(--hair)", fontSize: 15, fontWeight: 700 }}>Players by band</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {([["Band", "left"], ["Players", "right"], ["Share of section", "left"]] as const).map(([h, al], i) => (
              <th key={i} style={{ padding: "10px 20px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", textAlign: al, background: "var(--paper)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...v.dist].reverse().map((d, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--hair-2)" }}>
              <td className="mm-num" style={{ padding: "12px 20px", fontSize: 18, color: "var(--ink)" }}>{d.band.toFixed(1)}</td>
              <td className="mm-mono" style={{ padding: "12px 20px", textAlign: "right", color: "var(--ink-2)" }}>{d.count.toLocaleString("en-US")}</td>
              <td style={{ padding: "12px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, maxWidth: 360, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: (d.count / max) * 100 + "%", background: "var(--court-tint-2)" }} />
                  </div>
                  <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)", width: 44 }}>{Math.round((d.count / total) * 100)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Ratings({ view }: { view: RatingsView }) {
  const v = view;
  const right = (
    <div>
      <div className="mm-num" style={{ fontSize: 46, color: "#fff", lineHeight: 1 }}>{v.total.toLocaleString("en-US")}</div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 2 }}>players in section</div>
    </div>
  );
  return (
    <div className="mm-screen" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHero kicker="USTA NorCal · Performance NTRP" title="Ratings" right={right}
        sub="Score-aware dynamic ratings with year-over-year carry-over and confidence weighting — recomputed every night." />
      <div className="mm-stack" style={{ display: "flex", gap: 18, alignItems: "stretch" }}><Distribution v={v} /><CoverageCard v={v} /></div>
      <div className="mm-stack" style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 0" }}><TopRated v={v} /></div>
        <div style={{ flex: "1.2 1 0" }}><BandTable v={v} /></div>
      </div>
    </div>
  );
}
