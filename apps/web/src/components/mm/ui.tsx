"use client";

// Shared Center Court UI atoms: ball mark, logo, nav (with dark toggle),
// trend arrow, chip, court-line motif, green page-hero band, avatar.
// Ported from the design bundle's ui.jsx; styles use the theme CSS vars.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTheme } from "./ThemeProvider";

export function BallMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: "block" }}>
      <circle cx={16} cy={16} r={15} style={{ fill: "var(--court)" }} />
      <path d="M5 6 C 13 12, 13 20, 5 26" fill="none" style={{ stroke: "var(--ball)" }} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M27 6 C 19 12, 19 20, 27 26" fill="none" style={{ stroke: "var(--ball)" }} strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
      <BallMark size={28} />
      <span className="mm-disp" style={{ fontSize: 26, letterSpacing: 0, color: "var(--ink)", textTransform: "uppercase" }}>
        Match<span style={{ color: "var(--court)" }}>Metric</span>
      </span>
    </Link>
  );
}

const NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: "Players", href: "/players" },
  { label: "Ratings", href: "/ratings" },
  { label: "Captain", href: "/captain" },
  { label: "Standings", href: "/teams" },
];

export function Nav() {
  const { dark, toggle } = useTheme();
  const pathname = usePathname() ?? "/";
  const activeHref =
    NAV_ITEMS.filter((i) => pathname.startsWith(i.href)).sort(
      (a, b) => b.href.length - a.href.length
    )[0]?.href ?? null;
  return (
    <header
      className="mm-nav"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 44px", height: 68, borderBottom: "1px solid var(--hair)",
        background: "var(--card)", position: "sticky", top: 0, zIndex: 30,
      }}
    >
      <Logo />
      <nav className="mm-nav-links" style={{ display: "flex", alignItems: "center", gap: 30 }}>
        {NAV_ITEMS.map((it) => {
          const active = it.href === activeHref;
          return (
            <Link
              key={it.label}
              href={it.href as never}
              style={{
                fontSize: 14, fontWeight: active ? 700 : 500, textDecoration: "none",
                color: active ? "var(--court)" : "var(--ink-2)", letterSpacing: ".01em",
                paddingBottom: 2,
                borderBottom: active ? "2px solid var(--court)" : "2px solid transparent",
              }}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Link
          href="/search"
          className="mm-nav-search"
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", width: 196,
            border: "1px solid var(--hair)", borderRadius: 9, color: "var(--muted)", fontSize: 13,
            background: "var(--paper)", textDecoration: "none",
          }}
        >
          <svg width={15} height={15} viewBox="0 0 16 16" fill="none">
            <circle cx={7} cy={7} r={5} stroke="currentColor" strokeWidth={1.6} />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
          <span className="mm-nav-search-label">Search players…</span>
        </Link>
        <button
          title={dark ? "Switch to light" : "Switch to dark"}
          onClick={toggle}
          style={{
            width: 34, height: 34, borderRadius: 9, border: "1px solid var(--hair)",
            background: "var(--paper)", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", color: "var(--ink-2)", padding: 0,
          }}
        >
          {dark ? (
            <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
              <path d="M13 9.5A5.5 5.5 0 016.5 3 5.5 5.5 0 1013 9.5z" />
            </svg>
          ) : (
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx={8} cy={8} r={3.2} />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => {
                const r1 = 5.4, r2 = 7, rad = (a * Math.PI) / 180;
                return (
                  <line
                    key={i}
                    x1={8 + r1 * Math.cos(rad)} y1={8 + r1 * Math.sin(rad)}
                    x2={8 + r2 * Math.cos(rad)} y2={8 + r2 * Math.sin(rad)}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

export function TrendArrow({ v, color }: { v: number; color?: string | null }) {
  const up = v >= 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: color || (up ? "var(--win)" : "var(--loss)"), fontWeight: 700, fontSize: 13, fontFamily: "var(--font-mono)" }}>
      <svg width={11} height={11} viewBox="0 0 12 12" style={{ transform: up ? "none" : "scaleY(-1)" }}>
        <path d="M6 1l5 7H1z" fill="currentColor" />
      </svg>
      {`${up ? "+" : ""}${v.toFixed(2)}`}
    </span>
  );
}

export function Chip({ children, tone = "court" }: { children: ReactNode; tone?: "court" | "ball" | "mute" }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    court: { bg: "var(--court-tint)", fg: "var(--court)" },
    ball: { bg: "color-mix(in oklab, var(--ball) 35%, var(--card))", fg: "var(--ball-ink)" },
    mute: { bg: "var(--hair-2)", fg: "var(--ink-2)" },
  };
  const t = tones[tone] ?? tones.court;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 100, background: t!.bg, color: t!.fg, fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

export function CourtLines({ opacity = 0.2 }: { opacity?: number }) {
  return (
    <svg viewBox="0 0 1200 300" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity, pointerEvents: "none" }}>
      <rect x={60} y={26} width={1080} height={248} fill="none" stroke="#fff" strokeWidth={2} />
      <line x1={600} y1={26} x2={600} y2={274} stroke="#fff" strokeWidth={2} />
      <line x1={60} y1={150} x2={1140} y2={150} stroke="#fff" strokeWidth={1.5} />
      <line x1={260} y1={90} x2={940} y2={90} stroke="#fff" strokeWidth={1.5} />
      <line x1={260} y1={210} x2={940} y2={210} stroke="#fff" strokeWidth={1.5} />
      <line x1={260} y1={90} x2={260} y2={210} stroke="#fff" strokeWidth={1.5} />
      <line x1={940} y1={90} x2={940} y2={210} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

export function PageHero({
  kicker, title, sub, right,
}: {
  kicker?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode;
}) {
  return (
    <div className="mm-hero" style={{ position: "relative", overflow: "hidden", borderRadius: 16, background: "var(--hero-bg)", color: "#fff", padding: "30px 36px", boxShadow: "var(--shadow)" }}>
      <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
      <CourtLines opacity={0.18} />
      <div className="mm-hero-row" style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 30 }}>
        <div>
          {kicker && (
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.72)" }}>{kicker}</div>
          )}
          <h1 className="mm-disp" style={{ fontSize: "clamp(32px, 6vw, 60px)", textTransform: "uppercase", margin: "8px 0 0", color: "#fff" }}>{title}</h1>
          {sub && <div style={{ fontSize: 14.5, color: "rgba(255,255,255,.85)", fontWeight: 500, marginTop: 10 }}>{sub}</div>}
        </div>
        {right && <div style={{ textAlign: "right", flexShrink: 0 }}>{right}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name, hi }: { name: string; hi?: boolean }) {
  return (
    <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, background: hi ? "var(--court)" : "var(--court-tint)", color: hi ? "#fff" : "var(--court)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-display)" }}>
      {name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
    </div>
  );
}

// Shared content-column wrapper: matches the design's padded, centered layout.
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mm-screen" style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 44px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      {children}
    </div>
  );
}
