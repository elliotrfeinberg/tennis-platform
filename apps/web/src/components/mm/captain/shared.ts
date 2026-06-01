"use client";
// Shared client helpers for the Captain screens (desktop + mobile).
//
// Availability is held ONLY in localStorage and passed transiently to the
// server optimizer via the recomputeLineups action — it is never persisted to
// the database (who's available is competitive intel).

import { useCallback, useEffect, useState } from "react";
import {
  courtConfidence,
  doublesWinProb,
  shrinkToFair,
  singlesWinProb,
  type MatchFormat,
} from "@tennis/optimizer";
import { recomputeLineups } from "@/app/captain/actions";
import type { CaptainPlayer, CaptainView, FormatView, LineupView } from "@/lib/captain";

export function useAvailability(view: CaptainView) {
  const key = `mm-avail:${view.myTeamId}:${view.oppTeamId}`;
  const [out, setOut] = useState<Set<string>>(new Set());
  const [lineups, setLineups] = useState<LineupView[]>(view.lineups);
  const [evaluated, setEvaluated] = useState(view.evaluated);
  const [error, setError] = useState(view.error);
  const [loading, setLoading] = useState(false);

  const recompute = useCallback(
    async (s: Set<string>) => {
      setLoading(true);
      try {
        const res = await recomputeLineups({
          flightId: view.flightId,
          myTeamId: view.myTeamId,
          oppTeamId: view.oppTeamId,
          unavailable: [...s],
        });
        if (res) {
          setLineups(res.lineups);
          setEvaluated(res.evaluated);
          setError(res.error);
        }
      } finally {
        setLoading(false);
      }
    },
    [view.flightId, view.myTeamId, view.oppTeamId]
  );

  // Hydrate availability from localStorage on mount; re-optimize if anyone is
  // marked out.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        const s = new Set(ids.filter((id) => view.myRoster.some((p) => p.id === id)));
        setOut(s);
        if (s.size > 0) void recompute(s);
      }
    } catch {
      /* ignore malformed storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggle = useCallback(
    (id: string) => {
      setOut((prev) => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id);
        else s.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...s]));
        } catch {
          /* ignore */
        }
        void recompute(s);
        return s;
      });
    },
    [key, recompute]
  );

  return { out, toggle, lineups, evaluated, error, loading };
}

// Reconstruct a MatchFormat (needed by the optimizer's pure fns) from the
// serialized FormatView the server sent.
export function matchFormatFromView(fv: FormatView): MatchFormat {
  return {
    name: fv.name,
    courts: fv.courts.map((c) => ({
      kind: c.kind,
      index: Number(c.c.slice(1)),
      points: c.points,
    })),
  };
}

const kindRating = (p: CaptainPlayer, kind: "S" | "D"): number | null =>
  kind === "S" ? p.singles ?? p.perf : p.doubles ?? p.perf;

// Sandbox per-court win probability, mirroring the optimizer's courtWinProb:
// kind-specific ratings, calibrated per-kind scale, and the low-confidence
// shrink. Returns null until the court is fully filled with rated players.
export function sandboxCourtProb(
  kind: "S" | "D",
  ours: (CaptainPlayer | undefined)[],
  theirs: (CaptainPlayer | undefined)[]
): number | null {
  if (kind === "S") {
    const a = ours[0];
    const b = theirs[0];
    if (!a || !b) return null;
    const ra = kindRating(a, "S");
    const rb = kindRating(b, "S");
    if (ra == null || rb == null) return null;
    return shrinkToFair(
      singlesWinProb(ra, rb),
      courtConfidence([a.singlesMatches, b.singlesMatches])
    );
  }
  const [a1, a2] = ours;
  const [b1, b2] = theirs;
  if (!a1 || !a2 || !b1 || !b2) return null;
  const r = (p: CaptainPlayer) => kindRating(p, "D");
  const rs = [r(a1), r(a2), r(b1), r(b2)];
  if (rs.some((x) => x == null)) return null;
  return shrinkToFair(
    doublesWinProb({ a: rs[0]!, b: rs[1]! }, { a: rs[2]!, b: rs[3]! }),
    courtConfidence([a1.doublesMatches, a2.doublesMatches, b1.doublesMatches, b2.doublesMatches])
  );
}
