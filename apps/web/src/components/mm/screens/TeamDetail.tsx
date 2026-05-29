"use client";
// Team detail — Center Court (demo data).
import Link from "next/link";
import { PageHero, Avatar } from "@/components/mm/ui";
import * as MM from "@/lib/demo";
import type { SchedMatch } from "@/lib/demo";

function ScheduleRow({ m }: { m: SchedMatch }) {
  const won = m.cw != null && m.cl != null && m.cw > m.cl;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid var(--hair-2)" }}>
      <div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Week {m.week}{m.date ? " · " + m.date : ""}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 1 }}>{m.at} {m.opp}</div>
      </div>
      {m.cw != null ? (
        <Link href="/matches/demo" className="mm-num" style={{ fontSize: 18, color: won ? "var(--win)" : "var(--loss)", textDecoration: "none" }}>{(won ? "W " : "L ") + m.cw + "–" + m.cl}</Link>
      ) : m.plan ? (
        <Link href="/captain" style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--court)", color: "#fff", textDecoration: "none" }}>Plan lineup →</Link>
      ) : (
        <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Scheduled</span>
      )}
    </div>
  );
}

function ScheduleBlock({ title, items }: { title: string; items: SchedMatch[] }) {
  return (
    <div className="mm-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "13px 20px", borderBottom: "1px solid var(--hair)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-2)" }}>{title}</div>
      {items.map((m, i) => <ScheduleRow key={i} m={m} />)}
    </div>
  );
}

export function TeamDetail() {
  const t = MM.team;
  const roster = [...MM.cedar].sort((a, b) => b.perf - a.perf);
  const right = (
    <div>
      <div className="mm-num" style={{ fontSize: 46, color: "#fff", lineHeight: 1 }}>5–2</div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 2 }}>2nd in flight · +10 court diff</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Link href="/teams" style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, textDecoration: "none" }}>← Standings</Link>
      <PageHero kicker={t.league} title={t.name} sub={t.section + " · " + t.season + " · Home: " + t.facility} right={right} />
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 18, alignItems: "start" }}>
        <div className="mm-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "13px 20px", borderBottom: "1px solid var(--hair)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-2)" }}>Roster · 10</div>
          {roster.map((pl, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
              <Avatar name={pl.name} hi={pl.captain} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>
                  {pl.name}{pl.captain && <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: "var(--ball-ink)", background: "var(--ball)", padding: "1px 6px", borderRadius: 5, verticalAlign: "middle" }}>CAPTAIN</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{pl.conf} confidence · ±{(pl.rd ?? 0).toFixed(2)}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", background: "var(--hair-2)", padding: "2px 7px", borderRadius: 6 }}>{pl.band.toFixed(1)}</span>
              <span className="mm-num" style={{ fontSize: 19, color: "var(--court)", width: 48, textAlign: "right" }}>{pl.perf.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ScheduleBlock title="Recent results" items={MM.schedule.played.slice().reverse()} />
          <ScheduleBlock title="Upcoming" items={MM.schedule.upcoming} />
        </div>
      </div>
    </div>
  );
}
