"use client";
// Mobile Match detail — scoreboard hero + court-by-court cards.
import type { MatchDetailData } from "@/lib/teams";
import { MHero, MSectionTitle } from "./shell";

const fmtDate = (s: string | null) => {
  if (!s) return "";
  const [, m, d] = s.split("-");
  return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m!]} ${+d!}`;
};

function SideRow({ players, sets, mine, won }: { players: Array<{ name: string; perf: number | null }>; sets: Array<[number, number]>; mine: boolean; won: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0" }}>
      <div style={{ width: 18, flexShrink: 0 }}>
        {won && <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 5, background: "var(--court)", color: "#fff", fontSize: 10, fontWeight: 800, fontFamily: "var(--font-display)" }}>W</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: won ? 700 : 600, color: won ? "var(--ink)" : "var(--ink-2)" }}>
          {players.length === 0 ? "—" : players.map((p, j) => (
            <span key={j}>{j > 0 && <span style={{ color: "var(--muted)", fontWeight: 500 }}> + </span>}{p.name}{p.perf != null && <span className="mm-mono" style={{ fontSize: 10.5, color: "var(--muted)", marginLeft: 3 }}>{p.perf.toFixed(2)}</span>}</span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {sets.map((s, j) => {
          const v = mine ? s[0] : s[1];
          const w = mine ? s[0] > s[1] : s[1] > s[0];
          return <span key={j} className="mm-num" style={{ width: 24, textAlign: "center", fontSize: 17, color: w ? "var(--court)" : "var(--ink-2)" }}>{v}</span>;
        })}
      </div>
    </div>
  );
}

export function MobileMatchDetail({ data }: { data: MatchDetailData }) {
  const d = data;
  const homeWon = d.homeCourts > d.awayCourts;
  return (
    <div className="mm-mscreen">
      <MHero kicker={`${fmtDate(d.date)} · ${d.flight}`}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, marginTop: 10 }}>
          <div style={{ textAlign: "right", minWidth: 0 }}>
            <div className="mm-disp" style={{ fontSize: 21, textTransform: "uppercase", color: "#fff", lineHeight: 1 }}>{d.home}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", fontWeight: 600, marginTop: 2 }}>{homeWon ? "Winner · home" : "Home"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mm-num" style={{ fontSize: 50, lineHeight: 0.8, color: homeWon ? "var(--ball)" : "#fff" }}>{d.homeCourts}</span>
            <span style={{ fontSize: 20, color: "rgba(255,255,255,.5)" }}>–</span>
            <span className="mm-num" style={{ fontSize: 50, lineHeight: 0.8, color: !homeWon ? "var(--ball)" : "#fff" }}>{d.awayCourts}</span>
          </div>
          <div style={{ textAlign: "left", minWidth: 0 }}>
            <div className="mm-disp" style={{ fontSize: 21, textTransform: "uppercase", color: "#fff", lineHeight: 1 }}>{d.away}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", fontWeight: 600, marginTop: 2 }}>{!homeWon ? "Winner · visitor" : "Visitor"}</div>
          </div>
        </div>
      </MHero>

      <MSectionTitle right={d.league}>Court by court</MSectionTitle>
      {d.courts.map((ct, i) => (
        <div key={i} className="mm-card" style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 4, borderBottom: "1px solid var(--hair-2)" }}>
            <span className="mm-disp" style={{ fontSize: 19, color: "var(--court)" }}>{ct.c}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>{ct.type}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: ct.homeWon ? "var(--win)" : "var(--loss)" }}>{ct.homeWon ? `${d.home} won` : `${d.away} won`}</span>
          </div>
          <SideRow players={ct.home} sets={ct.sets} mine won={ct.homeWon} />
          <div style={{ height: 1, background: "var(--hair-2)" }} />
          <SideRow players={ct.away} sets={ct.sets.map((s) => [s[1], s[0]] as [number, number])} mine={false} won={!ct.homeWon} />
        </div>
      ))}
    </div>
  );
}
