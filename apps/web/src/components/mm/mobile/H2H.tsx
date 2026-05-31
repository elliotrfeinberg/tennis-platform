"use client";
// Mobile Head-to-head — two pickable players, series hero, compare rows,
// meetings, and common opponents. Same H2HData the desktop screen consumes.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/mm/ui";
import { Icon } from "./shell";
import type { H2HData, H2HPlayer } from "@/lib/h2h";

const last = (n: string) => n.split(" ").slice(-1)[0];
const n2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const num = (v: number | null) => (v == null ? 0 : v);

function Picker({ self, other, side }: { self: H2HPlayer; other: H2HPlayer; side: "a" | "b" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; perf: number | null }>>([]);
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
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "10px 12px", borderRadius: 11, border: "1px solid var(--hair)", background: "var(--card)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
        <Avatar name={self.name} hi={side === "a"} />
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{self.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Perf {n2(self.perf)}</div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, zIndex: 20, background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 8 }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players…"
            style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--hair)", borderRadius: 8, background: "var(--paper)", fontSize: 13.5, color: "var(--ink)", fontFamily: "var(--font-body)", outline: "none", marginBottom: 6, boxSizing: "border-box" }} />
          {results.map((x) => (
            <button key={x.id} onClick={() => pick(x.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)", textAlign: "left" }}>
              <Avatar name={x.name} />
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13.5, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</span>
              <span className="mm-num" style={{ fontSize: 16, color: "var(--court)" }}>{n2(x.perf)}</span>
            </button>
          ))}
          {q.trim() && results.length === 0 && <div style={{ padding: 10, color: "var(--muted)", fontSize: 13 }}>No matches.</div>}
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, aT, bT, aN, bN, lower }: { label: string; aT: string; bT: string; aN: number; bN: number; lower?: boolean }) {
  const aLead = lower ? aN < bN : aN > bN;
  const bLead = lower ? bN < aN : bN > aN;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, padding: "11px 0", borderTop: "1px solid var(--hair-2)" }}>
      <span className="mm-num" style={{ fontSize: 19, textAlign: "left", color: aLead ? "var(--court)" : "var(--ink-2)" }}>{aT}</span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</span>
      <span className="mm-num" style={{ fontSize: 19, textAlign: "right", color: bLead ? "var(--court)" : "var(--ink-2)" }}>{bT}</span>
    </div>
  );
}

export function MobileH2H({ data }: { data: H2HData }) {
  const { a, b, meetings, common } = data;
  const router = useRouter();
  const aW = meetings.filter((m) => m.aWon).length;
  const bW = meetings.length - aW;
  return (
    <div className="mm-mscreen">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Picker self={a} other={b} side="a" />
        <button onClick={() => router.push(`/h2h?a=${b.id}&b=${a.id}` as never)} title="Swap" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, border: "1px solid var(--hair)", background: "var(--paper)", color: "var(--court)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="swap" size={18} />
        </button>
        <Picker self={b} other={a} side="b" />
      </div>

      <div className="mm-mhero" style={{ padding: "20px 18px" }}>
        <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>{a.init}</div>
            <div className="mm-num" style={{ fontSize: 28, color: "#fff" }}>{n2(a.perf)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="mm-num" style={{ fontSize: 32, color: "var(--ball)" }}>{aW}–{bW}</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.75)", fontWeight: 600 }}>{meetings.length ? meetings.length + " meeting" + (meetings.length > 1 ? "s" : "") : "no meetings"}</div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>{b.init}</div>
            <div className="mm-num" style={{ fontSize: 28, color: "#fff" }}>{n2(b.perf)}</div>
          </div>
        </div>
      </div>

      <div className="mm-card" style={{ padding: "4px 18px 14px" }}>
        <CompareRow label="Perf" aT={n2(a.perf)} bT={n2(b.perf)} aN={num(a.perf)} bN={num(b.perf)} />
        <CompareRow label="Win rate" aT={a.winPct + "%"} bT={b.winPct + "%"} aN={a.winPct} bN={b.winPct} />
        <CompareRow label="Record" aT={`${a.w}–${a.l}`} bT={`${b.w}–${b.l}`} aN={a.w} bN={b.w} />
        <CompareRow label="Adult NTRP" aT={n2(a.adult)} bT={n2(b.adult)} aN={num(a.adult)} bN={num(b.adult)} />
        <CompareRow label="Mixed NTRP" aT={n2(a.mixed)} bT={n2(b.mixed)} aN={num(a.mixed)} bN={num(b.mixed)} />
      </div>

      <div className="mm-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--hair)", fontSize: 14, fontWeight: 700 }}>Their meetings</div>
        {meetings.length === 0 ? (
          <div style={{ padding: "22px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>No prior meetings on record yet.</div>
        ) : meetings.map((m, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: i ? "1px solid var(--hair-2)" : "none" }}>
            <div style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>
              <span style={{ color: m.aWon ? "var(--court)" : "var(--muted)", fontWeight: 700 }}>{last(a.name)}</span>
              <span style={{ color: "var(--muted)", margin: "0 6px", fontWeight: 500 }}>{m.aWon ? "def." : "lost to"}</span>
              <span style={{ color: !m.aWon ? "var(--court)" : "var(--muted)", fontWeight: 700 }}>{last(b.name)}</span>
              <span style={{ color: "var(--muted)", marginLeft: 6, fontWeight: 500 }}>· {m.court}</span>
            </div>
            <span className="mm-mono" style={{ fontSize: 12.5, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{m.score}</span>
          </div>
        ))}
      </div>

      {common.length > 0 && (
        <div className="mm-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--hair)", fontSize: 14, fontWeight: 700 }}>Common opponents</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "10px 16px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
            <span>Opponent</span><span style={{ width: 50, textAlign: "right" }}>{last(a.name)}</span><span style={{ width: 50, textAlign: "right" }}>{last(b.name)}</span>
          </div>
          {common.map((o, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--hair-2)" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</span>
              <span className="mm-mono" style={{ width: 50, textAlign: "right", fontSize: 13, fontWeight: o.aN > o.bN ? 700 : 500, color: o.aN > o.bN ? "var(--court)" : "var(--ink-2)" }}>{o.aRec}</span>
              <span className="mm-mono" style={{ width: 50, textAlign: "right", fontSize: 13, fontWeight: o.bN > o.aN ? 700 : 500, color: o.bN > o.aN ? "var(--court)" : "var(--ink-2)" }}>{o.bRec}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
