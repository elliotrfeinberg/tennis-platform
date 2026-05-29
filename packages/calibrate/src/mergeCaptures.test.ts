import { describe, expect, it } from "vitest";
import { mergeCaptures } from "./loadCaptures.js";
import type { CapturesData, CourtMatch, PlayerLabel } from "./loadCaptures.js";

type PlayerSpec = Omit<PlayerLabel, "ntrpByYear" | "ratingType"> & {
  ntrpByYear?: Map<number, number>;
  ratingType?: string;
};

function mk(
  players: PlayerSpec[],
  matches: CourtMatch[],
  overrides: Partial<CapturesData> = {}
): CapturesData {
  const pmap = new Map<string, PlayerLabel>();
  for (const p of players) {
    const ntrpByYear =
      p.ntrpByYear ??
      (p.ntrp !== undefined
        ? new Map<number, number>([[2026, p.ntrp]])
        : new Map<number, number>());
    pmap.set(p.key, { ...p, ntrpByYear, ratingType: p.ratingType });
  }
  return {
    year: 2026,
    ownTeamName: "Primary",
    ownTeamId: "1",
    players: pmap,
    matches,
    unresolvedNames: [],
    yearEndLabelMatches: 0,
    yearEndLabelOverrides: 0,
    yearEndUnmatched: 0,
    ...overrides,
  };
}

function mkCourt(
  matchId: string,
  line: number,
  kind: "S" | "D",
  homeKeys: string[],
  visitorKeys: string[],
  date: Date
): CourtMatch {
  return {
    matchId,
    date,
    homeTeamName: "H",
    visitorTeamName: "V",
    line,
    kind,
    homePlayerKeys: homeKeys,
    visitorPlayerKeys: visitorKeys,
    homeWon: true,
    retired: undefined,
    defaulted: undefined,
    gamesHome: undefined,
    gamesVisitor: undefined,
    sets: [],
    league: undefined,
    seasonYear: date.getFullYear(),
  };
}

