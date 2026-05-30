"use client";
// Player search with live autocomplete — Center Court. Queries the real
// /api/players/search endpoint (debounced) over the full ~20k-player index.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/mm/ui";

interface Result {
  id: string;
  name: string;
  gender: string | null;
  perf: number | null;
  band: number | null;
}

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

function ResultRow({ p, q, active, id, onHover }: { p: Result; q: string; active?: boolean; id?: string; onHover?: () => void }) {
  return (
    <Link href={`/players/${p.id}` as never} id={id} role="option" aria-selected={active} onMouseEnter={onHover} style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 16px", textDecoration: "none", background: active ? "var(--court-tint)" : "transparent", borderRadius: 10 }}>
      <Avatar name={p.name} hi={active} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: "var(--ink)" }}><Highlight text={p.name} q={q} /></div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{(p.gender === "M" ? "Men" : p.gender === "F" ? "Women" : "—") + " · USTA NorCal" + (p.band != null ? " · " + p.band.toFixed(1) + " band" : "")}</div>
      </div>
      <span className="mm-num" style={{ fontSize: 22, color: "var(--court)", width: 56, textAlign: "right" }}>{p.perf != null ? p.perf.toFixed(2) : "—"}</span>
    </Link>
  );
}

export function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); setTotal(0); setActive(0); return; }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/players/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const j = await r.json();
        setResults(j.results ?? []);
        setTotal(j.total ?? 0);
        setActive(0); // reset highlight to the top result on each new query
      } catch {
        /* aborted / network */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const has = results.length > 0;
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "64px 44px 80px" }}>
      <div className="mm-kicker" style={{ textAlign: "center" }}>Player search</div>
      <h1 className="mm-disp" style={{ fontSize: 64, textTransform: "uppercase", textAlign: "center", margin: "10px 0 0", color: "var(--ink)" }}>
        Find a <span style={{ color: "var(--court)" }}>player</span>
      </h1>
      <p style={{ textAlign: "center", fontSize: 15, color: "var(--ink-2)", margin: "12px 0 30px" }}>
        Search NorCal players by name. Start typing — results rank by current perf rating.
      </p>
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", border: "2px solid var(--court)", borderRadius: has ? "16px 16px 0 0" : 16, background: "var(--card)", boxShadow: "var(--shadow)" }}>
          <svg width={22} height={22} viewBox="0 0 22 22" fill="none" style={{ color: "var(--court)", flexShrink: 0 }}>
            <circle cx={9.5} cy={9.5} r={6.5} stroke="currentColor" strokeWidth={2} />
            <path d="M15 15l4.5 4.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <input ref={inputRef} value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search players…" autoFocus
            role="combobox" aria-expanded={has} aria-controls="search-listbox" aria-autocomplete="list"
            aria-activedescendant={has ? `search-opt-${active}` : undefined}
            onKeyDown={(e) => {
              if (!has) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); const p = results[active]; if (p) router.push(`/players/${p.id}` as never); }
              else if (e.key === "Escape") { e.preventDefault(); setQ(""); }
            }}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-body)", fontSize: 19, fontWeight: 500, color: "var(--ink)" }} />
          {q && (
            <button onClick={() => { setQ(""); inputRef.current?.focus(); }}
              style={{ border: "none", background: "var(--hair-2)", color: "var(--ink-2)", width: 26, height: 26, borderRadius: 13, cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
          )}
        </div>
        {has && (
          <div style={{ border: "2px solid var(--court)", borderTop: "none", borderRadius: "0 0 16px 16px", background: "var(--card)", boxShadow: "var(--shadow)", padding: 8, overflow: "hidden" }}>
            <div role="listbox" id="search-listbox" aria-label="Player search results">
              {results.map((p, i) => <ResultRow key={p.id} id={`search-opt-${i}`} p={p} q={q.trim()} active={i === active} onHover={() => setActive(i)} />)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px 4px", borderTop: "1px solid var(--hair-2)", marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                <span className="mm-mono" style={{ fontWeight: 600, color: "var(--ink-2)" }}>{results.length}</span>{total > results.length ? ` of ${total.toLocaleString()}` : ""} matches
              </span>
              <span style={{ fontSize: 11.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--hair-2)", borderRadius: 5, padding: "2px 6px", color: "var(--ink-2)" }}>↵</kbd>open profile
              </span>
            </div>
          </div>
        )}
        {q.trim() && !has && !loading && (
          <div style={{ border: "2px solid var(--hair)", borderTop: "none", borderRadius: "0 0 16px 16px", background: "var(--card)", padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            No players match “{q}”.
          </div>
        )}
      </div>
      {!q.trim() && (
        <div style={{ marginTop: 22, textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
          Type a name to search the full NorCal player index.
        </div>
      )}
    </div>
  );
}
