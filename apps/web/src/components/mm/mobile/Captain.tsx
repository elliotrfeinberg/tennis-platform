"use client";
// Mobile Captain workspace — compact controls, matchup hero, rosters, subflight
// standings, and ranked lineups. Same CaptainView the desktop screen consumes.
import type { CaptainView } from "@/lib/captain";
import { Avatar, Chip } from "@/components/mm/ui";
import { MHero, MSectionTitle } from "./shell";

const selStyle = { width: "100%", padding: "11px 12px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-body)", boxSizing: "border-box" as const, maxWidth: "100%" };

function Roster({ title, sub, players, opponent }: { title: string; sub: string; players: CaptainView["myRoster"]; opponent?: boolean }) {
  return (
    <div className="mm-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--hair)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{sub}</div>
        </div>
        {opponent && <Chip tone="mute">Projected</Chip>}
      </div>
      {players.length === 0 ? (
        <div style={{ padding: "20px 16px", color: "var(--muted)", fontSize: 13.5 }}>No roster yet.</div>
      ) : players.map((p, i) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 16px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
          <Avatar name={p.name} />
          <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13.5, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", background: best ? "var(--court-tint)" : "var(--paper)", borderBottom: "1px solid var(--hair)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mm-disp" style={{ fontSize: 26, color: best ? "var(--court)" : "var(--ink-2)" }}>#{rank}</span>
          {best && <Chip tone="court">Best</Chip>}
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>Win prob</div>
            <span className="mm-num" style={{ fontSize: 26, color: "var(--court)" }}>{Math.round(lu.teamWin * 100)}%</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>Courts</div>
            <span className="mm-num" style={{ fontSize: 26, color: "var(--ink)" }}>{lu.exp.toFixed(1)}<span style={{ fontSize: 12, color: "var(--muted)" }}>/{lu.courts.length}</span></span>
          </div>
        </div>
      </div>
      {lu.courts.map((c, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
          <span className="mm-mono" style={{ fontWeight: 600, fontSize: 12.5, color: "var(--court)", width: 24 }}>{c.c}</span>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13.5, color: "var(--ink)" }}>{c.players.join(" + ")}</span>
          <span className="mm-num" style={{ fontSize: 15, color: c.wp >= 0.5 ? "var(--court)" : "var(--loss)" }}>{Math.round(c.wp * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export function MobileCaptain({ view }: { view: CaptainView }) {
  const v = view;
  return (
    <div className="mm-mscreen">
      <MHero kicker="Lineup optimizer">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.7)", marginTop: 6 }}>Optimizing{v.oppFromSchedule ? " · next match" : ""}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 3 }}>{v.myName} <span style={{ color: "rgba(255,255,255,.6)" }}>vs</span> {v.oppName}</div>
        <div className="mm-mono" style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", marginTop: 1 }}>USTA Adult · 2S + 3D</div>
      </MHero>

      <form action="/captain" className="mm-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="mm-kicker">Flight</span>
          <select name="flight" defaultValue={v.flightId} style={selStyle}>
            {v.flights.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="mm-kicker">Your team</span>
          <select name="team" defaultValue={v.myTeamId} style={selStyle}>
            {v.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="mm-kicker">Opponent</span>
          <select name="opp" defaultValue={v.oppTeamId} style={selStyle}>
            {v.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button type="submit" style={{ padding: "12px", border: "none", borderRadius: 10, background: "var(--court)", color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Optimize</button>
      </form>

      <Roster title={`${v.myName} — your roster`} sub={`${v.myRoster.length} players`} players={v.myRoster} />
      <Roster title={`${v.oppName} — projected`} sub={`${v.oppRoster.length} players · strongest-first`} players={v.oppRoster} opponent />

      {v.standings.length > 1 && (
        <>
          <MSectionTitle right={`${v.standings.length} teams`}>Subflight standings</MSectionTitle>
          <div className="mm-card" style={{ overflow: "hidden" }}>
            {v.standings.map((s, i) => {
              const mine = s.id === v.myTeamId, opp = s.id === v.oppTeamId;
              const diff = s.cw - s.cl;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 14px", borderTop: i ? "1px solid var(--hair-2)" : "none", background: mine ? "var(--court-tint)" : opp ? "color-mix(in oklab, var(--cat-mixed) 12%, var(--card))" : "transparent" }}>
                  <span className="mm-num" style={{ fontSize: 16, width: 20, textAlign: "center", color: i < 4 ? "var(--court)" : "var(--muted)" }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: mine || opp ? 700 : 600, fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}{mine ? " · you" : opp ? " · opp" : ""}</div>
                    <div className="mm-mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{s.w}–{s.l}</div>
                  </div>
                  <span className="mm-num" style={{ fontSize: 15, width: 34, textAlign: "right", color: diff > 0 ? "var(--win)" : diff < 0 ? "var(--loss)" : "var(--muted)" }}>{diff > 0 ? "+" : ""}{diff}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {v.error ? (
        <div className="mm-card" style={{ padding: "18px 16px", color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>Can&apos;t optimize yet.</span> {v.error}
        </div>
      ) : (
        <>
          <MSectionTitle right={`${v.evaluated.toLocaleString("en-US")} evaluated`}>Top {v.lineups.length} lineups</MSectionTitle>
          {v.lineups.map((lu, i) => <LineupCard key={i} rank={i + 1} lu={lu} />)}
        </>
      )}
    </div>
  );
}
