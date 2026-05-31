"use client";
// Mobile Team detail — record hero, roster list, schedule list.
import Link from "next/link";
import type { TeamDetailData } from "@/lib/teams";
import { Avatar } from "@/components/mm/ui";
import { MHero, MSectionTitle } from "./shell";

const fmtDate = (s: string | null) => {
  if (!s) return "";
  const [, m, d] = s.split("-");
  return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m!]} ${+d!}`;
};

export function MobileTeamDetail({ data }: { data: TeamDetailData }) {
  const t = data;
  const diff = t.record.cw - t.record.cl;
  return (
    <div className="mm-mscreen">
      <MHero kicker={`${t.league} · ${t.flightName}`}>
        <h1 className="mm-disp" style={{ fontSize: 30, textTransform: "uppercase", color: "#fff", margin: "8px 0 0" }}>{t.name}</h1>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 8 }}>
          <div className="mm-num" style={{ fontSize: 44, color: "#fff", lineHeight: 1, whiteSpace: "nowrap" }}>{t.record.w}–{t.record.l}</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.82)", fontWeight: 600 }}>{(diff >= 0 ? "+" : "") + diff} court diff · {t.year}</div>
        </div>
      </MHero>

      <MSectionTitle right={`${t.roster.length}`}>Roster</MSectionTitle>
      <div className="mm-card" style={{ overflow: "hidden" }}>
        {t.roster.length === 0 ? (
          <div style={{ padding: "22px 16px", color: "var(--muted)", fontSize: 13.5 }}>No roster yet — players resolve as scorecards are ingested.</div>
        ) : t.roster.map((pl, i) => (
          <Link key={pl.id} href={`/players/${pl.id}` as never} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderTop: i ? "1px solid var(--hair-2)" : "none", textDecoration: "none" }}>
            <Avatar name={pl.name} />
            <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pl.name}</div>
            {pl.band != null && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", background: "var(--hair-2)", padding: "2px 7px", borderRadius: 6 }}>{pl.band.toFixed(1)}</span>}
            <span className="mm-num" style={{ fontSize: 18, color: "var(--court)", width: 48, textAlign: "right" }}>{pl.perf != null ? pl.perf.toFixed(2) : "—"}</span>
          </Link>
        ))}
      </div>

      <MSectionTitle right={`${t.schedule.length}`}>Schedule</MSectionTitle>
      <div className="mm-card" style={{ overflow: "hidden" }}>
        {t.schedule.length === 0 ? (
          <div style={{ padding: "22px 16px", color: "var(--muted)", fontSize: 13.5 }}>No matches on record.</div>
        ) : t.schedule.map((m) => {
          const played = m.cw + m.cl > 0;
          return (
            <div key={m.matchId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderTop: "1px solid var(--hair-2)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>{fmtDate(m.date) || "TBD"}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 1 }}>{m.at} {m.opp}</div>
              </div>
              {played ? (
                <Link href={`/matches/${m.matchId}` as never} className="mm-num" style={{ fontSize: 18, color: m.won ? "var(--win)" : "var(--loss)", textDecoration: "none" }}>{(m.won ? "W " : "L ") + m.cw + "–" + m.cl}</Link>
              ) : (
                <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Scheduled</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
