"use client";
// Player Profile — Center Court graphic hero. Prop-driven (real DB data,
// mapped in the server page); falls back to demo data when no data is passed.
import Link from "next/link";
import { TrendArrow } from "@/components/mm/ui";
import { RatingChart, type ChartPoint } from "@/components/mm/RatingChart";
import { fmtDate, score, type Named } from "@/lib/demo";
import * as DEMO from "@/lib/demo";

export interface ProfileLogRow {
  date: string; cat: "adult" | "mixed" | string; kind: "S" | "D"; line: number;
  opp: Named[]; oppTeam: string | null; partner?: Named;
  won: boolean; sets: Array<[number, number]>; perf: number; post: number | null;
}

export interface ProfileData {
  name: string; gender: string | null; memberId: string | null;
  section: string; homeTeam: string;
  band: number | null; bandLow: number; bandHigh: number; midpoint: number;
  perf: number | null; adult: number | null; mixed: number | null;
  adultMatches: number; mixedMatches: number;
  record: { w: number; l: number };
  trend30: number | null; confidence: string;
  rankLabel: string;
  series: ChartPoint[];
  log: ProfileLogRow[];
  bands: Array<{ year: number; ntrp: number | null; type: string | null }>;
}

function demoData(): ProfileData {
  const p = DEMO.player;
  return {
    name: p.name, gender: p.gender, memberId: p.memberId, section: p.section, homeTeam: p.homeTeam,
    band: p.band, bandLow: p.bandLow, bandHigh: p.bandHigh, midpoint: p.midpoint,
    perf: p.perf, adult: p.adult, mixed: p.mixed, adultMatches: p.adultMatches, mixedMatches: p.mixedMatches,
    record: p.record, trend30: p.trend30, confidence: p.confidence, rankLabel: "#" + p.rank.pos,
    series: DEMO.log.filter((m) => m.post != null).map((m) => ({ date: m.date, post: m.post, won: m.won, kind: m.kind, line: m.line, opp: m.opp, partner: m.partner, sets: m.sets })),
    log: DEMO.log.map((m) => ({ date: m.date, cat: m.cat, kind: m.kind, line: m.line, opp: m.opp, oppTeam: m.oppTeam, partner: m.partner, won: m.won, sets: m.sets, perf: m.perf, post: m.post })),
    bands: DEMO.bands,
  };
}

const n2 = (v: number | null, d = "—") => (v == null ? d : v.toFixed(2));
const n1 = (v: number | null, d = "—") => (v == null ? d : v.toFixed(1));

function BandMeter({ d }: { d: ProfileData }) {
  const { bandLow, bandHigh, midpoint, perf } = d;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - bandLow) / (bandHigh - bandLow)) * 100));
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ position: "relative", height: 8, borderRadius: 5, background: "rgba(255,255,255,.22)" }}>
        {perf != null && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(perf) + "%", borderRadius: 5, background: "var(--ball)" }} />}
        <div style={{ position: "absolute", left: pct(midpoint) + "%", top: -3, bottom: -3, width: 2, background: "rgba(255,255,255,.5)" }} />
        {perf != null && <div style={{ position: "absolute", left: `calc(${pct(perf)}% - 7px)`, top: -3, width: 14, height: 14, borderRadius: 8, background: "var(--ball)", border: "2px solid var(--court-deep)" }} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,.7)" }}>
        <span>{bandLow.toFixed(2)}</span><span>mid {midpoint.toFixed(2)}</span><span>{bandHigh.toFixed(2)} ceiling</span>
      </div>
    </div>
  );
}

