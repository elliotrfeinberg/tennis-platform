"use client";
// Mobile Standings — flight picker, hero, stacked team rows with court diff.
import Link from "next/link";
import type { StandingsView } from "@/components/mm/screens/Standings";
import { Avatar } from "@/components/mm/ui";
import { MHero } from "./shell";

export function MobileStandings({ view }: { view: StandingsView }) {
  const v = view;
  return (
    <div className="mm-mscreen">
      <MHero kicker={v.flight ? v.flight.league : "USTA NorCal"}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 6 }}>{v.flight ? v.flight.name : "Standings"}</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 1 }}>
          {v.flight ? `${v.flight.year} · ${v.flight.teams} teams · ${v.flight.matches} matches` : "No ingested flights yet."}
        </div>
      </MHero>

      <form action="/teams" className="mm-card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="mm-kicker">Flight</span>
        <select name="flight" defaultValue={v.selectedId} style={{ width: "100%", padding: "11px 12px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-body)", boxSizing: "border-box", maxWidth: "100%" }}>
          {v.flights.map((f) => <option key={f.id} value={f.id}>{f.league} · {f.name} ({f.matches})</option>)}
        </select>
        <button type="submit" style={{ padding: "11px", border: "none", borderRadius: 9, background: "var(--court)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>View</button>
      </form>

      <div className="mm-card" style={{ overflow: "hidden" }}>
        {v.rows.length === 0 ? (
          <div style={{ padding: "26px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No standings for this flight yet.</div>
        ) : v.rows.map((s, i) => {
          const diff = s.cw - s.cl;
          return (
            <Link key={s.id} href={`/teams/${s.id}` as never} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderTop: i ? "1px solid var(--hair-2)" : "none", textDecoration: "none" }}>
              <span className="mm-num" style={{ fontSize: 17, width: 20, textAlign: "center", color: i < 4 ? "var(--court)" : "var(--muted)" }}>{i + 1}</span>
              <Avatar name={s.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                <div className="mm-mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{s.w}–{s.l} · {s.cw}/{s.cl} courts</div>
              </div>
              <span className="mm-num" style={{ fontSize: 15, width: 34, textAlign: "right", color: diff > 0 ? "var(--win)" : diff < 0 ? "var(--loss)" : "var(--muted)" }}>{diff > 0 ? "+" : ""}{diff}</span>
            </Link>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", padding: "0 2px" }}>Court differential breaks ties on equal team-match records.</div>
    </div>
  );
}
