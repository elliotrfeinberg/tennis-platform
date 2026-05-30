"use client";
// Match detail / scorecard — Center Court. Prop-driven court-by-court box score.
import { CourtLines, Avatar, Chip } from "@/components/mm/ui";
import type { MatchDetailData } from "@/lib/teams";

const fmtDate = (s: string | null) => {
  if (!s) return "";
  const [, m, d] = s.split("-");
  return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m!]} ${+d!}`;
};

function Hero({ d }: { d: MatchDetailData }) {
  const homeWon = d.homeCourts > d.awayCourts;
  return (
    <div className="mm-hero" style={{ position: "relative", overflow: "hidden", borderRadius: 16, background: "var(--hero-bg)", color: "#fff", padding: "26px 36px", boxShadow: "var(--shadow)" }}>
      <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
      <CourtLines opacity={0.16} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.72)", textAlign: "center" }}>{fmtDate(d.date)} · {d.flight}</div>
        <div className="mm-score" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 36, width: "100%", maxWidth: 820, marginTop: 8 }}>
          <div style={{ textAlign: "right" }}>
            <div className="mm-disp" style={{ fontSize: "clamp(20px, 5.5vw, 36px)", textTransform: "uppercase", color: "#fff", lineHeight: 1 }}>{d.home}</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.75)", fontWeight: 600, marginTop: 4 }}>{homeWon ? "Winner · home" : "Home"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="mm-num" style={{ fontSize: "clamp(46px, 12vw, 76px)", lineHeight: 0.8, color: homeWon ? "var(--ball)" : "#fff" }}>{d.homeCourts}</span>
            <span style={{ fontSize: 30, color: "rgba(255,255,255,.5)" }}>–</span>
            <span className="mm-num" style={{ fontSize: "clamp(46px, 12vw, 76px)", lineHeight: 0.8, color: !homeWon ? "var(--ball)" : "#fff" }}>{d.awayCourts}</span>
          </div>
          <div style={{ textAlign: "left" }}>
            <div className="mm-disp" style={{ fontSize: "clamp(20px, 5.5vw, 36px)", textTransform: "uppercase", color: "#fff", lineHeight: 1 }}>{d.away}</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.75)", fontWeight: 600, marginTop: 4 }}>{!homeWon ? "Winner · visitor" : "Visitor"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetBox({ a, b, mine }: { a: number; b: number; mine: boolean }) {
  const win = mine ? a > b : b > a;
  const val = mine ? a : b;
  return (
    <div style={{ width: 42, height: 46, flexShrink: 0, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: win ? "var(--court-tint)" : "var(--paper)", border: "1px solid " + (win ? "var(--court-tint-2)" : "var(--hair)") }}>
      <span className="mm-num" style={{ fontSize: 22, color: win ? "var(--court)" : "var(--ink-2)" }}>{val}</span>
    </div>
  );
}

function Side({ players, sets, mine, won, team }: { players: Array<{ name: string; perf: number | null }>; sets: Array<[number, number]>; mine: boolean; won: boolean; team: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0" }}>
      <div style={{ width: 26, flexShrink: 0 }}>
        {won && <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, background: "var(--court)", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "var(--font-display)" }}>W</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
        <Avatar name={players[0]?.name ?? "?"} hi={mine} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: won ? 700 : 600, fontSize: 14.5, color: won ? "var(--ink)" : "var(--ink-2)" }}>
            {players.length === 0 ? "—" : players.map((pl, i) => (
              <span key={i}>
                {i > 0 && <span style={{ color: "var(--muted)", fontWeight: 500 }}>{"  +  "}</span>}
                {pl.name}
                {pl.perf != null && <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)", marginLeft: 5 }}>{pl.perf.toFixed(2)}</span>}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{team}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 7 }}>{sets.map((s, i) => <SetBox key={i} a={s[0]} b={s[1]} mine={mine} />)}</div>
    </div>
  );
}

function CourtCard({ ct, d }: { ct: MatchDetailData["courts"][number]; d: MatchDetailData }) {
  return (
    <div className="mm-card" style={{ padding: "14px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 6, borderBottom: "1px solid var(--hair-2)" }}>
        <span className="mm-disp" style={{ fontSize: 22, color: "var(--court)" }}>{ct.c}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>{ct.type}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: ct.homeWon ? "var(--win)" : "var(--loss)" }}>{ct.homeWon ? `${d.home} won` : `${d.away} won`}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Side players={ct.home} sets={ct.sets} mine won={ct.homeWon} team={d.home} />
        <div style={{ height: 1, background: "var(--hair-2)" }} />
        <Side players={ct.away} sets={ct.sets.map((s) => [s[1], s[0]] as [number, number])} mine={false} won={!ct.homeWon} team={d.away} />
      </div>
    </div>
  );
}

export function MatchDetail({ data }: { data: MatchDetailData }) {
  return (
    <div className="mm-screen" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Hero d={data} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Court by court</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
          <span>{data.league}</span>
          <Chip tone="mute">Per-court perf ratings</Chip>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.courts.map((ct, i) => <CourtCard key={i} ct={ct} d={data} />)}
      </div>
    </div>
  );
}
