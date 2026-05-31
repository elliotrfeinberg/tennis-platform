"use client";

// Mobile design system — shared atoms for the phone layout. Ported from the
// design bundle's mobile-shell.jsx. The chrome (top bar / tab bar / scope
// sheet) lives in MobileChrome.tsx; these are the per-screen building blocks.

import type { ReactNode } from "react";
import { CourtLines } from "@/components/mm/ui";

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5" />,
  players: (
    <path d="M7 9a3 3 0 100-6 3 3 0 000 6zm10 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-2.8 2.2-5 5-5s5 2.2 5 5m1-5c2.8 0 5 2.2 5 5" />
  ),
  ratings: <path d="M4 19V5m0 14h16M8 16l3-4 3 2 4-6" />,
  captain: <path d="M9 4h6v3H9zM7 5H5v15h14V5h-2M9 12l2 2 4-4" />,
  more: <path d="M5 7h14M5 12h14M5 17h14" />,
  search: (
    <g>
      <circle cx={10.5} cy={10.5} r={6.5} />
      <path d="M16 16l4 4" />
    </g>
  ),
  bell: <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM9.5 20a2.5 2.5 0 005 0" />,
  back: <path d="M14 5l-7 7 7 7" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  funnel: <path d="M2.5 4h19l-7.5 9v6l-4 2v-8z" />,
  swap: <path d="M7 4L3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8" />,
  check: <path d="M5 12l5 5 9-10" />,
  standings: <path d="M4 20V10m6 10V4m6 16v-7" />,
  close: <path d="M5 5l14 14M19 5L5 19" />,
};

export function Icon({ name, size = 22, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

// Compact green hero card — the Center Court identity element, mobile size.
export function MHero({
  kicker,
  children,
  pad = "20px 20px",
}: {
  kicker?: ReactNode;
  children: ReactNode;
  pad?: string;
}) {
  return (
    <div className="mm-mhero" style={{ padding: pad }}>
      <div className="mm-net" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />
      <CourtLines opacity={0.16} />
      <div style={{ position: "relative" }}>
        {kicker && (
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.72)" }}>
            {kicker}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// A section heading row inside a mobile screen (title + optional caption/right).
export function MSectionTitle({ children, caption, right }: { children: ReactNode; caption?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "2px 4px" }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{children}</div>
        {caption && <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--muted)", marginTop: 1 }}>{caption}</div>}
      </div>
      {right && <span className="mm-mono" style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap" }}>{right}</span>}
    </div>
  );
}
