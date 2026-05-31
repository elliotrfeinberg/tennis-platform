"use client";

// Mobile chrome: a sticky top bar + scope chip and a fixed bottom tab bar,
// rendered alongside the desktop nav and switched purely by CSS (.mm-mobile-only).
// The scope chip opens a bottom-sheet picker that drives the SAME cookie-backed
// global scope as the desktop ScopeBar (cascading Section › … › Subflight).

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BallMark } from "@/components/mm/ui";
import { useTheme } from "@/components/mm/ThemeProvider";
import { Icon } from "./shell";
import {
  SCOPE_COOKIE,
  scopeOptions,
  scopeNodes,
  scopeCount,
  scopeSummary,
  scopeDepth,
  EMPTY_SCOPE,
  type Scope,
  type ScopeTree,
} from "@/lib/scopeShared";

const SCOPE_KEYS = ["section", "season", "league", "flight", "subflight"] as const;
type ScopeKey = (typeof SCOPE_KEYS)[number];

function writeCookie(scope: Scope) {
  const v = encodeURIComponent(JSON.stringify(scope));
  document.cookie = `${SCOPE_COOKIE}=${v}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

interface RouteChrome {
  title: string | null;
  back: { label: string; href: string } | null;
  scope: boolean;
}

function routeChrome(pathname: string): RouteChrome {
  const is = (re: RegExp) => re.test(pathname);
  if (pathname === "/") return { title: null, back: null, scope: false };
  if (is(/^\/players\/[^/]+/)) return { title: null, back: { label: "Players", href: "/players" }, scope: false };
  if (pathname.startsWith("/players")) return { title: "Players", back: null, scope: true };
  if (pathname.startsWith("/search")) return { title: "Search", back: null, scope: false };
  if (pathname.startsWith("/ratings")) return { title: "Ratings", back: null, scope: true };
  if (pathname.startsWith("/captain")) return { title: "Captain", back: null, scope: true };
  if (is(/^\/teams\/[^/]+/)) return { title: null, back: { label: "Standings", href: "/teams" }, scope: false };
  if (pathname.startsWith("/teams")) return { title: "Standings", back: null, scope: true };
  if (is(/^\/matches\//)) return { title: "Match", back: { label: "Back", href: "/teams" }, scope: false };
  if (pathname.startsWith("/h2h")) return { title: "Head to head", back: { label: "Players", href: "/players" }, scope: false };
  return { title: null, back: null, scope: false };
}

function TopBar({ chrome }: { chrome: RouteChrome }) {
  return (
    <div
      style={{
        height: 54, display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: 0, paddingBottom: 0,
        paddingLeft: "max(14px, env(safe-area-inset-left))",
        paddingRight: "max(14px, env(safe-area-inset-right))",
        background: "var(--card)", borderBottom: "1px solid var(--hair)",
      }}
    >
      {chrome.back ? (
        <Link href={chrome.back.href as never} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--court)", textDecoration: "none", minWidth: 0 }}>
          <Icon name="back" size={23} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--court)" }}>{chrome.back.label}</span>
        </Link>
      ) : (
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <BallMark size={24} />
          <span className="mm-disp" style={{ fontSize: 21, textTransform: "uppercase", color: "var(--ink)" }}>
            Match<span style={{ color: "var(--court)" }}>Metric</span>
          </span>
        </Link>
      )}
      {chrome.title && chrome.back && (
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{chrome.title}</span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 14, color: "var(--ink-2)" }}>
        <Link href="/search" style={{ color: "var(--ink-2)", display: "flex" }} aria-label="Search">
          <Icon name="search" size={21} />
        </Link>
      </div>
    </div>
  );
}

function ScopeChip({ tree, scope, onOpen }: { tree: ScopeTree; scope: Scope; onOpen: () => void }) {
  return (
    <div style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: "max(14px, env(safe-area-inset-left))", paddingRight: "max(14px, env(safe-area-inset-right))", background: "var(--paper)", borderBottom: "1px solid var(--hair)" }}>
      <button
        onClick={onOpen}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 13px",
          borderRadius: 11, background: "var(--card)", border: "1px solid var(--hair)",
          cursor: "pointer", fontFamily: "var(--font-body)", textAlign: "left",
        }}
      >
        <span style={{ color: "var(--court)", display: "flex" }}><Icon name="funnel" size={16} stroke={1.8} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)" }}>Scope</span>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{scopeSummary(tree, scope)}</span>
        </span>
        <span className="mm-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{scopeCount(tree, scope).toLocaleString("en-US")}</span>
        <span style={{ color: "var(--muted)", display: "flex" }}><Icon name="down" size={16} /></span>
      </button>
    </div>
  );
}

// Bottom sheet shell — dim overlay + rounded panel that slides from the bottom.
function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mm-mobile-only" style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(8,18,13,.45)" }} />
      <div
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "82vh",
          display: "flex", flexDirection: "column",
          background: "var(--bg)", borderRadius: "20px 20px 0 0", border: "1px solid var(--hair)",
          boxShadow: "0 -16px 50px rgba(8,18,13,.3)", paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 10px", borderBottom: "1px solid var(--hair)" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{title}</span>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--hair)", background: "var(--card)", color: "var(--ink-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
        {footer && <div style={{ borderTop: "1px solid var(--hair)", padding: "12px 16px" }}>{footer}</div>}
      </div>
    </div>
  );
}

function ScopeSheet({ tree, scope, onClose }: { tree: ScopeTree; scope: Scope; onClose: () => void }) {
  const router = useRouter();
  const opts = scopeOptions(tree, scope);
  const sel = scopeNodes(tree, scope);

  function pick(level: ScopeKey, id: string | null) {
    const next: Scope = { ...scope };
    const idx = SCOPE_KEYS.indexOf(level);
    for (let i = idx; i < SCOPE_KEYS.length; i++) next[SCOPE_KEYS[i]!] = null;
    if (id) next[level] = id;
    writeCookie(next);
    router.refresh();
  }

  const levels: Array<{ key: ScopeKey; label: string; options: typeof opts.sections; value: typeof sel.section; disabled: boolean }> = [
    { key: "section", label: "Section", options: opts.sections, value: sel.section, disabled: false },
    { key: "season", label: "Season", options: opts.seasons, value: sel.season, disabled: !scope.section },
    { key: "league", label: "League", options: opts.leagues, value: sel.league, disabled: !scope.season },
    { key: "flight", label: "Flight", options: opts.flights, value: sel.flight, disabled: !scope.league },
    { key: "subflight", label: "Subflight", options: opts.subflights, value: sel.subflight, disabled: !scope.flight },
  ];

  return (
    <Sheet
      title="Scope"
      onClose={onClose}
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            <span className="mm-mono" style={{ fontWeight: 700, color: "var(--ink)" }}>{scopeCount(tree, scope).toLocaleString("en-US")}</span> players in scope
          </span>
          {scopeDepth(scope) > 0 && (
            <button
              onClick={() => { writeCookie({ ...EMPTY_SCOPE }); router.refresh(); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--hair)", background: "var(--card)", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}
            >
              Clear all
            </button>
          )}
        </div>
      }
    >
      {levels.map((lv) => {
        const off = lv.disabled || lv.options.length === 0;
        return (
          <div key={lv.key} style={{ opacity: off ? 0.45 : 1 }}>
            <div className="mm-kicker" style={{ marginBottom: 8 }}>{lv.label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              <Chip active={!lv.value} disabled={off} onClick={() => pick(lv.key, null)}>{`All ${lv.label.toLowerCase()}s`}</Chip>
              {lv.options.map((o) => (
                <Chip key={o.id} active={!!lv.value && lv.value.id === o.id} disabled={off} onClick={() => pick(lv.key, o.id)}>
                  {o.name}
                  <span className="mm-mono" style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.7, marginLeft: 6 }}>{o.n.toLocaleString("en-US")}</span>
                </Chip>
              ))}
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}

function Chip({ active, disabled, onClick, children }: { active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => !disabled && onClick()}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", padding: "8px 13px", borderRadius: 100,
        border: active ? "none" : "1px solid var(--hair)", background: active ? "var(--court)" : "var(--card)",
        color: active ? "#fff" : "var(--ink-2)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-body)",
        cursor: disabled ? "default" : "pointer", maxWidth: "100%",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </button>
  );
}

const TABS: Array<{ id: string; icon: string; href: string; match: (p: string) => boolean }> = [
  { id: "Home", icon: "home", href: "/", match: (p) => p === "/" },
  { id: "Players", icon: "players", href: "/players", match: (p) => p.startsWith("/players") || p.startsWith("/search") || p.startsWith("/h2h") },
  { id: "Ratings", icon: "ratings", href: "/ratings", match: (p) => p.startsWith("/ratings") },
  { id: "Captain", icon: "captain", href: "/captain", match: (p) => p.startsWith("/captain") },
  { id: "More", icon: "more", href: "#more", match: (p) => p.startsWith("/teams") || p.startsWith("/matches") },
];

function TabBar({ pathname, onMore }: { pathname: string; onMore: () => void }) {
  return (
    <div
      className="mm-mobile-only mm-tabbar"
      style={{
        flexShrink: 0,
        background: "var(--card)", borderTop: "1px solid var(--hair)",
      }}
    >
      <div className="mm-tabrow" style={{ display: "flex", justifyContent: "space-around", alignItems: "center", paddingLeft: "max(6px, env(safe-area-inset-left))", paddingRight: "max(6px, env(safe-area-inset-right))" }}>
        {TABS.map((t) => {
          const on = t.match(pathname);
          const inner = (
            <>
              <Icon name={t.icon} size={23} stroke={on ? 2 : 1.7} />
              <span style={{ fontSize: 10, fontWeight: on ? 700 : 600 }}>{t.id}</span>
            </>
          );
          const style = { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3, color: on ? "var(--court)" : "var(--muted)", flex: 1, textDecoration: "none" };
          return t.id === "More" ? (
            <button key={t.id} onClick={onMore} style={{ ...style, border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)" }}>{inner}</button>
          ) : (
            <Link key={t.id} href={t.href as never} style={style}>{inner}</Link>
          );
        })}
      </div>
    </div>
  );
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  const { dark, toggle } = useTheme();
  const links: Array<{ label: string; href: string; icon: string }> = [
    { label: "Standings", href: "/teams", icon: "standings" },
    { label: "Search players", href: "/search", icon: "search" },
    { label: "Head to head", href: "/h2h", icon: "swap" },
  ];
  return (
    <Sheet title="More" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href as never} onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 6px", textDecoration: "none", color: "var(--ink)", borderBottom: "1px solid var(--hair-2)" }}>
            <span style={{ color: "var(--court)", display: "flex" }}><Icon name={l.icon} size={20} /></span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{l.label}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: "var(--muted)", display: "flex" }}><Icon name="chevron" size={16} /></span>
          </Link>
        ))}
        <button
          onClick={toggle}
          style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 6px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)", color: "var(--ink)", textAlign: "left" }}
        >
          <span style={{ color: "var(--court)", display: "flex" }}><Icon name="check" size={20} /></span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{dark ? "Switch to light" : "Switch to dark"}</span>
        </button>
      </div>
    </Sheet>
  );
}

// In the mobile app-shell the document doesn't scroll — <main> does — so route
// changes don't reset scroll the way window-scroll does. Nudge it back to top.
function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    document.querySelector("main")?.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Top region of the mobile app-shell (a flex child, not fixed/sticky): the top
// bar + optional scope chip, and the scope bottom-sheet it opens.
export function MobileTopBar({ tree, scope }: { tree: ScopeTree; scope: Scope }) {
  const pathname = usePathname() ?? "/";
  const chrome = routeChrome(pathname);
  const [scopeOpen, setScopeOpen] = useState(false);
  return (
    <div className="mm-mobile-only" style={{ flexShrink: 0 }}>
      <TopBar chrome={chrome} />
      {chrome.scope && <ScopeChip tree={tree} scope={scope} onOpen={() => setScopeOpen(true)} />}
      {scopeOpen && <ScopeSheet tree={tree} scope={scope} onClose={() => setScopeOpen(false)} />}
    </div>
  );
}

// Bottom region: the tab bar (a flex child) + the "More" bottom-sheet.
export function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <>
      <ScrollReset />
      <TabBar pathname={pathname} onMore={() => setMoreOpen(true)} />
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </>
  );
}
