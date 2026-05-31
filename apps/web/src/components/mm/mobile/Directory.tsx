"use client";
// Mobile Players directory — search entry, band filter chips, stacked player
// cards. Same DirView the desktop table consumes; band chips drive ?band=.
import Link from "next/link";
import type { DirView, DirViewRow } from "@/components/mm/screens/Directory";
import { Avatar, Chip } from "@/components/mm/ui";
import { Icon } from "./shell";

function chipHref(v: DirView, value: string) {
  const qp = new URLSearchParams();
  if (v.q) qp.set("q", v.q);
  if (v.sort) qp.set("sort", v.sort);
  if (value) qp.set("band", value);
  const s = qp.toString();
  return ("/players" + (s ? "?" + s : "")) as never;
}

function latestBand(p: DirViewRow): number | null {
  const years = Object.keys(p.bandsByYear).map(Number).sort((a, b) => b - a);
  for (const y of years) if (p.bandsByYear[y] != null) return p.bandsByYear[y]!;
  return null;
}

export function MobileDirectory({ view }: { view: DirView }) {
  const v = view;
  const chips: Array<{ label: string; value: string; count?: number }> = [
    { label: "All", value: "", count: v.total },
    ...v.bandCounts.map((b) => ({ label: b.band.toFixed(1), value: String(b.band), count: b.count })),
  ];
  return (
    <div className="mm-mscreen">
      <Link href="/search" style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderRadius: 11, background: "var(--card)", border: "1px solid var(--hair)", color: "var(--muted)", textDecoration: "none" }}>
        <Icon name="search" size={17} /><span style={{ fontSize: 14 }}>Search players…</span>
      </Link>

      <div className="mm-hscroll">
        {chips.map((c) => {
          const active = v.band === c.value;
          return (
            <Link key={c.label} href={chipHref(v, c.value)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 100, textDecoration: "none", fontSize: 13, fontWeight: 700, background: active ? "var(--court)" : "var(--card)", color: active ? "#fff" : "var(--ink-2)", border: active ? "none" : "1px solid var(--hair)", whiteSpace: "nowrap" }}>
              {c.label}{c.count != null && <span className="mm-mono" style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.7 }}>{c.count.toLocaleString("en-US")}</span>}
            </Link>
          );
        })}
      </div>

      <div className="mm-card" style={{ overflow: "hidden" }}>
        {v.rows.length === 0 ? (
          <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>No players match the filters.</div>
        ) : v.rows.map((p, i) => {
          const band = latestBand(p);
          const confTone = p.conf === "High" ? "court" : p.conf === "Low" ? "ball" : "mute";
          return (
            <Link key={p.id} href={`/players/${p.id}` as never} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i ? "1px solid var(--hair-2)" : "none", textDecoration: "none" }}>
              <Avatar name={p.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{p.gender === "M" ? "Men" : p.gender === "F" ? "Women" : "—"}{band != null ? ` · ${band.toFixed(1)} band` : ""}</div>
              </div>
              {p.conf && <Chip tone={confTone}>{p.conf}</Chip>}
              <span className="mm-num" style={{ fontSize: 21, color: "var(--court)", width: 52, textAlign: "right" }}>{p.perf != null ? p.perf.toFixed(2) : "—"}</span>
            </Link>
          );
        })}
      </div>

      <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--muted)" }}>
        Showing {v.shown.toLocaleString("en-US")} of {v.total.toLocaleString("en-US")}{v.total > v.shown ? " — refine with search" : ""}
      </div>
    </div>
  );
}
