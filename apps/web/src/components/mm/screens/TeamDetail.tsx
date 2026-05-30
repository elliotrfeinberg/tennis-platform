"use client";
// Team detail — Center Court. Prop-driven from real roster + schedule.
import Link from "next/link";
import { PageHero, Avatar } from "@/components/mm/ui";
import type { TeamDetailData } from "@/lib/teams";

const fmtDate = (s: string | null) => {
  if (!s) return "";
  const [, m, d] = s.split("-");
  return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m!]} ${+d!}`;
};

function ScheduleRow({ m }: { m: TeamDetailData["schedule"][number] }) {
  const played = m.cw + m.cl > 0;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid var(--hair-2)" }}>
      <div>
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
}

export function TeamDetail({ data }: { data: TeamDetailData }) {
  const t = data;
  const roster = t.roster;
  const right = (
    <div>
      <div className="mm-num" style={{ fontSize: 46, color: "#fff", lineHeight: 1 }}>{t.record.w}–{t.record.l}</div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 2 }}>{(t.record.cw - t.record.cl >= 0 ? "+" : "") + (t.record.cw - t.record.cl)} court diff</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Link href="/teams" style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, textDecoration: "none" }}>← Standings</Link>
      <PageHero kicker={`${t.league} · ${t.flightName}`} title={t.name} sub={`USTA NorCal · ${t.year} · ${roster.length} players`} right={right} />
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 18, alignItems: "start" }}>
        <div className="mm-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "13px 20px", borderBottom: "1px solid var(--hair)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-2)" }}>Roster · {roster.length}</div>
          {roster.length === 0 ? (
            <div style={{ padding: "24px 20px", color: "var(--muted)", fontSize: 13.5 }}>No roster yet — players resolve as scorecards are ingested.</div>
          ) : roster.map((pl, i) => (
            <div key={pl.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
              <Avatar name={pl.name} />
              <Link href={`/players/${pl.id}` as never} style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, color: "var(--ink)", textDecoration: "none" }}>{pl.name}</Link>
              {pl.band != null && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", background: "var(--hair-2)", padding: "2px 7px", borderRadius: 6 }}>{pl.band.toFixed(1)}</span>}
              <span className="mm-num" style={{ fontSize: 19, color: "var(--court)", width: 48, textAlign: "right" }}>{pl.perf != null ? pl.perf.toFixed(2) : "—"}</span>
            </div>
          ))}
        </div>
        <div className="mm-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "13px 20px", borderBottom: "1px solid var(--hair)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-2)" }}>Schedule · {t.schedule.length}</div>
          {t.schedule.length === 0 ? (
            <div style={{ padding: "24px 20px", color: "var(--muted)", fontSize: 13.5 }}>No matches on record.</div>
          ) : t.schedule.map((m) => <ScheduleRow key={m.matchId} m={m} />)}
        </div>
      </div>
    </div>
  );
}
