"use client";
// Captain workspace / lineup optimizer — Center Court. Prop-driven: real team
// rosters fed to the optimizer, ranked lineups out.
import { PageHero, Avatar, Chip } from "@/components/mm/ui";
import type { CaptainView } from "@/lib/captain";

function Controls({ v }: { v: CaptainView }) {
  const sel = { padding: "11px 13px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-body)", minWidth: 200 } as const;
  return (
    <form action="/captain" className="mm-card" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mm-kicker">Flight</span>
        <select name="flight" defaultValue={v.flightId} style={{ ...sel, maxWidth: 340 }}>
          {v.flights.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mm-kicker">Your team</span>
        <select name="team" defaultValue={v.myTeamId} style={sel}>
          {v.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mm-kicker">Opponent</span>
        <select name="opp" defaultValue={v.oppTeamId} style={sel}>
          {v.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <div style={{ flex: 1 }} />
      <button type="submit" style={{ padding: "12px 22px", border: "none", borderRadius: 10, background: "var(--court)", color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: "pointer", alignSelf: "flex-end" }}>Optimize</button>
    </form>
  );
}

function RosterPanel({ title, sub, players, opponent }: { title: string; sub: string; players: CaptainView["myRoster"]; opponent?: boolean }) {
  return (
    <div className="mm-card" style={{ overflow: "hidden", flex: "1 1 0" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hair)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{sub}</div>
        </div>
        {opponent && <Chip tone="mute">Projected</Chip>}
      </div>
      {players.length === 0 ? (
        <div style={{ padding: "22px 18px", color: "var(--muted)", fontSize: 13.5 }}>No roster yet.</div>
      ) : players.map((p, i) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 18px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
          <Avatar name={p.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink)" }}>{p.name}</div>
          </div>
          {p.band != null && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", background: "var(--hair-2)", padding: "2px 7px", borderRadius: 6 }}>{p.band.toFixed(1)}</span>}
          <span className="mm-num" style={{ fontSize: 18, color: "var(--court)", width: 46, textAlign: "right" }}>{p.perf != null ? p.perf.toFixed(2) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function LineupCard({ rank, lu }: { rank: number; lu: CaptainView["lineups"][number] }) {
  const best = rank === 1;
  return (
    <div className="mm-card" style={{ overflow: "hidden", border: best ? "1.5px solid var(--court)" : "1px solid var(--hair)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "16px 22px", background: best ? "var(--court-tint)" : "var(--paper)", borderBottom: "1px solid var(--hair)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mm-disp" style={{ fontSize: 30, color: best ? "var(--court)" : "var(--ink-2)" }}>#{rank}</span>
          {best && <Chip tone="court">Recommended</Chip>}
        </div>
        <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)" }}>Team win prob</div>
            <span className="mm-num" style={{ fontSize: 34, color: "var(--court)" }}>{Math.round(lu.teamWin * 100)}%</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)" }}>Exp. courts</div>
            <span className="mm-num" style={{ fontSize: 34, color: "var(--ink)" }}>{lu.exp.toFixed(1)}<span style={{ fontSize: 16, color: "var(--muted)" }}>/{lu.courts.length}</span></span>
          </div>
        </div>
      </div>
      <div style={{ padding: "6px 0" }}>
        {lu.courts.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 22px" }}>
            <span className="mm-mono" style={{ fontWeight: 600, fontSize: 13, color: "var(--court)", width: 28 }}>{c.c}</span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{c.players.join("  +  ")}</span>
            <div style={{ width: 160, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: c.wp * 100 + "%", background: c.wp >= 0.5 ? "var(--court)" : "var(--loss)" }} />
            </div>
            <span className="mm-num" style={{ fontSize: 17, width: 48, textAlign: "right", color: c.wp >= 0.5 ? "var(--court)" : "var(--loss)" }}>{Math.round(c.wp * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StandingsPanel({ v }: { v: CaptainView }) {
  return (
    <div className="mm-card mm-tablewrap" style={{ overflow: "hidden" }}>
      <div style={{ padding: "13px 20px", borderBottom: "1px solid var(--hair)", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-2)" }}>
        Subflight standings · {v.standings.length} teams
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["#", "Team", "W", "L", "Court diff"].map((h, i) => (
              <th key={i} style={{ padding: "9px 18px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", textAlign: i === 1 ? "left" : i < 1 ? "center" : "right", background: "var(--paper)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {v.standings.map((s, i) => {
            const mine = s.id === v.myTeamId, opp = s.id === v.oppTeamId;
            const diff = s.cw - s.cl;
            return (
              <tr key={s.id} style={{ borderTop: "1px solid var(--hair-2)", background: mine ? "var(--court-tint)" : opp ? "color-mix(in oklab, var(--cat-mixed) 12%, var(--card))" : "transparent" }}>
                <td className="mm-num" style={{ padding: "10px 18px", textAlign: "center", fontSize: 16, color: i < 4 ? "var(--court)" : "var(--ink-2)" }}>{i + 1}</td>
                <td style={{ padding: "10px 18px", fontWeight: mine || opp ? 700 : 600, fontSize: 14, color: "var(--ink)" }}>
                  {s.name}{mine ? " · you" : opp ? " · opponent" : ""}
                </td>
                <td className="mm-num" style={{ padding: "10px 18px", textAlign: "right", fontSize: 15 }}>{s.w}</td>
                <td className="mm-mono" style={{ padding: "10px 18px", textAlign: "right", color: "var(--muted)" }}>{s.l}</td>
                <td className="mm-num" style={{ padding: "10px 18px", textAlign: "right", color: diff > 0 ? "var(--win)" : diff < 0 ? "var(--loss)" : "var(--muted)" }}>{(diff > 0 ? "+" : "") + diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Captain({ view }: { view: CaptainView }) {
  const v = view;
  const right = (
    <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 12, padding: "12px 18px", textAlign: "left" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>Optimizing</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", marginTop: 4 }}>{v.myName} vs {v.oppName}</div>
      <div className="mm-mono" style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", marginTop: 2 }}>
        USTA Adult · 2S + 3D{v.oppFromSchedule ? " · next match" : ""}
      </div>
    </div>
  );
  return (
    <div className="mm-screen" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHero kicker="Lineup optimizer" title="Captain workspace" right={right}
        sub="Pick your team and opponent — we rank lineups by team win probability, not just the sum of court odds." />
      <Controls v={v} />
      <div className="mm-stack" style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <RosterPanel title={`${v.myName} — your roster`} sub={`${v.myRoster.length} players`} players={v.myRoster} />
        <RosterPanel title={`${v.oppName} — projected`} sub={`${v.oppRoster.length} players · strongest-first`} players={v.oppRoster} opponent />
      </div>
      {v.standings.length > 1 && <StandingsPanel v={v} />}
      {v.error ? (
        <div className="mm-card" style={{ padding: "22px 24px", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>Can't optimize yet.</span> {v.error}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Top {v.lineups.length} lineups by team win probability</div>
            <span className="mm-mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>Evaluated {v.evaluated.toLocaleString("en-US")} possible lineups</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {v.lineups.map((lu, i) => <LineupCard key={i} rank={i + 1} lu={lu} />)}
          </div>
        </>
      )}
    </div>
  );
}
