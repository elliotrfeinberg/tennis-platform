export {
  FORMAT_ADULT_18,
  FORMAT_MIXED_5D,
  type CourtKind,
  type CourtSlot,
  type MatchFormat,
} from "./format.js";

export {
  resolveFormat,
  formatPoints,
  type CourtRef,
} from "./leagueFormats.js";

export {
  DEFAULT_NTRP_SCALE,
  SINGLES_SCALE,
  DOUBLES_SCALE,
  CONFIDENCE_RAMP,
  PARTNER_CHEMISTRY_BONUS,
  DISCIPLINE_AFFINITY_BONUS,
  ntrpWinProb,
  teamNtrp,
  doublesWinProb,
  singlesWinProb,
  shrinkToFair,
  courtConfidence,
  type Doubles,
} from "./winprob.js";

export {
  optimizeLineup,
  evaluateLineup,
  teamWinProbability,
  singlesProbExplain,
  pairKey,
  type RosterPlayer,
  type OpponentLineup,
  type OpponentCourt,
  type CourtAssignment,
  type Lineup,
  type OptimizeOptions,
  type OptimizeResult,
} from "./lineup.js";
