"use client";
// Ratings overview — Center Court (demo data).
import { PageHero, TrendArrow, Avatar } from "@/components/mm/ui";
import * as MM from "@/lib/demo";
import type { Mover } from "@/lib/demo";

function Distribution() {
  const max = Math.max(...MM.dist.map((d) => d.n));
  return (
    <div className="mm-card" style={{ padding: "22px 26px", flex: "1.6 1 0" }}>
      <div className="mm-kicker">Published NTRP distribution</div>
      <h3 style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 18px", color: "var(--ink)" }}>Where the section sits</h3>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 180 }}>
        {MM.dist.map((d) => (
          <div key={d.band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
            <div className="mm-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{d.n.toLocaleString()}</div>
            <div style={{ width: "100%", height: (d.n / max) * 128, borderRadius: "6px 6px 0 0", background: d.band === 4.0 ? "var(--court)" : "var(--court-tint-2)" }} />
            <div className="mm-num" style={{ fontSize: 18, color: d.band === 4.0 ? "var(--court)" : "var(--ink-2)" }}>{d.band.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccuracyCard() {
  return (
    <div className="mm-card" style={{ padding: "22px 24px", flex: "1 1 0", display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="mm-kicker">Model accuracy</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
          <span className="mm-num" style={{ fontSize: 52, color: "var(--court)" }}>85%</span>
          <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>agree w/ USTA year-end</span>
        </div>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>Backtested against published year-end levels using 2–3 seasons of league data. Up / down / same decisions match the USTA roughly 85% of the time.</p>
      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--court-tint)" }}>
          <div className="mm-num" style={{ fontSize: 22, color: "var(--court)" }}>1.4M</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Sets scored</div>
        </div>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--paper)", border: "1px solid var(--hair)" }}>
          <div className="mm-num" style={{ fontSize: 22, color: "var(--ink)" }}>Nightly</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Recompute</div>
        </div>
      </div>
    </div>
  );
}

function MoverList({ title, rows, tone }: { title: string; rows: Mover[]; tone: string }) {
  return (
    <div className="mm-card" style={{ overflow: "hidden", flex: "1 1 0" }}>
      <div style={{ padding: "15px 20px", borderBottom: "1px solid var(--hair)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 8, background: tone }} />
        <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>{title}</span>
      </div>
      {rows.map((m, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
          <Avatar name={m.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink)" }}>{m.name}</div>
            {m.note && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{m.note}</div>}
          </div>
          <span className="mm-num" style={{ fontSize: 18, color: "var(--ink)" }}>{m.perf.toFixed(2)}</span>
          <div style={{ width: 64, textAlign: "right" }}><TrendArrow v={m.t} /></div>
        </div>
      ))}
    </div>
  );
}

function BandTable() {
  const max = Math.max(...MM.dist.map((d) => d.n));
  const total = MM.dist.reduce((s, d) => s + d.n, 0);
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
          {[...MM.dist].reverse().map((d, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--hair-2)" }}>
              <td className="mm-num" style={{ padding: "12px 20px", fontSize: 18, color: d.band === 4.0 ? "var(--court)" : "var(--ink)" }}>{d.band.toFixed(1)}</td>
              <td className="mm-mono" style={{ padding: "12px 20px", textAlign: "right", color: "var(--ink-2)" }}>{d.n.toLocaleString()}</td>
              <td style={{ padding: "12px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, maxWidth: 360, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: (d.n / max) * 100 + "%", background: d.band === 4.0 ? "var(--court)" : "var(--court-tint-2)" }} />
                  </div>
                  <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)", width: 44 }}>{Math.round((d.n / total) * 100)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Ratings() {
  const right = (
    <div>
      <div className="mm-num" style={{ fontSize: 46, color: "#fff", lineHeight: 1 }}>20,180</div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 2 }}>players rated</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHero kicker="USTA NorCal · Performance NTRP" title="Ratings" right={right}
        sub="Score-aware dynamic ratings with year-over-year carry-over and confidence weighting — recomputed every night." />
      <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}><Distribution /><AccuracyCard /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Biggest movers · last 30 days</div>
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          <MoverList title="Trending up" rows={MM.movers.up} tone="var(--win)" />
          <MoverList title="Trending down" rows={MM.movers.down} tone="var(--loss)" />
        </div>
      </div>
      <BandTable />
    </div>
  );
}
