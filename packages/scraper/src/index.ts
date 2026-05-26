export {
  PoliteFetcher,
  type PoliteFetchOptions,
  type CachedFetchResult,
  type ConditionalHeaders,
} from "./politeFetch";

export {
  ratingSearchUrl,
  ratingSearchUrlDesktop,
  playerHistoryUrl,
  teamUrl,
  teamTennisStatsUrl,
  standingsSearchUrl,
  type SearchCriteria,
} from "./tennislinkUrls";

export {
  parsePlayerSearch,
  parsePlayerHistory,
  type PlayerSearchResultRow,
  type ParsedMatch,
  type ParsedPlayerHistory,
} from "./parse";

export {
  parseRobots,
  isAllowed,
  type RobotsRules,
} from "./robotsCheck";
