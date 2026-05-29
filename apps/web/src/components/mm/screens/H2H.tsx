"use client";
// Head-to-head comparison with a player picker — Center Court (demo data).
import Link from "next/link";
import { useState } from "react";
import { Avatar, CourtLines } from "@/components/mm/ui";

interface H2HPlayer {
  name: string; init: string; perf: number; band: number; rec: string; win: number;
  adult: number; mixed: number; conf: string; rank: number; g?: string;
  faced: Record<string, string>;
}

const POOL: H2HPlayer[] = [
  { name: "Marcus Holloway", init: "MH", perf: 3.94, band: 4.0, rec: "9–4", win: 69, adult: 3.96, mixed: 3.88, conf: "High", rank: 142, faced: { "Nate Frye": "2–0", "Eli Stone": "1–0", "Marco Vidal": "1–1", "Will Hahn": "2–0" } },
  { name: "Andre Sato", init: "AS", perf: 3.97, band: 4.0, rec: "11–3", win: 79, adult: 3.99, mixed: 3.8, conf: "High", rank: 118, faced: { "Nate Frye": "1–1", "Eli Stone": "0–1", "Marco Vidal": "1–0", "Will Hahn": "1–0", "Jon Ek": "2–0" } },
  { name: "Theo Park", init: "TP", perf: 3.98, band: 4.0, rec: "10–4", win: 71, adult: 3.98, mixed: 3.9, conf: "High", rank: 109, faced: { "Nate Frye": "1–1", "Marco Vidal": "2–0", "Cam Wu": "1–0", "Will Hahn": "1–1" } },
  { name: "Dre Cole", init: "DC", perf: 3.9, band: 4.0, rec: "8–5", win: 62, adult: 3.91, mixed: 3.86, conf: "High", rank: 168, faced: { "Eli Stone": "1–1", "Marco Vidal": "0–1", "Will Hahn": "2–1", "Jon Ek": "1–0" } },
  { name: "Nate Frye", init: "NF", perf: 4.04, band: 4.5, rec: "12–2", win: 86, adult: 4.06, mixed: 3.97, conf: "Med", rank: 64, faced: { "Marco Vidal": "1–0", "Will Hahn": "2–0", "Cam Wu": "1–1", "Jon Ek": "1–1" } },
  { name: "Raj Patel", init: "RP", perf: 3.95, band: 4.0, rec: "7–3", win: 70, adult: 3.97, mixed: 3.8, conf: "Low", rank: 151, faced: { "Nate Frye": "0–2", "Marco Vidal": "1–1", "Cam Wu": "1–0", "Will Hahn": "1–1" } },
];

interface Meeting { date: string; cat: string; winner: string; score: string }
const pairKey = (a: string, b: string) => [a, b].sort().join("|");
const MEETINGS: Record<string, Meeting[]> = {
  [pairKey("Marcus Holloway", "Andre Sato")]: [
    { date: "Mar 22, 2025", cat: "Adult · S2", winner: "Marcus Holloway", score: "7–6, 4–6, 10–7" },
    { date: "Sep 14, 2024", cat: "Adult · S1", winner: "Andre Sato", score: "4–6, 4–6" },
  ],
  [pairKey("Marcus Holloway", "Theo Park")]: [
    { date: "Jun 7, 2025", cat: "Adult · S1", winner: "Theo Park", score: "6–4, 7–5" },
  ],
  [pairKey("Andre Sato", "Theo Park")]: [
    { date: "May 17, 2025", cat: "Adult · S2", winner: "Andre Sato", score: "6–3, 6–4" },
    { date: "Apr 5, 2025", cat: "Adult · S1", winner: "Theo Park", score: "7–6, 6–7, 10–8" },
  ],
  [pairKey("Marcus Holloway", "Nate Frye")]: [
    { date: "Feb 28, 2025", cat: "Adult · S1", winner: "Nate Frye", score: "6–2, 6–4" },
  ],
};

const wins = (rec: string) => parseInt(rec.split("–")[0]!, 10);
const last = (n: string) => n.split(" ").slice(-1)[0];

