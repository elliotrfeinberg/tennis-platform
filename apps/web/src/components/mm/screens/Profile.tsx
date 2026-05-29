"use client";
// Player Profile — Center Court graphic hero (demo data).
import { TrendArrow, Chip } from "@/components/mm/ui";
import { RatingChart, type ChartPoint } from "@/components/mm/RatingChart";
import * as MM from "@/lib/demo";

const p = MM.player;

function BandMeter() {
  const { bandLow, bandHigh, midpoint, perf } = p;
  const pct = (v: number) => ((v - bandLow) / (bandHigh - bandLow)) * 100;
  const light = true; // white text on green hero
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ position: "relative", height: 8, borderRadius: 5, background: light ? "rgba(255,255,255,.22)" : "var(--court-tint-2)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(perf) + "%", borderRadius: 5, background: light ? "var(--ball)" : "var(--court)" }} />
        <div style={{ position: "absolute", left: pct(midpoint) + "%", top: -3, bottom: -3, width: 2, background: light ? "rgba(255,255,255,.5)" : "var(--muted)" }} />
        <div style={{ position: "absolute", left: `calc(${pct(perf)}% - 7px)`, top: -3, width: 14, height: 14, borderRadius: 8, background: "var(--ball)", border: "2px solid var(--court-deep)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,.7)" }}>
        <span>{bandLow.toFixed(2)}</span><span>mid {midpoint.toFixed(2)}</span><span>{bandHigh.toFixed(2)} ceiling</span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div style={{ borderRadius: 16, padding: "34px 38px", display: "grid", gridTemplateColumns: "1fr auto", gap: 40, alignItems: "center", position: "relative", overflow: "hidden", background: "var(--hero-bg)", color: "#fff", boxShadow: "var(--shadow)" }}>
      <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: -40, top: -40, width: 220, height: 220, borderRadius: 999, border: "2px solid rgba(255,255,255,.12)", pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.6)" }}>Performance NTRP · {p.section}</div>
        <h1 className="mm-disp" style={{ fontSize: 68, margin: "8px 0 0", textTransform: "uppercase", color: "#fff" }}>{p.name}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "rgba(255,255,255,.82)", fontWeight: 600, whiteSpace: "nowrap" }}>
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M8 1v14M1 8h14" /></svg>
            {p.homeTeam}
          </span>
          <span style={{ color: "rgba(255,255,255,.6)", fontSize: 13 }}>·</span>
          <span className="mm-mono" style={{ fontSize: 13, color: "rgba(255,255,255,.6)", whiteSpace: "nowrap" }}>USTA #{p.memberId}</span>
          <span style={{ color: "rgba(255,255,255,.6)", fontSize: 13 }}>·</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,.82)", fontWeight: 600, whiteSpace: "nowrap" }}>{p.gender === "M" ? "Men" : "Women"}</span>
        </div>
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 12 }}>
          <div className="mm-num" style={{ fontSize: 116, lineHeight: 0.8, color: "#fff" }}>{p.perf.toFixed(2)}</div>
          <div style={{ textAlign: "left", paddingBottom: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 8, background: "rgba(255,255,255,.16)" }}>
              <TrendArrow v={p.trend30} color="var(--ball)" />
            </span>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.6)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", marginTop: 4 }}>30-day</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,.82)", fontWeight: 600, whiteSpace: "nowrap" }}>In the {p.band.toFixed(1)} band <span className="mm-mono" style={{ color: "rgba(255,255,255,.6)" }}>({p.bandLow}–{p.bandHigh}]</span></span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 100, background: "var(--ball)", color: "var(--ball-ink)", whiteSpace: "nowrap" }}>High confidence</span>
        </div>
        <div style={{ width: "100%", maxWidth: 360 }}><BandMeter /></div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="mm-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
      <div className="mm-kicker">{label}</div>
      <div className="mm-num" style={{ fontSize: 34, marginTop: 4, color: accent ? "var(--court)" : "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

function StatRow() {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      <Stat label="Roster band" value={p.band.toFixed(1)} sub="2025 · Computer" />
      <Stat label="Adult" value={p.adult.toFixed(2)} sub={p.adultMatches + " matches"} accent />
      <Stat label="Mixed" value={p.mixed.toFixed(2)} sub={p.mixedMatches + " matches"} accent />
      <Stat label="Record" value={p.record.w + "–" + p.record.l} sub={Math.round((p.record.w / (p.record.w + p.record.l)) * 100) + "% courts won"} />
      <Stat label="Section rank" value={"#" + p.rank.pos} sub={p.rank.band} />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: color, display: "inline-block" }} />{label}
    </span>
  );
}

