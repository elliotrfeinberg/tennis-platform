"use client";
// Standings — Center Court. Prop-driven from real flight/team data, with a
// flight picker (GET ?flight=).
import Link from "next/link";
import { PageHero, Avatar, Chip } from "@/components/mm/ui";
import type { FlightRef, StandingRow } from "@/lib/teams";

export interface StandingsView {
  flight: FlightRef | null;
  flights: FlightRef[];
  selectedId: string;
  rows: StandingRow[];
}

export function Standings({ view }: { view: StandingsView }) {
  const v = view;
  const maxDiff = Math.max(1, ...v.rows.map((s) => Math.abs(s.cw - s.cl)));
  const right = v.flight && (
    <div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", fontWeight: 600 }}>{v.flight.year}</div>
      <div style={{ fontSize: 16, color: "#fff", fontWeight: 700, marginTop: 2 }}>{v.flight.teams} teams · {v.flight.matches} matches</div>
    </div>
  );
  const head = ["#", "Team", "W", "L", "Courts W", "Courts L", "Court diff"];
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHero kicker={v.flight ? v.flight.league : "USTA NorCal"} title="Standings" right={right}
        sub={v.flight ? `${v.flight.name} · ranked by team wins then court differential.` : "No ingested flights yet."} />
      <form action="/teams" className="mm-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span className="mm-kicker">Flight</span>
        <select name="flight" defaultValue={v.selectedId} style={{ flex: 1, maxWidth: 560, padding: "10px 12px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-body)" }}>
          {v.flights.map((f) => (
            <option key={f.id} value={f.id}>{f.league} · {f.name} ({f.matches})</option>
          ))}
        </select>
        <button type="submit" style={{ padding: "10px 18px", border: "none", borderRadius: 9, background: "var(--court)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>View</button>
      </form>
      <div className="mm-card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} style={{ padding: "13px 18px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", textAlign: i === 1 ? "left" : i < 1 ? "center" : i >= 2 && i <= 5 ? "right" : "left", background: "var(--paper)", borderBottom: "1px solid var(--hair)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>No standings for this flight yet.</td></tr>
            ) : v.rows.map((s, i) => {
              const diff = s.cw - s.cl;
              return (
                <tr key={s.id} style={{ borderTop: "1px solid var(--hair-2)" }}>
                  <td className="mm-num" style={{ padding: "13px 18px", textAlign: "center", fontSize: 18, color: i < 4 ? "var(--court)" : "var(--ink-2)" }}>{i + 1}</td>
                  <td style={{ padding: "13px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <Avatar name={s.name} />
                      <Link href={`/teams/${s.id}` as never} style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)", textDecoration: "none" }}>{s.name}</Link>
                      {i === 0 && <Chip tone="ball">1st</Chip>}
                    </div>
                  </td>
                  <td className="mm-num" style={{ padding: "13px 18px", textAlign: "right", fontSize: 17 }}>{s.w}</td>
                  <td className="mm-mono" style={{ padding: "13px 18px", textAlign: "right", color: "var(--muted)" }}>{s.l}</td>
                  <td className="mm-mono" style={{ padding: "13px 18px", textAlign: "right", color: "var(--ink-2)" }}>{s.cw}</td>
                  <td className="mm-mono" style={{ padding: "13px 18px", textAlign: "right", color: "var(--muted)" }}>{s.cl}</td>
                  <td style={{ padding: "13px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="mm-num" style={{ width: 38, fontSize: 15, color: diff > 0 ? "var(--win)" : diff < 0 ? "var(--loss)" : "var(--muted)" }}>{(diff > 0 ? "+" : "") + diff}</span>
                      <div style={{ position: "relative", flex: 1, maxWidth: 200, height: 8 }}>
                        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--hair)" }} />
                        <div style={{ position: "absolute", top: 0, bottom: 0, height: 8, borderRadius: 4, background: diff >= 0 ? "var(--court)" : "var(--loss)", left: diff >= 0 ? "50%" : `calc(50% - ${(Math.abs(diff) / maxDiff) * 50}%)`, width: `${(Math.abs(diff) / maxDiff) * 50}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Court differential breaks ties on equal team-match records. Sub-flight grouping is approximate until area splits are ingested.</div>
    </div>
  );
}