function Hero({ d }: { d: ProfileData }) {
  return (
    <div style={{ borderRadius: 16, padding: "34px 38px", display: "grid", gridTemplateColumns: "1fr auto", gap: 40, alignItems: "center", position: "relative", overflow: "hidden", background: "var(--hero-bg)", color: "#fff", boxShadow: "var(--shadow)" }}>
      <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: -40, top: -40, width: 220, height: 220, borderRadius: 999, border: "2px solid rgba(255,255,255,.12)", pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.6)" }}>Performance NTRP · {d.section}</div>
        <h1 className="mm-disp" style={{ fontSize: 68, margin: "8px 0 0", textTransform: "uppercase", color: "#fff" }}>{d.name}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "rgba(255,255,255,.82)", fontWeight: 600, whiteSpace: "nowrap" }}>
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M8 1v14M1 8h14" /></svg>
            {d.homeTeam}
          </span>
          {d.memberId && <><span style={{ color: "rgba(255,255,255,.6)", fontSize: 13 }}>·</span><span className="mm-mono" style={{ fontSize: 13, color: "rgba(255,255,255,.6)", whiteSpace: "nowrap" }}>USTA #{d.memberId}</span></>}
          <span style={{ color: "rgba(255,255,255,.6)", fontSize: 13 }}>·</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,.82)", fontWeight: 600, whiteSpace: "nowrap" }}>{d.gender === "M" ? "Men" : d.gender === "F" ? "Women" : "—"}</span>
        </div>
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 12 }}>
          <div className="mm-num" style={{ fontSize: 116, lineHeight: 0.8, color: "#fff" }}>{n2(d.perf)}</div>
          {d.trend30 != null && (
            <div style={{ textAlign: "left", paddingBottom: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 8, background: "rgba(255,255,255,.16)" }}>
                <TrendArrow v={d.trend30} color="var(--ball)" />
              </span>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.6)", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", marginTop: 4 }}>30-day</div>
            </div>
          )}
        </div>
        {d.band != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.82)", fontWeight: 600, whiteSpace: "nowrap" }}>In the {d.band.toFixed(1)} band <span className="mm-mono" style={{ color: "rgba(255,255,255,.6)" }}>({d.bandLow}–{d.bandHigh}]</span></span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 100, background: "var(--ball)", color: "var(--ball-ink)", whiteSpace: "nowrap" }}>{d.confidence} confidence</span>
          </div>
        )}
        {d.band != null && <div style={{ width: "100%", maxWidth: 360 }}><BandMeter d={d} /></div>}
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

