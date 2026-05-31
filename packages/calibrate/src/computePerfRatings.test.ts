import { describe, expect, it } from "vitest";
import { computePerfRatings, type PerfMatchEntry } from "./computePerfRatings.js";
import type { CapturesData, CourtMatch, PlayerLabel } from "./loadCaptures.js";

function mkCaptures(
  players: Array<
    Omit<PlayerLabel, "key" | "ntrpByYear" | "ratingType"> & {
      key: string;
      ntrpByYear?: Map<number, number>;
      ratingType?: string;
    }
  >,
  matches: CourtMatch[],
  year = 2026
): CapturesData {
  const pmap = new Map<string, PlayerLabel>();
  for (const p of players) {
    const ntrpByYear =
      p.ntrpByYear ??
      (p.ntrp !== undefined
        ? new Map<number, number>([[year, p.ntrp]])
        : new Map<number, number>());
    pmap.set(p.key, { ...p, ntrpByYear, ratingType: p.ratingType });
  }
  return {
    year,
    ownTeamName: "Test",
    ownTeamId: "0",
    players: pmap,
    matches,
    unresolvedNames: [],
    yearEndLabelMatches: 0,
    yearEndLabelOverrides: 0,
    yearEndUnmatched: 0,
  };
}

// Build a match with 2 sets from the home side's perspective.
function mkMatch(
  date: Date,
  home: string[],
  visitor: string[],
  set1: [number, number],
  set2: [number, number],
  set3?: [number, number],
  league?: string
): CourtMatch {
  const sets = set3 !== undefined ? [set1, set2, set3] : [set1, set2];
  let gh = 0;
  let gv = 0;
  let setsWonByHome = 0;
  for (const [h, v] of sets) {
    gh += h;
    gv += v;
    if (h > v) setsWonByHome += 1;
  }
  return {
    matchId: `m-${date.getTime()}-${home.join("+")}-${visitor.join("+")}`,
    date,
    homeTeamName: "H",
    visitorTeamName: "V",
    line: 1,
    kind: home.length > 1 ? "D" : "S",
    homePlayerKeys: home,
    visitorPlayerKeys: visitor,
    homeWon: setsWonByHome >= 2,
    retired: undefined,
    defaulted: undefined,
    gamesHome: gh,
    gamesVisitor: gv,
    sets: sets.map(([h, v]) => ({ home: h, visitor: v })),
    league: league ?? "ADULT 18&Over",
    seasonYear: date.getFullYear(),
  };
}

const p = (
  key: string,
  ntrp: number
): {
  key: string;
  name: string;
  memberId: undefined;
  ntrp: number;
  teams: PlayerLabel["teams"];
  ntrpByYear?: Map<number, number>;
  ratingType?: string;
} => ({
  key,
  name: key,
  memberId: undefined,
  ntrp,
  teams: [] as PlayerLabel["teams"],
});

// Three rating-producing wins (6-2,6-2) for `key` vs three DISTINCT unrated
// fillers at `band`, so `key` ends established with a known rolling rating.
// Each match is all-unrated → key anchors on the filler's band midpoint
// (band − 0.25), so each perf = (band − 0.25) + 0.29 and the rolling == that.
function rateUpMatches(key: string, band: number, tag: string): {
  players: ReturnType<typeof p>[];
  matches: CourtMatch[];
} {
  const players: ReturnType<typeof p>[] = [];
  const matches: CourtMatch[] = [];
  for (let i = 0; i < 3; i++) {
    const f = `${tag}f${i}`;
    players.push(p(f, band));
    matches.push(mkMatch(new Date(2026, 0, 1 + i), [key], [f], [6, 2], [6, 2]));
  }
  return { players, matches };
}

