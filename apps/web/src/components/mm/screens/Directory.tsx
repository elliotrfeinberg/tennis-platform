"use client";
// Players directory — Center Court (demo data).
import Link from "next/link";
import { PageHero, TrendArrow, Chip } from "@/components/mm/ui";
import * as MM from "@/lib/demo";
import type { DirRow } from "@/lib/demo";

const bandChips: Array<[string, number, boolean?]> = [
  ["All", 20180, true], ["2.5", 612], ["3.0", 1840], ["3.5", 2410], ["4.0", 1960], ["4.5", 1020], ["5.0", 338],
];

function FilterBar() {
  return (
    <div className="mm-card" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mm-kicker">Search</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: 280, padding: "10px 12px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)" }}>
          <svg width={15} height={15} viewBox="0 0 16 16" fill="none" style={{ color: "var(--muted)" }}>
            <circle cx={7} cy={7} r={5} stroke="currentColor" strokeWidth={1.6} /><path d="M11 11l3 3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>name contains…</span>
        </div>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mm-kicker">Sort by</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, width: 200, padding: "10px 12px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
          Perf rating ↓<span style={{ color: "var(--muted)" }}>▾</span>
        </div>
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <span className="mm-kicker">Band</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {bandChips.map(([label, n, active]) => (
            <button key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 100, cursor: "pointer", border: active ? "none" : "1px solid var(--hair)", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, background: active ? "var(--court)" : "var(--card)", color: active ? "#fff" : "var(--ink-2)" }}>
              {label}<span className="mm-mono" style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>{n.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ p, hi }: { p: DirRow; hi?: boolean }) {
  const cell = { padding: "13px 14px", fontSize: 13.5, verticalAlign: "middle" } as const;
  const conf = ({ High: "court", Med: "mute", Low: "ball" } as const)[p.conf];
  const frac = Math.max(0, Math.min(1, (p.perf - 2.5) / 2.5));
  return (
    <tr style={{ borderTop: "1px solid var(--hair-2)", background: hi ? "var(--court-tint)" : "transparent" }}>
      <td style={cell}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: hi ? "var(--court)" : "var(--court-tint)", color: hi ? "#fff" : "var(--court)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-display)" }}>{p.name.split(" ").map((w) => w[0]).join("")}</div>
          <div>
            <Link href="/players/demo" style={{ fontWeight: 700, color: hi ? "var(--court)" : "var(--ink)", textDecoration: "none" }}>{p.name}</Link>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{p.g === "M" ? "Men" : "Women"}</div>
          </div>
        </div>
      </td>
      <td className="mm-mono" style={{ ...cell, color: "var(--muted)", textAlign: "center" }}>{p.b24.toFixed(1)}</td>
      <td style={{ ...cell, textAlign: "center" }}><span className="mm-num" style={{ fontSize: 17, color: "var(--ink)" }}>{p.b25.toFixed(1)}</span></td>
      <td style={{ ...cell, width: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mm-num" style={{ fontSize: 20, color: "var(--court)", width: 50 }}>{p.perf.toFixed(2)}</span>
          <div style={{ position: "relative", flex: 1, height: 6, borderRadius: 4, background: "var(--hair-2)" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: frac * 100 + "%", borderRadius: 4, background: "var(--court)" }} />
          </div>
        </div>
      </td>
      <td style={{ ...cell, textAlign: "right" }}><TrendArrow v={p.trend} /></td>
      <td style={{ ...cell, textAlign: "right" }}><Chip tone={conf}>{p.conf}</Chip></td>
      <td className="mm-mono" style={{ ...cell, textAlign: "right", color: "var(--muted)", fontSize: 12.5 }}>{p.type === "S" ? "Self" : p.type === "A" ? "Appeal" : "Computer"}</td>
    </tr>
  );
}

export function Directory() {
  const rows = [...MM.directory].sort((a, b) => b.perf - a.perf);
  const legend = (
    <div style={{ display: "flex", gap: 16, justifyContent: "flex-end" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.85)" }}><span style={{ width: 8, height: 8, borderRadius: 8, background: "#fff" }} />Computer</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.85)" }}><span style={{ width: 8, height: 8, borderRadius: 8, background: "var(--ball)" }} />Self-rated</span>
    </div>
  );
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHero kicker="USTA NorCal · Player directory" title="Players" right={legend}
        sub={<span><span className="mm-mono" style={{ fontWeight: 600 }}>20,180</span> players · per-season roster bands and live perf ratings, refreshed nightly.</span>} />
      <FilterBar />
      <div className="mm-card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {([["Player", "left"], ["'24", "center"], ["'25 band", "center"], ["Perf NTRP", "left"], ["30-day", "right"], ["Confidence", "right"], ["Type", "right"]] as const).map(([h, al], i) => (
                <th key={i} style={{ padding: "12px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", textAlign: al, background: "var(--paper)", borderBottom: "1px solid var(--hair)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.map((p, i) => <Row key={i} p={p} hi={p.name === "Marcus Holloway"} />)}</tbody>
        </table>
      </div>
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)" }}>Showing 12 of 20,180 — refine with search</div>
    </div>
  );
}
