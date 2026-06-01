"use client";
// Hypothetical-matchup sandbox. Pick any players onto either side of each court
// (for the league's real format) and see live court + match odds, computed
// client-side from the pure @tennis/optimizer win-prob functions. Plus a quick
// 1v1 / 2v2 rating calculator.

import { useMemo, useState } from "react";
import { singlesWinProb, doublesWinProb, teamWinProbability } from "@tennis/optimizer";
import type { CaptainPlayer, CaptainView } from "@/lib/captain";
import { sandboxCourtProb } from "./shared";
import { OddsExplainer } from "./OddsExplainer";

type Picks = { ours: string[]; theirs: string[] };

function PlayerSelect({
  value,
  players,
  onChange,
}: {
  value: string;
  players: CaptainPlayer[];
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "7px 9px",
        border: "1px solid var(--hair)",
        borderRadius: 8,
        background: "var(--paper)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
        width: "100%",
        minWidth: 0,
      }}
    >
      <option value="">—</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.perf != null ? p.perf.toFixed(2) : "?"})
        </option>
      ))}
    </select>
  );
}

function pct(p: number | null): string {
  return p == null ? "—" : `${Math.round(p * 100)}%`;
}

export function Sandbox({ view }: { view: CaptainView }) {
  const fmt = view.format;
  // Each column only offers players from its own team, sorted by name.
  const myPlayers = useMemo(
    () => [...view.myRoster].sort((a, b) => a.name.localeCompare(b.name)),
    [view.myRoster]
  );
  const oppPlayers = useMemo(
    () => [...view.oppRoster].sort((a, b) => a.name.localeCompare(b.name)),
    [view.oppRoster]
  );
  const byId = useMemo(() => {
    const m = new Map<string, CaptainPlayer>();
    for (const p of [...view.myRoster, ...view.oppRoster]) if (!m.has(p.id)) m.set(p.id, p);
    return m;
  }, [view.myRoster, view.oppRoster]);

  const initial: Picks[] = useMemo(
    () =>
      fmt.courts.map((c, i) => ({
        ours: view.lineups[0]?.courts[i]?.playerIds ?? [],
        theirs: view.oppProjection[i]?.players.map((p) => p.id) ?? [],
      })),
    [fmt.courts, view.lineups, view.oppProjection]
  );
  const [picks, setPicks] = useState<Picks[]>(initial);

  const setPick = (courtIdx: number, side: "ours" | "theirs", slot: number, id: string) => {
    setPicks((prev) =>
      prev.map((p, i) => {
        if (i !== courtIdx) return p;
        const arr = [...p[side]];
        arr[slot] = id;
        return { ...p, [side]: arr };
      })
    );
  };

  const resolve = (ids: string[], n: number) =>
    Array.from({ length: n }, (_, i) => byId.get(ids[i] ?? ""));

  const courtResults = fmt.courts.map((c, i) => {
    const n = c.kind === "S" ? 1 : 2;
    const ours = resolve(picks[i]?.ours ?? [], n);
    const theirs = resolve(picks[i]?.theirs ?? [], n);
    return { wp: sandboxCourtProb(c.kind, ours, theirs), points: c.points };
  });

  const complete = courtResults.every((r) => r.wp != null);
  const teamWin = complete
    ? teamWinProbability(courtResults.map((r) => ({ p: r.wp!, points: r.points })))
    : null;
  const expPoints = courtResults.reduce((s, r) => s + (r.wp ?? 0) * r.points, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="mm-card" style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="mm-kicker">Hypothetical match odds</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 3 }}>
            {fmt.name} · win {fmt.toClinch} of {fmt.total} points
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)" }}>Match win prob</div>
            <span className="mm-num" style={{ fontSize: 34, color: "var(--court)" }}>{teamWin == null ? "—" : Math.round(teamWin * 100) + "%"}</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)" }}>Exp. points</div>
            <span className="mm-num" style={{ fontSize: 34, color: "var(--ink)" }}>{expPoints.toFixed(1)}<span style={{ fontSize: 16, color: "var(--muted)" }}>/{fmt.total}</span></span>
          </div>
          <button
            onClick={() => setPicks(initial)}
            style={{ padding: "9px 16px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)", fontSize: 13, fontWeight: 700, color: "var(--ink-2)", cursor: "pointer" }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mm-card" style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 64px 1fr", gap: 10, padding: "11px 18px", borderBottom: "1px solid var(--hair)", fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>
          <div>Court</div>
          <div>Your side</div>
          <div style={{ textAlign: "center" }}>Win</div>
          <div>Opponent</div>
        </div>
        {fmt.courts.map((c, i) => {
          const n = c.kind === "S" ? 1 : 2;
          const r = courtResults[i]!;
          return (
            <div key={c.c} style={{ display: "grid", gridTemplateColumns: "56px 1fr 64px 1fr", gap: 10, alignItems: "center", padding: "10px 18px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
              <div>
                <span className="mm-mono" style={{ fontWeight: 700, fontSize: 13, color: "var(--court)" }}>{c.c}</span>
                {c.points > 1 && <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: "var(--on-ball, #4a530f)", background: "var(--ball, #d8e36a)", padding: "1px 5px", borderRadius: 5 }}>×{c.points}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {Array.from({ length: n }, (_, s) => (
                  <PlayerSelect key={s} value={picks[i]?.ours[s] ?? ""} players={myPlayers} onChange={(id) => setPick(i, "ours", s, id)} />
                ))}
              </div>
              <div className="mm-num" style={{ textAlign: "center", fontSize: 17, fontWeight: 700, color: r.wp == null ? "var(--muted)" : r.wp >= 0.5 ? "var(--court)" : "var(--loss)" }}>{pct(r.wp)}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {Array.from({ length: n }, (_, s) => (
                  <PlayerSelect key={s} value={picks[i]?.theirs[s] ?? ""} players={oppPlayers} onChange={(id) => setPick(i, "theirs", s, id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <QuickCalc />
      <OddsExplainer />
    </div>
  );
}

// Quick rating-only calculator: type ratings, see the court win probability.
function QuickCalc() {
  const [s1, setS1] = useState("4.0");
  const [s2, setS2] = useState("3.5");
  const [d, setD] = useState(["4.0", "4.0", "3.5", "3.5"]);
  const num = (x: string) => {
    const v = parseFloat(x);
    return Number.isFinite(v) ? v : null;
  };
  const sP = num(s1) != null && num(s2) != null ? singlesWinProb(num(s1)!, num(s2)!) : null;
  const dr = d.map(num);
  const dP = dr.every((x) => x != null)
    ? doublesWinProb({ a: dr[0]!, b: dr[1]! }, { a: dr[2]!, b: dr[3]! })
    : null;
  const inp = { width: 58, padding: "7px 8px", border: "1px solid var(--hair)", borderRadius: 8, background: "var(--paper)", fontSize: 13, fontWeight: 700, color: "var(--ink)", textAlign: "center" as const, fontFamily: "var(--font-mono, monospace)" };
  return (
    <div className="mm-card" style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 30, alignItems: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)" }}>Quick calculator</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>1v1</span>
        <input style={inp} value={s1} onChange={(e) => setS1(e.target.value)} />
        <span style={{ color: "var(--muted)" }}>vs</span>
        <input style={inp} value={s2} onChange={(e) => setS2(e.target.value)} />
        <span className="mm-num" style={{ fontSize: 16, fontWeight: 700, color: "var(--court)", width: 46, textAlign: "right" }}>{pct(sP)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>2v2</span>
        <input style={inp} value={d[0]} onChange={(e) => setD([e.target.value, d[1]!, d[2]!, d[3]!])} />
        <input style={inp} value={d[1]} onChange={(e) => setD([d[0]!, e.target.value, d[2]!, d[3]!])} />
        <span style={{ color: "var(--muted)" }}>vs</span>
        <input style={inp} value={d[2]} onChange={(e) => setD([d[0]!, d[1]!, e.target.value, d[3]!])} />
        <input style={inp} value={d[3]} onChange={(e) => setD([d[0]!, d[1]!, d[2]!, e.target.value])} />
        <span className="mm-num" style={{ fontSize: 16, fontWeight: 700, color: "var(--court)", width: 46, textAlign: "right" }}>{pct(dP)}</span>
      </div>
    </div>
  );
}
