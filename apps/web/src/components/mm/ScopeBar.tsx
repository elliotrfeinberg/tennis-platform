"use client";

// Global scope filter bar — Section › Season › League › Flight. Rendered under
// the Nav on every page (from the layout). The current scope is persisted in a
// cookie (read server-side), so it survives navigation between every page.
// Changing a level rewrites the cookie and refreshes the route; cascading, so
// choosing a level clears the narrower ones. Counts come from the precomputed
// tree, so no fetch happens on render.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SCOPE_COOKIE } from "@/lib/scopeShared";
import {
  scopeOptions,
  scopeNodes,
  scopeCount,
  scopeDepth,
  EMPTY_SCOPE,
  type Scope,
  type ScopeTree,
  type ScopeNode,
} from "@/lib/scopeShared";

const SCOPE_KEYS = ["section", "season", "league", "flight", "subflight"] as const;
type ScopeKey = (typeof SCOPE_KEYS)[number];

function writeCookie(scope: Scope) {
  const v = encodeURIComponent(JSON.stringify(scope));
  document.cookie = `${SCOPE_COOKIE}=${v}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function ScopeBar({ tree, current }: { tree: ScopeTree; current: Scope }) {
  const router = useRouter();
  const scope = current;
  const opts = scopeOptions(tree, scope);
  const sel = scopeNodes(tree, scope);

  // Set one scope level (or clear it with null), dropping everything narrower,
  // then persist + refresh so the server re-renders with the new scope.
  function pick(level: ScopeKey, id: string | null) {
    const next: Scope = { ...scope };
    const idx = SCOPE_KEYS.indexOf(level);
    for (let i = idx; i < SCOPE_KEYS.length; i++) next[SCOPE_KEYS[i]!] = null;
    if (id) next[level] = id;
    writeCookie(next);
    router.refresh();
  }
  function clearAll() {
    writeCookie({ ...EMPTY_SCOPE });
    router.refresh();
  }

  const count = scopeCount(tree, scope);
  const depth = scopeDepth(scope);

  return (
    <div className="mm-scopebar" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 44px", minHeight: 52, borderBottom: "1px solid var(--hair)", background: "var(--paper)", position: "relative", zIndex: 2 }}>
      <div className="mm-scope-tag" style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--court)", flexShrink: 0 }}>
        <svg width={15} height={15} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7}>
          <path d="M1.5 3h13l-5 6v4l-3 1.5V9z" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>Scope</span>
      </div>
      <div className="mm-scope-menus" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Menu label="Section" value={sel.section} options={opts.sections} onPick={(id) => pick("section", id)} />
        <Sep />
        <Menu label="Season" value={sel.season} options={opts.seasons} disabled={!scope.section} onPick={(id) => pick("season", id)} />
        <Sep />
        <Menu label="League" value={sel.league} options={opts.leagues} disabled={!scope.season} onPick={(id) => pick("league", id)} />
        <Sep />
        <Menu label="Flight" value={sel.flight} options={opts.flights} disabled={!scope.league} onPick={(id) => pick("flight", id)} />
        <Sep />
        <Menu label="Subflight" value={sel.subflight} options={opts.subflights} disabled={!scope.flight} onPick={(id) => pick("subflight", id)} />
      </div>
      <div className="mm-scope-spacer" style={{ flex: 1 }} />
      <div className="mm-scope-right" style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
          <span className="mm-mono" style={{ fontWeight: 700, color: "var(--ink)" }}>{count.toLocaleString("en-US")}</span> players in scope
        </span>
        {depth > 0 && (
          <button onClick={clearAll} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--hair)", background: "var(--card)", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--ink-2)", flexShrink: 0 }}>
            <span style={{ fontSize: 13 }}>×</span> Clear
          </button>
        )}
      </div>
    </div>
  );
}

function Sep() {
  return <span style={{ color: "var(--hair)", fontSize: 13, flexShrink: 0 }}>›</span>;
}

function Menu({ label, value, options, onPick, disabled }: {
  label: string;
  value: ScopeNode | null;
  options: ScopeNode[];
  onPick: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isOff = disabled || options.length === 0;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => !isOff && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8,
          border: "1px solid " + (value ? "var(--court)" : "var(--hair)"),
          background: value ? "var(--court-tint)" : "var(--card)",
          cursor: isOff ? "default" : "pointer", opacity: isOff ? 0.4 : 1,
          fontFamily: "var(--font-body)", maxWidth: 230,
        }}
      >
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: value ? "var(--court)" : "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value ? value.name : "All"}</span>
        <span style={{ color: "var(--muted)", fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div role="listbox" style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 31, minWidth: 230, maxHeight: 320, overflow: "auto", background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 11, boxShadow: "var(--shadow)", padding: 6 }}>
            <Opt active={!value} onClick={() => { onPick(null); setOpen(false); }}>
              <span>{`All ${label.toLowerCase()}s`}</span>
            </Opt>
            {options.map((o) => (
              <Opt key={o.id} active={!!value && value.id === o.id} onClick={() => { onPick(o.id); setOpen(false); }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                <span className="mm-mono" style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>{o.n.toLocaleString("en-US")}</span>
              </Opt>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Opt({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="option"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%",
        padding: "8px 10px", borderRadius: 8, border: "none", textAlign: "left", cursor: "pointer",
        fontFamily: "var(--font-body)", fontSize: 13, fontWeight: active ? 700 : 500,
        background: active ? "var(--court-tint)" : "transparent",
        color: active ? "var(--court)" : "var(--ink)",
      }}
    >
      {children}
    </button>
  );
}
