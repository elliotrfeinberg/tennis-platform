"use client";
// Mobile player search — live autocomplete over /api/players/search, full-width
// results list sized for touch. Mirrors the desktop Search behaviour.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/mm/ui";
import { Icon } from "./shell";

interface Result { id: string; name: string; gender: string | null; perf: number | null; band: number | null }

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

export function MobileSearch() {
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
        setActive(0);
      } catch { /* aborted / network */ } finally { setLoading(false); }
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const has = results.length > 0;
  return (
    <div className="mm-mscreen">
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderRadius: 12, background: "var(--card)", border: "2px solid var(--court)", color: "var(--ink)" }}>
        <span style={{ color: "var(--court)", display: "flex", flexShrink: 0 }}><Icon name="search" size={19} /></span>
        <input
          ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players…" autoFocus
          role="combobox" aria-expanded={has} aria-autocomplete="list"
          onKeyDown={(e) => {
            if (!has) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); const p = results[active]; if (p) router.push(`/players/${p.id}` as never); }
            else if (e.key === "Escape") { e.preventDefault(); setQ(""); }
          }}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 500, color: "var(--ink)" }}
        />
        {q && (
          <button onClick={() => { setQ(""); inputRef.current?.focus(); }} style={{ flexShrink: 0, border: "none", background: "var(--hair-2)", color: "var(--ink-2)", width: 24, height: 24, borderRadius: 12, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
        )}
      </div>

      {q.trim() !== "" && (
        <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, padding: "0 2px" }}>
          {has ? `${results.length}${total > results.length ? ` of ${total.toLocaleString("en-US")}` : ""} matches · ranked by perf rating` : loading ? "Searching…" : `No players match “${q.trim()}”.`}
        </div>
      )}

      {has && (
        <div className="mm-card" style={{ overflow: "hidden" }}>
          {results.map((p, i) => (
            <Link key={p.id} href={`/players/${p.id}` as never} onMouseEnter={() => setActive(i)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i ? "1px solid var(--hair-2)" : "none", textDecoration: "none", background: i === active ? "var(--court-tint)" : "transparent" }}>
              <Avatar name={p.name} hi={i === active} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><Highlight text={p.name} q={q.trim()} /></div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{(p.gender === "M" ? "Men" : p.gender === "F" ? "Women" : "—") + " · NorCal" + (p.band != null ? " · " + p.band.toFixed(1) + " band" : "")}</div>
              </div>
              <span className="mm-num" style={{ fontSize: 20, color: "var(--court)" }}>{p.perf != null ? p.perf.toFixed(2) : "—"}</span>
            </Link>
          ))}
        </div>
      )}

      {!q.trim() && (
        <div style={{ marginTop: 8, textAlign: "center", fontSize: 13, color: "var(--muted)" }}>Type a name to search the full NorCal player index.</div>
      )}
    </div>
  );
}