function ChartCard() {
  const series: ChartPoint[] = MM.log
    .filter((m) => m.post != null)
    .map((m) => ({ date: m.date, post: m.post, won: m.won, kind: m.kind, line: m.line, opp: m.opp, partner: m.partner, sets: m.sets }));
  return (
    <div className="mm-card" style={{ padding: "22px 26px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div className="mm-kicker">Performance rating · 2025 season</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3, color: "var(--ink)", fontFamily: "var(--font-body)" }}>Climbing toward the {p.bandHigh.toFixed(1)} ceiling</div>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <LegendDot color="var(--win)" label="Win" />
          <LegendDot color="var(--loss)" label="Loss" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>
            <span style={{ width: 14, height: 9, background: "var(--court)", opacity: 0.12, borderRadius: 2, display: "inline-block" }} />{p.bandHigh.toFixed(1)} band
          </span>
        </div>
      </div>
      <RatingChart series={series} bandLow={p.bandLow} bandHigh={p.bandHigh} midpoint={p.midpoint} height={270} />
    </div>
  );
}

function MatchLog() {
  const rows = [...MM.log].reverse();
  const cell = { padding: "11px 12px", fontSize: 13.5, verticalAlign: "middle" } as const;
  return (
    <div className="mm-card" style={{ overflow: "hidden", flex: "2 1 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--hair)" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Match log</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>Player ratings are snapshotted at match time</div>
        </div>
        <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{MM.log.length} courts</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            {["Date", "", "Court", "Opponent", "Score", "Perf", "Rating"].map((h, i) => (
              <th key={i} style={{ padding: "9px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", textAlign: i >= 5 ? "right" : "left", background: "var(--paper)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m, k) => (
            <tr key={k} style={{ borderTop: "1px solid var(--hair-2)" }}>
              <td className="mm-mono" style={{ ...cell, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{MM.fmtDate(m.date)}</td>
              <td style={cell}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: m.cat === "mixed" ? "color-mix(in oklab, var(--ball) 32%, var(--card))" : "var(--court-tint)", color: m.cat === "mixed" ? "var(--ball-ink)" : "var(--court)" }}>{m.cat === "mixed" ? "MX" : "AD"}</span>
              </td>
              <td className="mm-mono" style={{ ...cell, fontWeight: 600 }}>{m.kind}{m.line}</td>
              <td style={cell}>
                <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                  {m.opp.map((o, j) => (
                    <span key={j}>
                      {j > 0 && <span style={{ color: "var(--muted)", fontWeight: 500 }}> / </span>}
                      {o[0]}<span className="mm-mono" style={{ fontSize: 11.5, color: "var(--muted)", marginLeft: 4 }}>{o[1].toFixed(2)}</span>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  {m.oppTeam}
                  {m.partner && <span>{"  ·  w/ "}{m.partner[0]} <span className="mm-mono">{m.partner[1].toFixed(2)}</span></span>}
                </div>
              </td>
              <td className="mm-mono" style={cell}>
                <span style={{ fontWeight: 700, color: m.won ? "var(--win)" : "var(--loss)", marginRight: 7 }}>{m.won ? "W" : "L"}</span>
                <span style={{ color: "var(--ink-2)" }}>{MM.score(m.sets)}</span>
              </td>
              <td className="mm-mono" style={{ ...cell, textAlign: "right", color: "var(--ink-2)" }}>{m.perf.toFixed(2)}</td>
              <td className="mm-num" style={{ ...cell, textAlign: "right", fontSize: 15, color: "var(--court)" }}>{m.post.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SideColumn() {
  return (
    <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="mm-card" style={{ padding: "18px 20px" }}>
        <div className="mm-kicker">How this number moves</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)", margin: "10px 0 0" }}>
          Every set is scored against opponent ratings, then blended <span style={{ fontWeight: 700, color: "var(--ink)" }}>score-aware</span> — a 6–4, 6–4 over a 4.0 moves you more than a 7–6 squeaker. Doubles attribution preserves partner spread.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--court-tint)" }}>
            <div className="mm-num" style={{ fontSize: 22, color: "var(--court)" }}>±{p.rd.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Rating deviation</div>
          </div>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--paper)", border: "1px solid var(--hair)" }}>
            <div className="mm-num" style={{ fontSize: 22, color: "var(--ink)" }}>Daily</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Refresh cadence</div>
          </div>
        </div>
      </div>
      <div className="mm-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hair)", fontSize: 14, fontWeight: 700 }}>Published NTRP by season</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[...MM.bands].reverse().map((b, i) => (
              <tr key={i} style={{ borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
                <td style={{ padding: "12px 18px", fontWeight: 700, fontSize: 14 }}>{b.year}</td>
                <td style={{ padding: "12px 8px", fontSize: 12.5, color: "var(--muted)" }}>Computer</td>
                <td className="mm-num" style={{ padding: "12px 18px", textAlign: "right", fontSize: 20, color: "var(--court)" }}>{b.ntrp.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Profile() {
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Hero />
      <StatRow />
      <ChartCard />
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <MatchLog />
        <SideColumn />
      </div>
    </div>
  );
}