describe("mergeCaptures", () => {
  it("returns the single input verbatim when length===1", () => {
    const cap = mk([], []);
    expect(mergeCaptures([cap])).toBe(cap);
  });

  it("unions distinct players across aggregates", () => {
    const a = mk(
      [{ key: "1001", name: "Alice", memberId: "1001", ntrp: 3, teams: ["A"] }],
      []
    );
    const b = mk(
      [{ key: "1002", name: "Bob", memberId: "1002", ntrp: 4, teams: ["B"] }],
      []
    );
    const merged = mergeCaptures([a, b]);
    expect(merged.players.size).toBe(2);
    expect(merged.players.get("1001")!.ntrp).toBe(3);
    expect(merged.players.get("1002")!.ntrp).toBe(4);
  });

  it("dedups a player on the same memberId, extending teams[]", () => {
    const a = mk(
      [{ key: "1001", name: "Alice", memberId: "1001", ntrp: 3, teams: ["3.0-team"] }],
      []
    );
    const b = mk(
      [{ key: "1001", name: "Alice", memberId: "1001", ntrp: 3.5, teams: ["3.5-team"] }],
      []
    );
    const merged = mergeCaptures([a, b]);
    expect(merged.players.size).toBe(1);
    const alice = merged.players.get("1001")!;
    expect(alice.teams.sort()).toEqual(["3.0-team", "3.5-team"]);
    // First-seen ntrp wins (Alice was labeled 3.0 in the first aggregate).
    expect(alice.ntrp).toBe(3);
  });

  it("adopts NTRP / memberId from a later aggregate when the first lacked them", () => {
    const a = mk(
      [{ key: "name:alice doe", name: "Alice Doe", memberId: undefined, ntrp: undefined, teams: ["A"] }],
      []
    );
    // Different key (memberId-keyed) — the merge currently can't reconcile
    // a name-keyed and a memberId-keyed entry for the same human. This
    // test is a guardrail for that limitation: both entries survive.
    const b = mk(
      [{ key: "9999", name: "Alice Doe", memberId: "9999", ntrp: 3.5, teams: ["B"] }],
      []
    );
    const merged = mergeCaptures([a, b]);
    expect(merged.players.size).toBe(2);

    // Now verify the *intended* behavior on a same-key collision: the
    // first entry gets the later entry's metadata when its own was empty.
    const c = mk(
      [{ key: "5555", name: "Bob", memberId: undefined, ntrp: undefined, teams: ["C"] }],
      []
    );
    const d = mk(
      [{ key: "5555", name: "Bob", memberId: "5555", ntrp: 4, teams: ["D"] }],
      []
    );
    const m2 = mergeCaptures([c, d]);
    const bob = m2.players.get("5555")!;
    expect(bob.memberId).toBe("5555");
    expect(bob.ntrp).toBe(4);
    expect(bob.teams.sort()).toEqual(["C", "D"]);
  });

  it("unions per-year band labels across aggregates for the same player", () => {
    const y2025 = mk(
      [
        {
          key: "1001",
          name: "Alice",
          memberId: "1001",
          ntrp: 3,
          ntrpByYear: new Map([[2025, 3]]),
          teams: ["2025-team"],
        },
      ],
      []
    );
    const y2026 = mk(
      [
        {
          key: "1001",
          name: "Alice",
          memberId: "1001",
          ntrp: 3.5,
          ntrpByYear: new Map([[2026, 3.5]]),
          teams: ["2026-team"],
        },
      ],
      []
    );
    const merged = mergeCaptures([y2025, y2026]);
    const alice = merged.players.get("1001")!;
    expect(alice.ntrpByYear.get(2025)).toBe(3);
    expect(alice.ntrpByYear.get(2026)).toBe(3.5);
  });

  it("dedups matches on matchId#line#kind", () => {
    const m1 = mkCourt("M1", 1, "S", ["A"], ["B"], new Date(2026, 0, 1));
    const m2 = mkCourt("M1", 1, "S", ["A"], ["B"], new Date(2026, 0, 1));
    const m3 = mkCourt("M1", 2, "D", ["A", "B"], ["C", "D"], new Date(2026, 0, 1));
    const merged = mergeCaptures([mk([], [m1]), mk([], [m2, m3])]);
    expect(merged.matches).toHaveLength(2);
    expect(merged.matches.map((m) => `${m.matchId}#${m.line}#${m.kind}`).sort())
      .toEqual(["M1#1#S", "M1#2#D"]);
  });

  it("sorts merged matches chronologically", () => {
    const m1 = mkCourt("M1", 1, "S", ["A"], ["B"], new Date(2026, 3, 1)); // April
    const m2 = mkCourt("M2", 1, "S", ["A"], ["B"], new Date(2026, 0, 1)); // January
    const merged = mergeCaptures([mk([], [m1]), mk([], [m2])]);
    expect(merged.matches[0]!.matchId).toBe("M2");
    expect(merged.matches[1]!.matchId).toBe("M1");
  });

  it("sums year-end label match/override counts; takes min of unmatched", () => {
    const a = mk([], [], {
      yearEndLabelMatches: 50,
      yearEndLabelOverrides: 2,
      yearEndUnmatched: 1000,
    });
    const b = mk([], [], {
      yearEndLabelMatches: 60,
      yearEndLabelOverrides: 3,
      yearEndUnmatched: 990,
    });
    const merged = mergeCaptures([a, b]);
    expect(merged.yearEndLabelMatches).toBe(110);
    expect(merged.yearEndLabelOverrides).toBe(5);
    // min(1000, 990) — same dump produced both, so the *real* unmatched
    // count is the lower (some players matched in only one aggregate).
    expect(merged.yearEndUnmatched).toBe(990);
  });

  it("does not mutate input aggregates (defensive teams[] copy)", () => {
    const aliceA = { key: "X", name: "Alice", memberId: "X", ntrp: 3, teams: ["A"] };
    const aliceB = { key: "X", name: "Alice", memberId: "X", ntrp: 3, teams: ["B"] };
    const a = mk([aliceA], []);
    const b = mk([aliceB], []);
    mergeCaptures([a, b]);
    // The input aggregates should still have their original single-team
    // arrays — only the merge result is the unioned one.
    expect(aliceA.teams).toEqual(["A"]);
    expect(aliceB.teams).toEqual(["B"]);
  });
});