describe("computePerfRatings — opponent-anchored, unrated cold start", () => {
  it("a single match leaves both players UNRATED (no published rating)", () => {
    const captures = mkCaptures(
      [p("A", 3.0), p("B", 3.0)],
      [mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 0], [6, 0])]
    );
    const r = computePerfRatings(captures);
    // Neither is rated yet (< 3 rating matches) → no published rating.
    expect(r.playerRatings.get("A")!.display).toBeUndefined();
    expect(r.playerRatings.get("B")!.display).toBeUndefined();
    expect(r.ratings.get("A")).toBeUndefined();
    // But a per-match calibration perf WAS computed, anchored on the
    // opponent's band midpoint (all-unrated bootstrap): 2.75 ± 0.48.
    expect(r.history.get("A")![0]!.perf).toBeCloseTo(2.75 + 0.48, 6); // 3.23
    expect(r.history.get("B")![0]!.perf).toBeCloseTo(2.75 - 0.48, 6); // 2.27
    // Opponent was unrated → shown as a dash (null), but it still counts for
    // calibration (affectsRating true).
    expect(r.history.get("A")![0]!.opponentRating).toBeNull();
    expect(r.history.get("A")![0]!.affectsRating).toBe(true);
    // Running rating is exposed in the player's OWN history even while unrated.
    expect(r.history.get("A")![0]!.playerPostRating).toBeCloseTo(3.23, 6);
  });

  it("all-unrated bootstrap anchors on the opponent's band midpoint", () => {
    // 3.5 vs 3.5, 7-6 7-6 → δ 0.05 → winner 3.30, loser 3.20.
    const captures = mkCaptures(
      [p("A", 3.5), p("B", 3.5)],
      [mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [7, 6], [7, 6])]
    );
    const r = computePerfRatings(captures);
    expect(r.history.get("A")![0]!.perf).toBeCloseTo(3.25 + 0.05, 6);
    expect(r.history.get("B")![0]!.perf).toBeCloseTo(3.25 - 0.05, 6);
  });

  it("becomes rated after 3 matches; rating = mean of the match perfs", () => {
    // A beats B 6-2,6-2 three times. Both stay unrated (<3) through all three,
    // so each is anchored on the other's 3.5 band midpoint (3.25). A's three
    // perfs are each 3.25 + 0.29 = 3.54 → rolling 3.54; B's are 2.96.
    const captures = mkCaptures(
      [p("A", 3.5), p("B", 3.5)],
      [
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 2], [6, 2]),
        mkMatch(new Date(2026, 0, 5), ["A"], ["B"], [6, 2], [6, 2]),
        mkMatch(new Date(2026, 0, 9), ["A"], ["B"], [6, 2], [6, 2]),
      ]
    );
    const r = computePerfRatings(captures);
    expect(r.playerRatings.get("A")!.display).toBeCloseTo(3.54, 6);
    expect(r.playerRatings.get("A")!.adultMatches).toBe(3);
    expect(r.playerRatings.get("B")!.display).toBeCloseTo(2.96, 6);
    expect(r.playerRatings.get("A")!.display!).toBeGreaterThan(
      r.playerRatings.get("B")!.display!
    );
  });

  it("a rated player is UNAFFECTED by a fully-unrated opponent", () => {
    // A becomes rated (3 wins vs B), then plays a brand-new unrated X.
    const captures = mkCaptures(
      [p("A", 3.5), p("B", 3.5), p("X", 3.5)],
      [
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 2], [6, 2]),
        mkMatch(new Date(2026, 0, 5), ["A"], ["B"], [6, 2], [6, 2]),
        mkMatch(new Date(2026, 0, 9), ["A"], ["B"], [6, 2], [6, 2]),
        // A (rated 3.54) vs X (unrated). A wins 6-1, 6-1.
        mkMatch(new Date(2026, 0, 13), ["A"], ["X"], [6, 1], [6, 1]),
      ]
    );
    const r = computePerfRatings(captures);
    const aLast = r.history.get("A")!.at(-1)!;
    // No valid anchor (X unrated) → no rating impact for A.
    expect(aLast.perf).toBeNull();
    expect(aLast.affectsRating).toBe(false);
    expect(aLast.opponentRating).toBeNull();
    // A's rating is unchanged by the match.
    expect(aLast.playerPostRating).toBeCloseTo(3.54, 6);
    expect(r.playerRatings.get("A")!.display).toBeCloseTo(3.54, 6);
    // X DID get a calibration perf, anchored on A's rolling rating (3.54),
    // having lost 6-1,6-1 (δ 0.40) → 3.54 − 0.40 = 3.14.
    const xEntry = r.history.get("X")![0]!;
    expect(xEntry.affectsRating).toBe(true);
    expect(xEntry.opponentRating).toBeCloseTo(3.54, 6);
    expect(xEntry.perf).toBeCloseTo(3.54 - 0.4, 6);
  });

  it("doubles preserves the partner spread when both partners are rated", () => {
    // Rate A (3.5 → 3.54), B (4.0 → 4.04), and C (3.5 → 3.54). Then a doubles
    // match A/B vs C/D (D brand-new unrated). The opponent anchor is C (3.54);
    // A and B keep their pre-match spread (4.04 − 3.54 = 0.50) exactly.
    const A = rateUpMatches("A", 3.5, "a");
    const B = rateUpMatches("B", 4.0, "b");
    const C = rateUpMatches("C", 3.5, "c");
    const captures = mkCaptures(
      [p("A", 3.5), p("B", 4.0), p("C", 3.5), p("D", 3.5), ...A.players, ...B.players, ...C.players],
      [
        ...A.matches,
        ...B.matches,
        ...C.matches,
        mkMatch(new Date(2026, 1, 1), ["A", "B"], ["C", "D"], [6, 2], [6, 2]),
      ]
    );
    const r = computePerfRatings(captures);
    const aDoubles = r.history.get("A")!.at(-1)!;
    const bDoubles = r.history.get("B")!.at(-1)!;
    expect(aDoubles.perf).not.toBeNull();
    expect(bDoubles.perf).not.toBeNull();
    // Spread between partners preserved (= rollingB − rollingA = 4.04 − 3.54).
    expect(bDoubles.perf! - aDoubles.perf!).toBeCloseTo(0.5, 6);
    // The team was anchored on the rated opponent C (3.54), not on D.
    expect(aDoubles.opponentRating).toBeCloseTo(3.54, 6);
  });

  it("doubles: an unrated partner absorbs the residual; the rated partner is held at rating", () => {
    // Rate Nancy and both opponents to 3.54 (band 3.5). Then [Nancy, Tim] vs
    // [O1, O2], won 6-2,6-2 (δ 0.29). Opp anchor 3.54 → team_perf 3.83.
    // Nancy is held at her 3.54; Tim (unrated) absorbs the rest:
    //   Tim = 2·3.83 − 3.54 = 4.12.
    const N = rateUpMatches("Nancy", 3.5, "n");
    const O1 = rateUpMatches("O1", 3.5, "o1");
    const O2 = rateUpMatches("O2", 3.5, "o2");
    const captures = mkCaptures(
      [p("Nancy", 3.5), p("Tim", 3.5), p("O1", 3.5), p("O2", 3.5),
        ...N.players, ...O1.players, ...O2.players],
      [...N.matches, ...O1.matches, ...O2.matches,
        mkMatch(new Date(2026, 1, 1), ["Nancy", "Tim"], ["O1", "O2"], [6, 2], [6, 2])]
    );
    const r = computePerfRatings(captures);
    const tim = r.history.get("Tim")![0]!;
    const nancyLast = r.history.get("Nancy")!.at(-1)!;
    expect(tim.teamPerf).toBeCloseTo(3.83, 6);
    expect(nancyLast.perf).toBeCloseTo(3.54, 6); // rated partner held at rating
    expect(tim.perf).toBeCloseTo(2 * 3.83 - 3.54, 6); // 4.12 — carried the team
    expect(tim.affectsRating).toBe(true);
  });

  it("history entries appear in chronological order with diagnostics", () => {
    const captures = mkCaptures(
      [p("A", 3.5), p("B", 3.5)],
      [
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 0], [6, 0]),
        mkMatch(new Date(2026, 0, 5), ["A"], ["B"], [0, 6], [0, 6]),
        mkMatch(new Date(2026, 0, 10), ["A"], ["B"], [6, 3], [6, 3]),
      ]
    );
    const r = computePerfRatings(captures);
    const h = r.history.get("A")!;
    expect(h).toHaveLength(3);
    expect(h[0]!.date.getTime()).toBeLessThan(h[1]!.date.getTime());
    expect(h[1]!.date.getTime()).toBeLessThan(h[2]!.date.getTime());
    expect(h[0]!.gamesDiff).toBe(12); // 12-0 across 6-0, 6-0
  });

  it("equal-rating doubles partners get the same per-match perf", () => {
    // Rate all four to ~3.54 (band 3.5), then a doubles match — partners with
    // equal rolling ratings share the team perf exactly.
    const A = rateUpMatches("A", 3.5, "a");
    const B = rateUpMatches("B", 3.5, "b");
    const C = rateUpMatches("C", 3.5, "c");
    const D = rateUpMatches("D", 3.5, "d");
    const captures = mkCaptures(
      [p("A", 3.5), p("B", 3.5), p("C", 3.5), p("D", 3.5),
        ...A.players, ...B.players, ...C.players, ...D.players],
      [...A.matches, ...B.matches, ...C.matches, ...D.matches,
        mkMatch(new Date(2026, 1, 1), ["A", "B"], ["C", "D"], [6, 2], [6, 2])]
    );
    const r = computePerfRatings(captures);
    expect(r.history.get("A")!.at(-1)!.perf).toBeCloseTo(
      r.history.get("B")!.at(-1)!.perf!,
      6
    );
  });

  it("mixed matches update only the mixed stream", () => {
    const captures = mkCaptures(
      [p("A", 3.5), p("B", 3.5)],
      [
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 3], [6, 3], undefined, "Mixed 18&Over"),
      ]
    );
    const r = computePerfRatings(captures);
    const pr = r.playerRatings.get("A")!;
    expect(pr.mixedMatches).toBe(1);
    expect(pr.adultMatches).toBe(0);
    // 1 match → still unrated in either stream.
    expect(pr.mixed).toBeUndefined();
    expect(pr.adult).toBeUndefined();
  });

  it("combo matches produce no rating (perf null) but appear in history", () => {
    const captures = mkCaptures(
      [p("A", 3.5), p("B", 3.5)],
      [
        mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 3], [6, 3]),
        mkMatch(new Date(2026, 0, 10), ["A"], ["B"], [6, 2], [6, 2], undefined, "Combo 7.5"),
      ]
    );
    const r = computePerfRatings(captures);
    const hist = r.history.get("A")!;
    expect(hist).toHaveLength(2);
    const combo = hist[1]!;
    expect(combo.category).toBe("combo");
    expect(combo.affectsRating).toBe(false);
    expect(combo.perf).toBeNull();
    expect(r.playerRatings.get("A")!.otherMatches).toBe(1);
    expect(r.playerRatings.get("A")!.adultMatches).toBe(1);
  });

  describe("year-boundary carry-over", () => {
    const in2026 = (entries: PerfMatchEntry[]) =>
      entries.filter((e) => e.date.getFullYear() === 2026);

    it("carries a RATED player's rating into the next season, clamped to band", () => {
      // A wins 3× in 2025 (rated, rolling well above 3.5), registers 3.5 in
      // 2026 → carry-in clamps to the band ceiling (3.5).
      const A = p("A", 4.0);
      A.ntrpByYear = new Map([[2025, 4.0], [2026, 3.5]]);
      const captures = mkCaptures(
        [A, p("B", 4.0)],
        [
          mkMatch(new Date(2025, 0, 1), ["A"], ["B"], [6, 0], [6, 0]),
          mkMatch(new Date(2025, 0, 8), ["A"], ["B"], [6, 0], [6, 0]),
          mkMatch(new Date(2025, 0, 15), ["A"], ["B"], [6, 0], [6, 0]),
          mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 3], [6, 3]),
        ]
      );
      const r = computePerfRatings(captures);
      const hist = r.history.get("A")!;
      // 2025 rolling is 3.75 + 0.48 = 4.23 (above the 3.5 band ceiling).
      expect(hist[2]!.playerPostRating!).toBeGreaterThan(3.5);
      // First 2026 match's carry-in pre-rating is clamped to 3.5.
      expect(in2026(hist)[0]!.playerPreRating).toBeCloseTo(3.5, 6);
      // The synthetic carry seed is NOT counted as a played match.
      expect(r.playerRatings.get("A")!.adultMatches).toBe(4);
    });

    it("an UNRATED player carries nothing across a year boundary", () => {
      // A plays a single 2025 match (unrated), then a 2026 match. With no
      // established rating there's no carry seed: the 2026 match is just
      // another bootstrap calibration entry.
      const A = p("A", 3.5);
      A.ntrpByYear = new Map([[2025, 3.5], [2026, 3.5]]);
      const B = p("B", 3.5);
      B.ntrpByYear = new Map([[2025, 3.5], [2026, 3.5]]);
      const captures = mkCaptures(
        [A, B],
        [
          mkMatch(new Date(2025, 0, 1), ["A"], ["B"], [6, 2], [6, 2]),
          mkMatch(new Date(2026, 0, 1), ["A"], ["B"], [6, 2], [6, 2]),
        ]
      );
      const r = computePerfRatings(captures);
      const first2026 = in2026(r.history.get("A")!)[0]!;
      // No carry-in: pre-rating is null (still unrated going into 2026) and the
      // perf is the all-unrated bootstrap value (3.25 + 0.29).
      expect(first2026.playerPreRating).toBeNull();
      expect(first2026.perf).toBeCloseTo(3.25 + 0.29, 6);
    });
  });
});