function Picker({ value, exclude, onChange, align }: { value: string; exclude: string; onChange: (n: string) => void; align: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const p = POOL.find((x) => x.name === value)!;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 11, border: "1px solid var(--hair)", background: "var(--card)", cursor: "pointer", fontFamily: "var(--font-body)", minWidth: 230, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        <Avatar name={p.name} hi />
        <div style={{ flex: 1, textAlign: align === "right" ? "right" : "left" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{p.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Perf {p.perf.toFixed(2)} · {p.band.toFixed(1)} band</div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", marginTop: 6, [align === "right" ? "right" : "left"]: 0, zIndex: 20, background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 6, minWidth: 250 }}>
          {POOL.filter((x) => x.name !== exclude).map((x) => (
            <button key={x.name} onClick={() => { onChange(x.name); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: x.name === value ? "var(--court-tint)" : "transparent", cursor: "pointer", fontFamily: "var(--font-body)", textAlign: "left" }}>
              <Avatar name={x.name} hi={x.name === value} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink)" }}>{x.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{(x.g === "F" ? "Women" : "Men") + " · " + x.band.toFixed(1) + " band"}</div>
              </div>
              <span className="mm-num" style={{ fontSize: 17, color: "var(--court)" }}>{x.perf.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HeroSide({ p, align }: { p: H2HPlayer; align: "left" | "right" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "right" ? "flex-end" : "flex-start", gap: 10 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 19, fontFamily: "var(--font-display)" }}>{p.init}</div>
      <div className="mm-disp" style={{ fontSize: 30, lineHeight: 1, textTransform: "uppercase", color: "#fff", textAlign: align, whiteSpace: "nowrap" }}>{p.name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: align === "right" ? "row" : "row-reverse" }}>
        <span className="mm-num" style={{ fontSize: 52, lineHeight: 1, color: "#fff" }}>{p.perf.toFixed(2)}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ball-ink)", background: "var(--ball)", padding: "3px 8px", borderRadius: 100 }}>{p.band.toFixed(1)} BAND</span>
      </div>
    </div>
  );
}

function Hero({ A, B, meetings }: { A: H2HPlayer; B: H2HPlayer; meetings: Meeting[] }) {
  const aW = meetings.filter((m) => m.winner === A.name).length;
  const bW = meetings.length - aW;
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16, background: "var(--hero-bg)", color: "#fff", padding: "30px 44px", boxShadow: "var(--shadow)" }}>
      <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
      <CourtLines opacity={0.16} />
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 40 }}>
        <HeroSide p={A} align="right" />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>Head to head</div>
          <div className="mm-num" style={{ fontSize: 44, color: "var(--ball)", margin: "2px 0" }}>{aW}–{bW}</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)", fontWeight: 600 }}>{meetings.length ? meetings.length + " meeting" + (meetings.length > 1 ? "s" : "") : "first meeting"}</div>
        </div>
        <HeroSide p={B} align="left" />
      </div>
    </div>
  );
}

function CompareRow({ label, aT, bT, aN, bN, lower }: { label: string; aT: string; bT: string; aN: number; bN: number; lower?: boolean }) {
  const mx = Math.max(aN, bN), mn = Math.min(aN, bN) || 0.0001;
  const aFrac = lower ? mn / aN : aN / mx;
  const bFrac = lower ? mn / bN : bN / mx;
  const aLead = lower ? aN < bN : aN > bN;
  const bLead = lower ? bN < aN : bN > aN;
  const val = (t: string, lead: boolean) => <span className="mm-num" style={{ fontSize: 22, color: lead ? "var(--court)" : "var(--ink-2)" }}>{t}</span>;
  const bar = (frac: number, lead: boolean, side: "a" | "b") => (
    <div style={{ flex: 1, display: "flex", justifyContent: side === "a" ? "flex-end" : "flex-start" }}>
      <div style={{ height: 8, width: frac * 100 + "%", borderRadius: 4, background: lead ? "var(--court)" : "var(--hair)" }} />
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "62px 1fr 150px 1fr 62px", alignItems: "center", gap: 14, padding: "13px 0", borderTop: "1px solid var(--hair-2)" }}>
      <div style={{ textAlign: "right" }}>{val(aT, aLead)}</div>
      {bar(aFrac, aLead, "a")}
      <div style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      {bar(bFrac, bLead, "b")}
      <div style={{ textAlign: "left" }}>{val(bT, bLead)}</div>
    </div>
  );
}

