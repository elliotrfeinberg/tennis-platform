"use client";
// Players directory — Center Court. Prop-driven from real DB data with working
// search / sort / band-filter via query params.
import Link from "next/link";
import { PageHero, Chip } from "@/components/mm/ui";

export interface DirViewRow {
  id: string;
  name: string;
  gender: string | null;
  perf: number | null;
  conf: "High" | "Med" | "Low" | null;
  type: string | null;
  bandsByYear: Record<number, number | null>;
}

export interface DirView {
  rows: DirViewRow[];
  years: number[];
  bandCounts: { band: number; count: number }[];
  total: number;
  shown: number;
  q: string;
  sort: string;
  band: string;
}

function FilterBar({ v }: { v: DirView }) {
  const chips: Array<{ label: string; value: string; count?: number }> = [
    { label: "All", value: "", count: v.total },
    ...v.bandCounts.map((b) => ({ label: b.band.toFixed(1), value: String(b.band), count: b.count })),
  ];
  const chipHref = (value: string) => {
    const qp = new URLSearchParams();
    if (v.q) qp.set("q", v.q);
    if (v.sort) qp.set("sort", v.sort);
    if (value) qp.set("band", value);
    const s = qp.toString();
    return ("/players" + (s ? "?" + s : "")) as never;
  };
  return (
    <form action="/players" className="mm-card" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mm-kicker">Search</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: 280, padding: "10px 12px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)" }}>
          <svg width={15} height={15} viewBox="0 0 16 16" fill="none" style={{ color: "var(--muted)" }}>
            <circle cx={7} cy={7} r={5} stroke="currentColor" strokeWidth={1.6} /><path d="M11 11l3 3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
          <input name="q" defaultValue={v.q} placeholder="name contains…" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink)" }} />
        </div>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mm-kicker">Sort by</span>
        <select name="sort" defaultValue={v.sort} style={{ width: 200, padding: "10px 12px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-body)" }}>
          <option value="perf">Perf rating ↓</option>
          <option value="band">Roster band ↓</option>
          <option value="name">Name A→Z</option>
        </select>
      </label>
      {v.band && <input type="hidden" name="band" value={v.band} />}
      <button type="submit" style={{ padding: "10px 18px", border: "none", borderRadius: 9, background: "var(--court)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Apply</button>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <span className="mm-kicker">Band</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {chips.map((c) => {
            const active = v.band === c.value;
            return (
              <Link key={c.label} href={chipHref(c.value)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 100, textDecoration: "none", border: active ? "none" : "1px solid var(--hair)", fontWeight: 700, fontSize: 13, background: active ? "var(--court)" : "var(--card)", color: active ? "#fff" : "var(--ink-2)" }}>
                {c.label}{c.count != null && <span className="mm-mono" style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>{c.count.toLocaleString()}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </form>
  );
}

function Row({ p, years }: { p: DirViewRow; years: number[] }) {
  const cell = { padding: "13px 14px", fontSize: 13.5, verticalAlign: "middle" } as const;
  const frac = p.perf != null ? Math.max(0, Math.min(1, (p.perf - 2.5) / 2.5)) : 0;
  const confTone = p.conf === "High" ? "court" : p.conf === "Low" ? "ball" : "mute";
  return (
    <tr style={{ borderTop: "1px solid var(--hair-2)" }}>
      <td style={cell}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--court-tint)", color: "var(--court)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-display)" }}>{p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</div>
          <div>
            <Link href={`/players/${p.id}` as never} style={{ fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{p.name}</Link>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{p.gender === "M" ? "Men" : p.gender === "F" ? "Women" : "—"}</div>
          </div>
        </div>
      </td>
      {years.map((y) => (
        <td key={y} className="mm-num" style={{ ...cell, textAlign: "center", fontSize: 17, color: "var(--ink)" }}>
          {p.bandsByYear[y] != null ? p.bandsByYear[y]!.toFixed(1) : <span style={{ color: "var(--muted)", fontSize: 13 }}>—</span>}
        </td>
      ))}
      <td style={{ ...cell, width: 220 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mm-num" style={{ fontSize: 20, color: "var(--court)", width: 50 }}>{p.perf != null ? p.perf.toFixed(2) : "—"}</span>
          <div style={{ position: "relative", flex: 1, height: 6, borderRadius: 4, background: "var(--hair-2)" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: frac * 100 + "%", borderRadius: 4, background: "var(--court)" }} />
          </div>
        </div>
      </td>
      <td style={{ ...cell, textAlign: "right" }}>{p.conf ? <Chip tone={confTone}>{p.conf}</Chip> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
      <td className="mm-mono" style={{ ...cell, textAlign: "right", color: "var(--muted)", fontSize: 12.5 }}>{p.type === "S" ? "Self" : p.type === "A" ? "Appeal" : p.type ? "Computer" : "—"}</td>
    </tr>
  );
}

export function Directory({ view }: { view: DirView }) {
  const v = view;
  const legend = (
    <div style={{ display: "flex", gap: 16, justifyContent: "flex-end" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.85)" }}><span style={{ width: 8, height: 8, borderRadius: 8, background: "#fff" }} />Computer</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.85)" }}><span style={{ width: 8, height: 8, borderRadius: 8, background: "var(--ball)" }} />Self-rated</span>
    </div>
  );
  return (
    <div className="mm-screen" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHero kicker="USTA NorCal · Player directory" title="Players" right={legend}
        sub={<span><span className="mm-mono" style={{ fontWeight: 600 }}>{v.total.toLocaleString()}</span> players · per-season roster bands and live perf ratings, refreshed nightly.</span>} />
      <FilterBar v={v} />
      <div className="mm-card mm-tablewrap">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "12px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", textAlign: "left", background: "var(--paper)", borderBottom: "1px solid var(--hair)" }}>Player</th>
              {v.years.map((y) => (
                <th key={y} style={{ padding: "12px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", textAlign: "center", background: "var(--paper)", borderBottom: "1px solid var(--hair)" }}>{`'${String(y).slice(2)} band`}</th>
              ))}
              {(["Perf NTRP", "Confidence", "Type"] as const).map((h, i) => (
                <th key={h} style={{ padding: "12px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", textAlign: i === 0 ? "left" : "right", background: "var(--paper)", borderBottom: "1px solid var(--hair)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.length === 0 ? (
              <tr><td colSpan={4 + v.years.length} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>No players match the filters.</td></tr>
            ) : v.rows.map((p) => <Row key={p.id} p={p} years={v.years} />)}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
        Showing {v.shown.toLocaleString()} of {v.total.toLocaleString()}{v.total > v.shown ? " — refine with search" : ""}
      </div>
    </div>
  );
}
