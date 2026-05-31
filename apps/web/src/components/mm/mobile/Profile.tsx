"use client";
// Mobile Player Profile — compact green hero with band meter, stat grid, the
// full interactive rating chart, and stacked match-log cards. Same ProfileData
// the desktop profile consumes.
import type { ProfileData } from "@/components/mm/screens/Profile";
import { TrendArrow } from "@/components/mm/ui";
import { RatingChart } from "@/components/mm/RatingChart";
import { fmtDate, score } from "@/lib/demo";
import { MHero, MSectionTitle } from "./shell";

const n2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const n1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));

export function MobileProfile({ data }: { data: ProfileData }) {
  const d = data;
  const total = d.record.w + d.record.l;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - d.bandLow) / (d.bandHigh - d.bandLow)) * 100));
  const rows = [...d.log].reverse();
  const stats: Array<[string, string, string, boolean]> = [
    ["Adult", n2(d.adult), `${d.adultMatches} matches`, true],
    ["Mixed", n2(d.mixed), `${d.mixedMatches} matches`, true],
    ["Record", `${d.record.w}–${d.record.l}`, total ? `${Math.round((d.record.w / total) * 100)}% courts` : "—", false],
    ["Section rank", d.rankLabel, d.section, false],
  ];

  return (
    <div className="mm-mscreen">
      <MHero kicker={"Performance NTRP · " + d.section} pad="20px 22px">
        <h1 className="mm-disp" style={{ fontSize: 34, textTransform: "uppercase", color: "#fff", margin: "8px 0 0" }}>{d.name}</h1>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 4 }}>
          {d.homeTeam}{d.memberId ? ` · USTA #${d.memberId}` : ""}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 12 }}>
          <div className="mm-num" style={{ fontSize: 72, lineHeight: 0.8, color: "#fff" }}>{n2(d.perf)}</div>
          {d.trend30 != null && (
            <div style={{ paddingBottom: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 7px", borderRadius: 8, background: "rgba(255,255,255,.16)" }}>
                <TrendArrow v={d.trend30} color="var(--ball)" />
              </span>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.65)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>30-day</div>
            </div>
          )}
        </div>
        {d.band != null && (
          <div style={{ marginTop: 12 }}>
            <div style={{ position: "relative", height: 7, borderRadius: 5, background: "rgba(255,255,255,.22)" }}>
              {d.perf != null && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(d.perf) + "%", borderRadius: 5, background: "var(--ball)" }} />}
              <div style={{ position: "absolute", left: pct(d.midpoint) + "%", top: -3, bottom: -3, width: 2, background: "rgba(255,255,255,.5)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,.7)" }}>
              <span>{d.bandLow.toFixed(2)}</span><span>mid {d.midpoint.toFixed(2)}</span><span>{d.bandHigh.toFixed(2)}</span>
            </div>
          </div>
        )}
      </MHero>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {stats.map((s, i) => (
          <div key={i} className="mm-card" style={{ padding: "13px 15px" }}>
            <div className="mm-kicker">{s[0]}</div>
            <div className="mm-num" style={{ fontSize: 27, marginTop: 3, color: s[3] ? "var(--court)" : "var(--ink)" }}>{s[1]}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{s[2]}</div>
          </div>
        ))}
      </div>

      {d.series.length > 0 && (
        <div className="mm-card" style={{ padding: "16px 14px 10px" }}>
          <div className="mm-kicker" style={{ paddingLeft: 4 }}>Performance rating</div>
          <div style={{ marginTop: 8 }}>
            <RatingChart series={d.series} bandLow={d.bandLow} bandHigh={d.bandHigh} midpoint={d.midpoint} height={210} />
          </div>
        </div>
      )}

      <MSectionTitle caption="Ratings snapshotted at match time" right={`${d.log.length} courts`}>Match log</MSectionTitle>
      {rows.length === 0 ? (
        <div className="mm-card" style={{ padding: "24px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No matches ingested for this player yet.</div>
      ) : rows.map((m, i) => (
        <div key={i} className="mm-card" style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: m.won ? "#fff" : "var(--loss)", background: m.won ? "var(--court)" : "transparent", border: m.won ? "none" : "1.5px solid var(--loss)", borderRadius: 6, padding: m.won ? "2px 7px" : "1px 6px" }}>{m.won ? "WON" : "LOST"}</span>
              <span className="mm-mono" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>{m.kind}{m.line}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: m.cat === "mixed" ? "color-mix(in oklab, var(--cat-mixed) 16%, var(--card))" : "var(--court-tint)", color: m.cat === "mixed" ? "var(--cat-mixed)" : "var(--court)" }}>{m.cat === "mixed" ? "MX" : "AD"}</span>
            </div>
            <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtDate(m.date)}</span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginTop: 8 }}>
            {m.opp.length === 0 ? "—" : m.opp.map((o, j) => (
              <span key={j}>{j > 0 && <span style={{ color: "var(--muted)" }}> / </span>}{o[0]}<span className="mm-mono" style={{ fontSize: 11, color: "var(--muted)", marginLeft: 3 }}>{o[1] != null ? o[1].toFixed(2) : "—"}</span></span>
            ))}
          </div>
          {(m.oppTeam || m.partner) && (
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
              {m.oppTeam}{m.partner && <span>{"  ·  w/ "}{m.partner[0]} <span className="mm-mono">{m.partner[1] != null ? m.partner[1].toFixed(2) : "—"}</span></span>}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 7, gap: 10 }}>
            <span className="mm-mono" style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{score(m.sets)}</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 12, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Perf <span className="mm-mono" style={{ fontSize: 12.5, color: "var(--ink-2)", marginLeft: 1 }}>{m.perf != null ? m.perf.toFixed(2) : "—"}</span></span>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>After <span className="mm-num" style={{ fontSize: 16, color: m.cat === "mixed" ? "var(--cat-mixed)" : "var(--court)", marginLeft: 2 }}>{m.post != null ? m.post.toFixed(2) : "—"}</span></span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