function CompareCard({ A, B }: { A: H2HPlayer; B: H2HPlayer }) {
  return (
    <div className="mm-card" style={{ padding: "8px 26px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 1fr", alignItems: "center", padding: "14px 0 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={A.name} hi /><span style={{ fontWeight: 700, fontSize: 14 }}>{A.name}</span></div>
        <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>COMPARE</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}><span style={{ fontWeight: 700, fontSize: 14 }}>{B.name}</span><Avatar name={B.name} /></div>
      </div>
      <CompareRow label="Perf rating" aT={A.perf.toFixed(2)} bT={B.perf.toFixed(2)} aN={A.perf} bN={B.perf} />
      <CompareRow label="Win rate" aT={A.win + "%"} bT={B.win + "%"} aN={A.win} bN={B.win} />
      <CompareRow label="Record" aT={A.rec} bT={B.rec} aN={wins(A.rec)} bN={wins(B.rec)} />
      <CompareRow label="Adult NTRP" aT={A.adult.toFixed(2)} bT={B.adult.toFixed(2)} aN={A.adult} bN={B.adult} />
      <CompareRow label="Mixed NTRP" aT={A.mixed.toFixed(2)} bT={B.mixed.toFixed(2)} aN={A.mixed} bN={B.mixed} />
      <CompareRow label="Section rank" aT={"#" + A.rank} bT={"#" + B.rank} aN={A.rank} bN={B.rank} lower />
    </div>
  );
}

function Meetings({ A, B, meetings }: { A: H2HPlayer; B: H2HPlayer; meetings: Meeting[] }) {
  return (
    <div className="mm-card" style={{ overflow: "hidden", flex: "1 1 0" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hair)", fontSize: 14, fontWeight: 700 }}>Their meetings</div>
      {meetings.length === 0 ? (
        <div style={{ padding: "26px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No prior meetings on record — this would be a first encounter.</div>
      ) : meetings.map((m, i) => {
        const aWon = m.winner === A.name;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                <span style={{ color: aWon ? "var(--court)" : "var(--muted)", fontWeight: aWon ? 700 : 600 }}>{last(A.name)}</span>
                <span style={{ color: "var(--muted)", margin: "0 7px" }}>{aWon ? "def." : "lost to"}</span>
                <span style={{ color: !aWon ? "var(--court)" : "var(--muted)", fontWeight: !aWon ? 700 : 600 }}>{last(B.name)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{m.date + " · " + m.cat}</div>
            </div>
            <span className="mm-mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>{m.score}</span>
          </div>
        );
      })}
    </div>
  );
}

function CommonOpps({ A, B }: { A: H2HPlayer; B: H2HPlayer }) {
  const shared = Object.keys(A.faced).filter((o) => B.faced[o]);
  return (
    <div className="mm-card" style={{ overflow: "hidden", flex: "1 1 0" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hair)", fontSize: 14, fontWeight: 700 }}>Common opponents</div>
      {shared.length === 0 ? (
        <div style={{ padding: "26px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No shared opponents yet.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "10px 20px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>
            <span>Opponent</span><span style={{ width: 56, textAlign: "right" }}>{last(A.name)}</span><span style={{ width: 56, textAlign: "right" }}>{last(B.name)}</span>
          </div>
          {shared.map((o, i) => {
            const aN = wins(A.faced[o]!), bN = wins(B.faced[o]!);
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "10px 20px", borderTop: "1px solid var(--hair-2)" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{o}</span>
                <span className="mm-mono" style={{ width: 56, textAlign: "right", fontSize: 13, fontWeight: aN > bN ? 700 : 500, color: aN > bN ? "var(--court)" : "var(--ink-2)" }}>{A.faced[o]}</span>
                <span className="mm-mono" style={{ width: 56, textAlign: "right", fontSize: 13, fontWeight: bN > aN ? 700 : 500, color: bN > aN ? "var(--court)" : "var(--ink-2)" }}>{B.faced[o]}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export function H2H() {
  const [aName, setAName] = useState("Marcus Holloway");
  const [bName, setBName] = useState("Andre Sato");
  const A = POOL.find((p) => p.name === aName)!;
  const B = POOL.find((p) => p.name === bName)!;
  const meetings = MEETINGS[pairKey(aName, bName)] || [];
  const swap = () => { setAName(bName); setBName(aName); };

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Link href="/players" style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, textDecoration: "none" }}>← Players directory</Link>
      <div className="mm-card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <Picker value={aName} exclude={bName} onChange={setAName} align="right" />
        <button onClick={swap} title="Swap players" style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid var(--hair)", background: "var(--paper)", color: "var(--court)", cursor: "pointer", flexShrink: 0, fontSize: 16 }}>⇄</button>
        <Picker value={bName} exclude={aName} onChange={setBName} align="left" />
      </div>
      <Hero A={A} B={B} meetings={meetings} />
      <CompareCard A={A} B={B} />
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <Meetings A={A} B={B} meetings={meetings} />
        <CommonOpps A={A} B={B} />
      </div>
    </div>
  );
}