function StatRow({ d }: { d: ProfileData }) {
  const total = d.record.w + d.record.l;
  return (
    <div style={{ display: "flex", gap: 14 }}>
      <Stat label="Roster band" value={n1(d.band)} sub={d.bands.length ? `${d.bands[d.bands.length - 1]!.year} · Computer` : ""} />
      <Stat label="Adult" value={n2(d.adult)} sub={d.adultMatches + " matches"} accent />
      <Stat label="Mixed" value={n2(d.mixed)} sub={d.mixedMatches + " matches"} accent />
      <Stat label="Record" value={d.record.w + "–" + d.record.l} sub={total ? Math.round((d.record.w / total) * 100) + "% courts won" : "—"} />
      <Stat label="Section rank" value={d.rankLabel} sub={d.section} />
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

function ChartCard({ d }: { d: ProfileData }) {
  return (
    <div className="mm-card" style={{ padding: "22px 26px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div className="mm-kicker">Performance rating · recent matches</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3, color: "var(--ink)", fontFamily: "var(--font-body)" }}>
            {d.band != null ? `Tracking the ${d.bandHigh.toFixed(1)} band` : "Performance over time"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <LegendDot color="var(--win)" label="Win" />
          <LegendDot color="var(--loss)" label="Loss" />
          {d.band != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>
              <span style={{ width: 14, height: 9, background: "var(--court)", opacity: 0.12, borderRadius: 2, display: "inline-block" }} />{d.bandHigh.toFixed(1)} band
            </span>
          )}
        </div>
      </div>
      <RatingChart series={d.series} bandLow={d.bandLow} bandHigh={d.bandHigh} midpoint={d.midpoint} height={270} />
    </div>
  );
}

function MatchLog({ d }: { d: ProfileData }) {
  const rows = [...d.log].reverse();
  const cell = { padding: "11px 12px", fontSize: 13.5, verticalAlign: "middle" } as const;
  return (
    <div className="mm-card" style={{ overflow: "hidden", flex: "2 1 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--hair)" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Match log</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>Player ratings are snapshotted at match time</div>
        </div>
        <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{d.log.length} courts</span>
      </div>
      {d.log.length === 0 ? (
        <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>No matches ingested for this player yet.</div>
      ) : (
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
                <td className="mm-mono" style={{ ...cell, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{fmtDate(m.date)}</td>
                <td style={cell}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: m.cat === "mixed" ? "color-mix(in oklab, var(--ball) 32%, var(--card))" : "var(--court-tint)", color: m.cat === "mixed" ? "var(--ball-ink)" : "var(--court)" }}>{m.cat === "mixed" ? "MX" : "AD"}</span>
                </td>
                <td className="mm-mono" style={{ ...cell, fontWeight: 600 }}>{m.kind}{m.line}</td>
                <td style={cell}>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                    {m.opp.length === 0 ? "—" : m.opp.map((o, j) => (
                      <span key={j}>
                        {j > 0 && <span style={{ color: "var(--muted)", fontWeight: 500 }}> / </span>}
                        {o[0]}<span className="mm-mono" style={{ fontSize: 11.5, color: "var(--muted)", marginLeft: 4 }}>{o[1] ? o[1].toFixed(2) : ""}</span>
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {m.oppTeam}
                    {m.partner && <span>{"  ·  w/ "}{m.partner[0]} <span className="mm-mono">{m.partner[1] ? m.partner[1].toFixed(2) : ""}</span></span>}
                  </div>
                </td>
                <td className="mm-mono" style={cell}>
                  <span style={{ fontWeight: 700, color: m.won ? "var(--win)" : "var(--loss)", marginRight: 7 }}>{m.won ? "W" : "L"}</span>
                  <span style={{ color: "var(--ink-2)" }}>{score(m.sets)}</span>
                </td>
                <td className="mm-mono" style={{ ...cell, textAlign: "right", color: "var(--ink-2)" }}>{m.perf.toFixed(2)}</td>
                <td className="mm-num" style={{ ...cell, textAlign: "right", fontSize: 15, color: "var(--court)" }}>{m.post != null ? m.post.toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SideColumn({ d }: { d: ProfileData }) {
  return (
    <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="mm-card" style={{ padding: "18px 20px" }}>
        <div className="mm-kicker">How this number moves</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)", margin: "10px 0 0" }}>
          Every set is scored against opponent ratings, then blended <span style={{ fontWeight: 700, color: "var(--ink)" }}>score-aware</span> — a 6–4, 6–4 over a {d.bandHigh.toFixed(1)} moves you more than a 7–6 squeaker. Doubles attribution preserves partner spread.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--court-tint)" }}>
            <div className="mm-num" style={{ fontSize: 22, color: "var(--court)" }}>{d.adultMatches + d.mixedMatches}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Rated matches</div>
          </div>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--paper)", border: "1px solid var(--hair)" }}>
            <div className="mm-num" style={{ fontSize: 22, color: "var(--ink)" }}>Daily</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Refresh cadence</div>
          </div>
        </div>
      </div>
      <div className="mm-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--hair)", fontSize: 14, fontWeight: 700 }}>Published NTRP by season</div>
        {d.bands.length === 0 ? (
          <div style={{ padding: "20px 18px", color: "var(--muted)", fontSize: 13 }}>No published ratings on record.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[...d.bands].reverse().map((b, i) => (
                <tr key={i} style={{ borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
                  <td style={{ padding: "12px 18px", fontWeight: 700, fontSize: 14 }}>{b.year}</td>
                  <td style={{ padding: "12px 8px", fontSize: 12.5, color: "var(--muted)" }}>{b.type === "S" ? "Self" : b.type === "A" ? "Appeal" : "Computer"}</td>
                  <td className="mm-num" style={{ padding: "12px 18px", textAlign: "right", fontSize: 20, color: "var(--court)" }}>{n1(b.ntrp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function Profile({ data }: { data?: ProfileData }) {
  const d = data ?? demoData();
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Link href="/players" style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, textDecoration: "none" }}>← Players directory</Link>
      <Hero d={d} />
      <StatRow d={d} />
      <ChartCard d={d} />
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <MatchLog d={d} />
        <SideColumn d={d} />
      </div>
    </div>
  );
}
