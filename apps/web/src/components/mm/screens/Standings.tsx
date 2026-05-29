"use client";
// Standings — Center Court (demo data).
import Link from "next/link";
import { PageHero, Avatar, Chip } from "@/components/mm/ui";
import * as MM from "@/lib/demo";

export function Standings() {
  const maxDiff = Math.max(...MM.standings.map((s) => Math.abs(s.cw - s.cl)));
  const right = (
    <div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", fontWeight: 600 }}>Summer 2025</div>
      <div style={{ fontSize: 16, color: "#fff", fontWeight: 700, marginTop: 2 }}>8 teams · 7 weeks</div>
    </div>
  );
  const head = ["#", "Team", "W", "L", "Courts W", "Courts L", "Court diff"];
  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHero kicker="Adult 40 & Over · 4.0 Men" title="Standings" right={right}
        sub="USTA NorCal · regular-season league table, ranked by team wins then court differential." />
      <div className="mm-card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} style={{ padding: "13px 18px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", textAlign: i === 1 ? "left" : i < 1 ? "center" : i >= 2 && i <= 5 ? "right" : "left", background: "var(--paper)", borderBottom: "1px solid var(--hair)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MM.standings.map((s, i) => {
              const diff = s.cw - s.cl;
              return (
                <tr key={i} style={{ borderTop: "1px solid var(--hair-2)", background: s.me ? "var(--court-tint)" : "transparent" }}>
                  <td className="mm-num" style={{ padding: "13px 18px", textAlign: "center", fontSize: 18, color: i < 4 ? "var(--court)" : "var(--ink-2)" }}>{i + 1}</td>
                  <td style={{ padding: "13px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <Avatar name={s.team} hi={s.me} />
                      <Link href="/teams/demo" style={{ fontWeight: 700, fontSize: 14.5, color: s.me ? "var(--court)" : "var(--ink)", textDecoration: "none" }}>{s.team}</Link>
                      {i === 0 && <Chip tone="ball">1st</Chip>}
                    </div>
                  </td>
                  <td className="mm-num" style={{ padding: "13px 18px", textAlign: "right", fontSize: 17 }}>{s.w}</td>
                  <td className="mm-mono" style={{ padding: "13px 18px", textAlign: "right", color: "var(--muted)" }}>{s.l}</td>
                  <td className="mm-mono" style={{ padding: "13px 18px", textAlign: "right", color: "var(--ink-2)" }}>{s.cw}</td>
                  <td className="mm-mono" style={{ padding: "13px 18px", textAlign: "right", color: "var(--muted)" }}>{s.cl}</td>
                  <td style={{ padding: "13px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="mm-num" style={{ width: 38, fontSize: 15, color: diff > 0 ? "var(--win)" : diff < 0 ? "var(--loss)" : "var(--muted)" }}>{(diff > 0 ? "+" : "") + diff}</span>
                      <div style={{ position: "relative", flex: 1, maxWidth: 200, height: 8 }}>
                        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--hair)" }} />
                        <div style={{ position: "absolute", top: 0, bottom: 0, height: 8, borderRadius: 4, background: diff >= 0 ? "var(--court)" : "var(--loss)", left: diff >= 0 ? "50%" : `calc(50% - ${(Math.abs(diff) / maxDiff) * 50}%)`, width: `${(Math.abs(diff) / maxDiff) * 50}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Court differential breaks ties on equal team-match records.</div>
    </div>
  );
}
