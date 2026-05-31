"use client";
// Head-to-head — Center Court. Prop-driven from real player data, with a
// search-backed player picker that navigates ?a=&b=.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, CourtLines } from "@/components/mm/ui";
import type { H2HData, H2HPlayer } from "@/lib/h2h";

const last = (n: string) => n.split(" ").slice(-1)[0];

function Picker({ self, other, side, align }: { self: H2HPlayer; other: H2HPlayer; side: "a" | "b"; align: "left" | "right" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; perf: number | null; band: number | null }>>([]);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/players/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const j = await r.json();
        setResults((j.results ?? []).filter((x: { id: string }) => x.id !== other.id));
        setActive(0); // reset highlight to the top result on each new query
      } catch { /* ignore */ }
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, other.id]);

  const pick = (id: string) => {
    const a = side === "a" ? id : other.id;
    const b = side === "b" ? id : other.id;
    router.push(`/h2h?a=${a}&b=${b}` as never);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 11, border: "1px solid var(--hair)", background: "var(--card)", cursor: "pointer", fontFamily: "var(--font-body)", minWidth: 230, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        <Avatar name={self.name} hi />
        <div style={{ flex: 1, textAlign: align === "right" ? "right" : "left" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{self.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Perf {self.perf != null ? self.perf.toFixed(2) : "—"}{self.band != null ? ` · ${self.band.toFixed(1)} band` : ""}</div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", marginTop: 6, [align === "right" ? "right" : "left"]: 0, zIndex: 20, background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 8, minWidth: 280 }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players…"
            role="combobox" aria-expanded={results.length > 0} aria-controls={`h2h-listbox-${side}`} aria-autocomplete="list"
            aria-activedescendant={results.length > 0 ? `h2h-opt-${side}-${active}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
              if (results.length === 0) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); const x = results[active]; if (x) pick(x.id); }
            }}
            style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--hair)", borderRadius: 8, background: "var(--paper)", fontSize: 13.5, color: "var(--ink)", fontFamily: "var(--font-body)", outline: "none", marginBottom: 6 }} />
          <div role="listbox" id={`h2h-listbox-${side}`} aria-label="Player results">
            {results.map((x, i) => (
              <button key={x.id} id={`h2h-opt-${side}-${i}`} role="option" aria-selected={i === active} onClick={() => pick(x.id)} onMouseEnter={() => setActive(i)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 8px", borderRadius: 8, border: "none", background: i === active ? "var(--court-tint)" : "transparent", cursor: "pointer", fontFamily: "var(--font-body)", textAlign: "left" }}>
                <Avatar name={x.name} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: "var(--ink)" }}>{x.name}</span>
                <span className="mm-num" style={{ fontSize: 16, color: "var(--court)" }}>{x.perf != null ? x.perf.toFixed(2) : "—"}</span>
              </button>
            ))}
          </div>
          {q.trim() && results.length === 0 && <div style={{ padding: "10px", color: "var(--muted)", fontSize: 13 }}>No matches.</div>}
        </div>
      )}
    </div>
  );
}

function HeroSide({ p, align }: { p: H2HPlayer; align: "left" | "right" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "right" ? "flex-end" : "flex-start", gap: 10 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,.16)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 19, fontFamily: "var(--font-display)" }}>{p.init}</div>
      <div className="mm-disp" style={{ fontSize: "clamp(22px, 6vw, 30px)", lineHeight: 1, textTransform: "uppercase", color: "#fff", textAlign: align, whiteSpace: "nowrap" }}>{p.name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: align === "right" ? "row" : "row-reverse" }}>
        <span className="mm-num" style={{ fontSize: "clamp(40px, 12vw, 52px)", lineHeight: 1, color: "#fff" }}>{p.perf != null ? p.perf.toFixed(2) : "—"}</span>
        {p.band != null && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--on-ball)", background: "var(--ball)", padding: "3px 8px", borderRadius: 100 }}>{p.band.toFixed(1)} BAND</span>}
      </div>
    </div>
  );
}

function CompareRow({ label, aT, bT, aN, bN, lower }: { label: string; aT: string; bT: string; aN: number; bN: number; lower?: boolean }) {
  const mx = Math.max(aN, bN) || 1, mn = Math.min(aN, bN) || 0.0001;
  const aFrac = lower ? mn / (aN || mn) : aN / mx;
  const bFrac = lower ? mn / (bN || mn) : bN / mx;
  const aLead = lower ? aN < bN : aN > bN;
  const bLead = lower ? bN < aN : bN > aN;
  const val = (t: string, lead: boolean) => <span className="mm-num" style={{ fontSize: 22, color: lead ? "var(--court)" : "var(--ink-2)" }}>{t}</span>;
  const bar = (frac: number, lead: boolean, sideA: boolean) => (
    <div className="mm-compare-bar" style={{ flex: 1, display: "flex", justifyContent: sideA ? "flex-end" : "flex-start" }}>
      <div style={{ height: 8, width: Math.max(0, Math.min(1, frac)) * 100 + "%", borderRadius: 4, background: lead ? "var(--court)" : "var(--hair)" }} />
    </div>
  );
  return (
    <div className="mm-compare" style={{ display: "grid", gridTemplateColumns: "62px 1fr 150px 1fr 62px", alignItems: "center", gap: 14, padding: "13px 0", borderTop: "1px solid var(--hair-2)" }}>
      <div style={{ textAlign: "right" }}>{val(aT, aLead)}</div>
      {bar(aFrac, aLead, true)}
      <div style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      {bar(bFrac, bLead, false)}
      <div style={{ textAlign: "left" }}>{val(bT, bLead)}</div>
    </div>
  );
}

const num = (v: number | null) => (v == null ? 0 : v);
const n2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));

export function H2H({ data }: { data: H2HData }) {
  const { a, b, meetings, common } = data;
  const router = useRouter();
  const aW = meetings.filter((m) => m.aWon).length;
  const bW = meetings.length - aW;
  return (
    <div className="mm-screen" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Link href="/players" style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, textDecoration: "none" }}>← Players directory</Link>
      <div className="mm-card" style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <Picker self={a} other={b} side="a" align="right" />
        <button onClick={() => router.push(`/h2h?a=${b.id}&b=${a.id}` as never)} title="Swap players" style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid var(--hair)", background: "var(--paper)", color: "var(--court)", cursor: "pointer", flexShrink: 0, fontSize: 16 }}>⇄</button>
        <Picker self={b} other={a} side="b" align="left" />
      </div>
      <div className="mm-hero" style={{ position: "relative", overflow: "hidden", borderRadius: 16, background: "var(--hero-bg)", color: "#fff", padding: "30px 44px", boxShadow: "var(--shadow)" }}>
        <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
        <CourtLines opacity={0.16} />
        <div className="mm-hero-row" style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 40 }}>
          <HeroSide p={a} align="right" />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>Head to head</div>
            <div className="mm-num" style={{ fontSize: 44, color: "var(--ball)", margin: "2px 0" }}>{aW}–{bW}</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)", fontWeight: 600 }}>{meetings.length ? meetings.length + " meeting" + (meetings.length > 1 ? "s" : "") : "no meetings yet"}</div>
          </div>
          <HeroSide p={b} align="left" />
        </div>
      </div>
      <div className="mm-card" style={{ padding: "8px 26px 18px" }}>
        <div className="mm-compare" style={{ display: "grid", gridTemplateColumns: "1fr 150px 1fr", alignItems: "center", padding: "14px 0 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={a.name} hi /><span style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</span></div>
          <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>COMPARE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}><span style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</span><Avatar name={b.name} /></div>
        </div>
        <CompareRow label="Perf rating" aT={n2(a.perf)} bT={n2(b.perf)} aN={num(a.perf)} bN={num(b.perf)} />
        <CompareRow label="Win rate" aT={a.winPct + "%"} bT={b.winPct + "%"} aN={a.winPct} bN={b.winPct} />
        <CompareRow label="Record" aT={`${a.w}–${a.l}`} bT={`${b.w}–${b.l}`} aN={a.w} bN={b.w} />
        <CompareRow label="Adult NTRP" aT={n2(a.adult)} bT={n2(b.adult)} aN={num(a.adult)} bN={num(b.adult)} />
        <CompareRow label="Mixed NTRP" aT={n2(a.mixed)} bT={n2(b.mixed)} aN={num(a.mixed)} bN={num(b.mixed)} />
      </div>
      <div className="mm-stack" style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
        <div className="mm-card" style={{ overflow: "hidden", flex: "1 1 0" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hair)", fontSize: 14, fontWeight: 700 }}>Their meetings</div>
          {meetings.length === 0 ? (
            <div style={{ padding: "26px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No prior meetings on record yet.</div>
          ) : meetings.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>
                <span style={{ color: m.aWon ? "var(--court)" : "var(--muted)", fontWeight: m.aWon ? 700 : 600 }}>{last(a.name)}</span>
                <span style={{ color: "var(--muted)", margin: "0 7px" }}>{m.aWon ? "def." : "lost to"}</span>
                <span style={{ color: !m.aWon ? "var(--court)" : "var(--muted)", fontWeight: !m.aWon ? 700 : 600 }}>{last(b.name)}</span>
                <span style={{ color: "var(--muted)", marginLeft: 8, fontWeight: 500 }}>· {m.court}</span>
              </div>
              <span className="mm-mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>{m.score}</span>
            </div>
          ))}
        </div>
        <div className="mm-card" style={{ overflow: "hidden", flex: "1 1 0" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hair)", fontSize: 14, fontWeight: 700 }}>Common opponents</div>
          {common.length === 0 ? (
            <div style={{ padding: "26px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No shared opponents yet.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "10px 20px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>
                <span>Opponent</span><span style={{ width: 56, textAlign: "right" }}>{last(a.name)}</span><span style={{ width: 56, textAlign: "right" }}>{last(b.name)}</span>
              </div>
              {common.map((o, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "10px 20px", borderTop: "1px solid var(--hair-2)" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{o.name}</span>
                  <span className="mm-mono" style={{ width: 56, textAlign: "right", fontSize: 13, fontWeight: o.aN > o.bN ? 700 : 500, color: o.aN > o.bN ? "var(--court)" : "var(--ink-2)" }}>{o.aRec}</span>
                  <span className="mm-mono" style={{ width: 56, textAlign: "right", fontSize: 13, fontWeight: o.bN > o.aN ? 700 : 500, color: o.bN > o.aN ? "var(--court)" : "var(--ink-2)" }}>{o.bRec}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
