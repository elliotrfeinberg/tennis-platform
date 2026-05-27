export {
  PoliteFetcher,
  type PoliteFetchOptions,
  type CachedFetchResult,
  type ConditionalHeaders,
} from "./politeFetch.js";

export {
  loadSession,
  initSessionTemplate,
  defaultSessionPath,
  isLoginRedirect,
  LoginRequiredError,
  SessionMissingError,
  type UstaSession,
} from "./session.js";

export {
  extractAspNetState,
  buildPostbackBody,
  type AspNetState,
} from "./aspNetState.js";

export {
  extractViewStateIds,
  type ViewStateIds,
} from "./viewStateIds.js";

export {
  ratingSearchUrl,
  teamProfileUrl,
  flightStandingsUrl,
  scorecardUrl,
  type SearchCriteria,
  type TeamRef,
  type ScorecardRef,
} from "./tennislinkUrls.js";

export {
  parsePlayerSearch,
  type PlayerSearchResultRow,
} from "./parse.js";

export {
  parseTeamProfile,
  type ParsedTeamProfile,
  type TeamProfileHeader,
  type StandingsRow,
  type ScheduleRow,
  type RosterEntry,
} from "./parseTeamProfile.js";

export {
  parseScorecard,
  type ParsedScorecard,
  type ScorecardHeader,
  type ScorecardCourt,
  type ScorecardSet,
} from "./parseScorecard.js";

export {
  parseRobots,
  isAllowed,
  type RobotsRules,
} from "./robotsCheck.js";

export {
  crawlTeam,
  type CrawlFetcher,
  type CrawlTeamOptions,
  type CrawlTeamResult,
  type CrawledScorecard,
  type CrawlError,
} from "./crawlTeam.js";

export {
  BrowserFetcher,
  type BrowserFetcherOptions,
  type BrowserFetchResult,
} from "./browserFetcher.js";

export {
  extractOpponentPar1s,
  type OpponentPar1Entry,
  type OpponentPar1Error,
  type ExtractOpponentPar1sResult,
} from "./extractOpponentPar1s.js";
