"use client";
// Player search with live autocomplete — Center Court (demo data).
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Avatar, TrendArrow } from "@/components/mm/ui";
import * as MM from "@/lib/demo";
import type { DirRow } from "@/lib/demo";

const POOL: DirRow[] = MM.directory
  .concat([
    { name: "Marin Alvarez", g: "F", b25: 3.5, b24: 3.0, perf: 3.41, type: "C", trend: +0.05, conf: "Med" },
    { name: "Nate Frye", g: "M", b25: 4.5, b24: 4.0, perf: 4.04, type: "C", trend: +0.09, conf: "Med" },
    { name: "Marco Reyes", g: "M", b25: 4.0, b24: 4.0, perf: 3.92, type: "C", trend: -0.01, conf: "High" },
    { name: "Sam Ito", g: "M", b25: 3.5, b24: 3.5, perf: 3.71, type: "C", trend: +0.02, conf: "High" },
    { name: "Theo Park", g: "M", b25: 4.0, b24: 4.0, perf: 3.98, type: "C", trend: -0.01, conf: "High" },
  ])
  .filter((p, i, a) => a.findIndex((x) => x.name === p.name) === i);

const RECENT = ["Marcus Holloway", "Andre Sato", "Nate Frye"];

function Highlight({ text, q }: { text: string; q: string }): ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ background: "color-mix(in oklab, var(--ball) 50%, transparent)", borderRadius: 3, padding: "0 1px" }}>{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

function ResultRow({ p, q, active }: { p: DirRow; q: string; active?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 16px", cursor: "pointer", background: active ? "var(--court-tint)" : "transparent", borderRadius: 10 }}>
      <Avatar name={p.name} hi={active} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: "var(--ink)" }}><Highlight text={p.name} q={q} /></div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{(p.g === "M" ? "Men" : "Women") + " · USTA NorCal · " + p.b25.toFixed(1) + " band"}</div>
      </div>
      <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 60, textAlign: "right" }}><TrendArrow v={p.trend} /></div>
        <span className="mm-num" style={{ fontSize: 22, color: "var(--court)", width: 56, textAlign: "right" }}>{p.perf.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function Search() {
  const [q, setQ] = useState("ma");
  const inputRef = useRef<HTMLInputElement>(null);
  const allMatches = POOL.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const results = q.trim() ? [...allMatches].sort((a, b) => b.perf - a.perf).slice(0, 7) : [];

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "64px 44px 80px" }}>
      <div className="mm-kicker" style={{ textAlign: "center" }}>Player search</div>
      <h1 className="mm-disp" style={{ fontSize: 64, textTransform: "uppercase", textAlign: "center", margin: "10px 0 0", color: "var(--ink)" }}>
        Find a <span style={{ color: "var(--court)" }}>player</span>
      </h1>
      <p style={{ textAlign: "center", fontSize: 15, color: "var(--ink-2)", margin: "12px 0 30px" }}>
        Search 20,180 NorCal players by name. Start typing — results rank by current perf rating.
      </p>
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", border: "2px solid var(--court)", borderRadius: results.length ? "16px 16px 0 0" : 16, background: "var(--card)", boxShadow: "var(--shadow)" }}>
          <svg width={22} height={22} viewBox="0 0 22 22" fill="none" style={{ color: "var(--court)", flexShrink: 0 }}>
            <circle cx={9.5} cy={9.5} r={6.5} stroke="currentColor" strokeWidth={2} />
            <path d="M15 15l4.5 4.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <input ref={inputRef} value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search players…" autoFocus
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-body)", fontSize: 19, fontWeight: 500, color: "var(--ink)" }} />
          {q && (
            <button onClick={() => { setQ(""); inputRef.current?.focus(); }}
              style={{ border: "none", background: "var(--hair-2)", color: "var(--ink-2)", width: 26, height: 26, borderRadius: 13, cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
          )}
        </div>
        {results.length > 0 && (
          <div style={{ border: "2px solid var(--court)", borderTop: "none", borderRadius: "0 0 16px 16px", background: "var(--card)", boxShadow: "var(--shadow)", padding: 8, overflow: "hidden" }}>
            {results.map((p, i) => <ResultRow key={p.name} p={p} q={q.trim()} active={i === 0} />)}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px 4px", borderTop: "1px solid var(--hair-2)", marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                <span className="mm-mono" style={{ fontWeight: 600, color: "var(--ink-2)" }}>{results.length}</span> of {allMatches.length} matches
              </span>
              <span style={{ fontSize: 11.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--hair-2)", borderRadius: 5, padding: "2px 6px", color: "var(--ink-2)" }}>↵</kbd>open profile
              </span>
            </div>
          </div>
        )}
        {q.trim() && results.length === 0 && (
          <div style={{ border: "2px solid var(--hair)", borderTop: "none", borderRadius: "0 0 16px 16px", background: "var(--card)", padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            No players match “{q}”.
          </div>
        )}
      </div>
      {!q.trim() && (
        <div style={{ marginTop: 22, textAlign: "center" }}>
          <div className="mm-kicker" style={{ marginBottom: 10 }}>Recent</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {RECENT.map((n) => (
              <button key={n} onClick={() => setQ(n.split(" ")[0]!)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px 7px 8px", borderRadius: 100, border: "1px solid var(--hair)", background: "var(--card)", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                <Avatar name={n} />{n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
