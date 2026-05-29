"use client";
// Captain workspace / lineup optimizer — Center Court (demo data).
import { PageHero, Avatar, Chip } from "@/components/mm/ui";
import * as MM from "@/lib/demo";
import type { RosterPlayer, Lineup } from "@/lib/demo";

function Select({ label, value }: { label: string; value: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="mm-kicker">{label}</span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minWidth: 210, padding: "11px 13px", border: "1px solid var(--hair)", borderRadius: 9, background: "var(--paper)", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
        {value}<span style={{ color: "var(--muted)" }}>▾</span>
      </div>
    </label>
  );
}

function Controls() {
  return (
    <div className="mm-card" style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
      <Select label="Your team" value="Cedar Park 4.0" />
      <Select label="Match" value="Wk 7 · vs Almaden Valley" />
      <Select label="Format" value="USTA Adult · 2S + 3D" />
      <div style={{ flex: 1 }} />
      <button style={{ padding: "12px 22px", border: "none", borderRadius: 10, background: "var(--court)", color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: "pointer", alignSelf: "flex-end" }}>Re-optimize</button>
    </div>
  );
}

function RosterPanel({ title, players, sub, opponent }: { title: string; players: RosterPlayer[]; sub: string; opponent?: boolean }) {
  const sorted = [...players].sort((a, b) => b.perf - a.perf);
  const out = new Set(["Cal Nguyen"]);
  return (
    <div className="mm-card" style={{ overflow: "hidden", flex: "1 1 0" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hair)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{sub}</div>
        </div>
        {opponent && <Chip tone="mute">Projected</Chip>}
      </div>
      {sorted.map((pl, i) => {
        const isOut = !opponent && out.has(pl.name);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 18px", borderTop: i ? "1px solid var(--hair-2)" : "none", opacity: isOut ? 0.45 : 1 }}>
            <Avatar name={pl.name} hi={pl.captain} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink)", textDecoration: isOut ? "line-through" : "none" }}>
                {pl.name}{pl.captain && <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: "var(--ball-ink)", background: "var(--ball)", padding: "1px 6px", borderRadius: 5, verticalAlign: "middle" }}>C</span>}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{pl.conf ? pl.conf + " confidence" : "projected starter"}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)", background: "var(--hair-2)", padding: "2px 7px", borderRadius: 6 }}>{pl.band.toFixed(1)}</span>
            <span className="mm-num" style={{ fontSize: 18, color: "var(--court)", width: 46, textAlign: "right" }}>{pl.perf.toFixed(2)}</span>
            {!opponent && <button style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--hair)", background: isOut ? "var(--court)" : "var(--card)", color: isOut ? "#fff" : "var(--ink-2)", cursor: "pointer" }}>{isOut ? "In" : "Out"}</button>}
          </div>
        );
      })}
    </div>
  );
}

function LineupCard({ rank, lu }: { rank: number; lu: Lineup }) {
  const best = rank === 1;
  return (
    <div className="mm-card" style={{ overflow: "hidden", border: best ? "1.5px solid var(--court)" : "1px solid var(--hair)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", background: best ? "var(--court-tint)" : "var(--paper)", borderBottom: "1px solid var(--hair)" }}>
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
            <span className="mm-num" style={{ fontSize: 34, color: "var(--ink)" }}>{lu.exp.toFixed(1)}<span style={{ fontSize: 16, color: "var(--muted)" }}>/5</span></span>
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

export function Captain() {
  const right = (
    <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 12, padding: "12px 18px", textAlign: "left" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>Next match · Week {MM.matchMeta.week}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", marginTop: 4 }}>vs {MM.matchMeta.away}</div>
      <div className="mm-mono" style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", marginTop: 2 }}>{MM.matchMeta.date} · home</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHero kicker="Cedar Park 4.0 · Lineup optimizer" title="Captain workspace" right={right}
        sub="Mark who's available, and we rank lineups by team win probability — not just the sum of court odds." />
      <Controls />
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <RosterPanel title="Cedar Park 4.0 — your roster" sub="10 players · tap to toggle availability" players={MM.cedar} />
        <RosterPanel title="Almaden Valley — projected" sub="Top 8 by current perf rating" players={MM.almaden} opponent />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Top 3 lineups by team win probability</div>
        <span className="mm-mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>Evaluated {MM.evaluated.toLocaleString()} possible lineups</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {MM.lineups.map((lu, i) => <LineupCard key={i} rank={i + 1} lu={lu} />)}
      </div>
    </div>
  );
}
