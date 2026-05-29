"use client";
// Match detail / scorecard — Center Court (demo data). Court-by-court box score.
import Link from "next/link";
import { CourtLines, Avatar, Chip } from "@/components/mm/ui";

type Player = [name: string, rating: number, delta?: number, captain?: boolean];
interface Court {
  c: string; type: string; ours: Player[]; opp: Player[];
  sets: Array<[number, number]>; ourWon: boolean;
}

const M = {
  week: 6, date: "Aug 2", venue: "Berkeley Hills Tennis Center", flight: "Adult 40 & Over · 4.0 Men",
  us: "Cedar Park 4.0", them: "Berkeley Hills", at: "@", usCourts: 2, themCourts: 3,
  courts: [
    { c: "S1", type: "Singles", ours: [["Andre Sato", 3.97, -0.02]], opp: [["Nate Frye", 4.04]], sets: [[4, 6], [3, 6]], ourWon: false },
    { c: "S2", type: "Singles", ours: [["Marcus Holloway", 3.94, +0.05, true]], opp: [["Eli Stone", 3.9]], sets: [[7, 6], [6, 4]], ourWon: true },
    { c: "D1", type: "Doubles", ours: [["Dre Cole", 3.9, -0.03], ["Theo Park", 3.98, -0.02]], opp: [["Gabe Lund", 3.92], ["Rob Tan", 3.86]], sets: [[4, 6], [6, 3], [7, 10]], ourWon: false },
    { c: "D2", type: "Doubles", ours: [["Ben Ruiz", 3.88, +0.04], ["Owen Berg", 3.83, +0.03]], opp: [["Sten Vry", 3.79], ["Hal Penn", 3.74]], sets: [[6, 3], [6, 4]], ourWon: true },
    { c: "D3", type: "Doubles", ours: [["Sam Ito", 3.71, -0.04], ["Marco Vidal", 3.83, -0.03]], opp: [["Cy Ngo", 3.88], ["Jad Oso", 3.7]], sets: [[5, 7], [4, 6]], ourWon: false },
  ] as Court[],
};

function Hero() {
  const won = M.usCourts > M.themCourts;
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16, background: "var(--hero-bg)", color: "#fff", padding: "26px 36px", boxShadow: "var(--shadow)" }}>
      <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
      <CourtLines opacity={0.16} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.72)" }}>Week {M.week} · {M.date} · {M.at} {M.venue}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 36, width: "100%", maxWidth: 760, marginTop: 8 }}>
          <div style={{ textAlign: "right" }}>
            <div className="mm-disp" style={{ fontSize: 40, textTransform: "uppercase", color: "#fff" }}>{M.us}</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.75)", fontWeight: 600, marginTop: 2 }}>{won ? "Winner · home" : "Visitor"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="mm-num" style={{ fontSize: 76, lineHeight: 0.8, color: won ? "var(--ball)" : "#fff" }}>{M.usCourts}</span>
            <span style={{ fontSize: 30, color: "rgba(255,255,255,.5)" }}>–</span>
            <span className="mm-num" style={{ fontSize: 76, lineHeight: 0.8, color: !won ? "var(--ball)" : "#fff" }}>{M.themCourts}</span>
          </div>
          <div style={{ textAlign: "left" }}>
            <div className="mm-disp" style={{ fontSize: 40, textTransform: "uppercase", color: "#fff" }}>{M.them}</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.75)", fontWeight: 600, marginTop: 2 }}>{!won ? "Winner · home" : "Host"}</div>
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

function Side({ players, sets, mine, won }: { players: Player[]; sets: Array<[number, number]>; mine: boolean; won: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0" }}>
      <div style={{ width: 26, flexShrink: 0 }}>
        {won && <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, background: "var(--court)", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "var(--font-display)" }}>W</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
        <Avatar name={players[0]![0]} hi={mine} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: won ? 700 : 600, fontSize: 14.5, color: won ? "var(--ink)" : "var(--ink-2)" }}>
            {players.map((pl, i) => (
              <span key={i}>
                {i > 0 && <span style={{ color: "var(--muted)", fontWeight: 500 }}>{"  +  "}</span>}
                {pl[0]}
                <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)", marginLeft: 5 }}>{pl[1].toFixed(2)}</span>
                {pl[2] != null && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: pl[2] >= 0 ? "var(--win)" : "var(--loss)" }}>{(pl[2] >= 0 ? "+" : "") + pl[2].toFixed(2)}</span>}
                {pl[3] && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: "var(--ball-ink)", background: "var(--ball)", padding: "1px 5px", borderRadius: 4, verticalAlign: "middle" }}>C</span>}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{mine ? M.us : M.them}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 7 }}>{sets.map((s, i) => <SetBox key={i} a={s[0]} b={s[1]} mine={mine} />)}</div>
    </div>
  );
}

function CourtCard({ ct }: { ct: Court }) {
  return (
    <div className="mm-card" style={{ padding: "14px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 6, borderBottom: "1px solid var(--hair-2)" }}>
        <span className="mm-disp" style={{ fontSize: 22, color: "var(--court)" }}>{ct.c}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>{ct.type}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: ct.ourWon ? "var(--win)" : "var(--loss)" }}>{ct.ourWon ? "Cedar Park won" : "Cedar Park lost"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Side players={ct.ours} sets={ct.sets} mine won={ct.ourWon} />
        <div style={{ height: 1, background: "var(--hair-2)" }} />
        <Side players={ct.opp} sets={ct.sets.map((s) => [s[1], s[0]] as [number, number])} mine={false} won={!ct.ourWon} />
      </div>
    </div>
  );
}

export function MatchDetail() {
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Link href="/teams/demo" style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, textDecoration: "none" }}>← Cedar Park 4.0</Link>
      <Hero />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Court by court</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
          <span>{M.flight}</span>
          <Chip tone="mute">Rating impact applied</Chip>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {M.courts.map((ct, i) => <CourtCard key={i} ct={ct} />)}
      </div>
    </div>
  );
}
