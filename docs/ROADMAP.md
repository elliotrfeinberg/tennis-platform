# Product Roadmap

Feature roadmap for the platform, largely benchmarked against
[tennisrecord.com](https://www.tennisrecord.com) (the de-facto reference for
estimated NTRP ratings) plus our own differentiators. Each item notes the
**data source** (so we know whether it's buildable now) and a rough **effort**.

Data model reference (Postgres, see `packages/db/src/schema.ts`):
`players`, `player_year_ratings` (published band + type per year),
`player_perf_ratings` (computed perf rating), `perf_match_results`
(per-court perf, pre/post rating, opponent rating, won, affectsRating),
`court_matches`, `team_matches`, `teams`, `flights`/`subflights`/`leagues`,
`flight_catalog` + `flight_matches` (crawl coverage).

---

## ✅ Already shipped

- **Players directory** (`/players`) — published NTRP band per season, perf
  rating column, search + band filter + sort (name / band / perf).
- **Player detail** (`/players/[id]`) — perf stat cards, rating-over-time
  sparkline (with band edges), and full match log: Date · Category · Court ·
  **Partner (+ snapshot rating)** · **Opponent(s) (+ snapshot ratings)** ·
  W/L · Score · per-match perf · running post-rating.
- **Ratings overview** (`/ratings`) — published-NTRP band distribution.
- **Perf rating model** — symmetric, score-aware, per-category (adult/mixed),
  year-over-year carry-over with band clamping, confidence-weighted anchoring.

These already match tennisrecord's core player page (dynamic rating, rating
history graph, per-match history with opponent/partner ratings).

---

## P0 — High value, data already exists

### 1. Projected year-end rating + bump meter
tennisrecord's flagship: shows `Estimated 3.4790 → Projected Year End 3.5`
and a **Rating Meter** gauge placing you inside your band
(`3.0001 – 3.5000`) with how close you are to a bump.
- **Data:** `player_perf_ratings.display` (perf) vs `player_year_ratings`
  band. Bump logic: perf > band ceiling ⇒ likely **bump up**; within band ⇒
  **safe**; below floor ⇒ **bump down** candidate.
- **Build:** band-gauge component on the player card + "likely bump
  up/down/safe" badge; a "bump candidates" filter on `/players`.
- **Effort:** Medium (small viz + thresholds).

### 2. Win/Loss record + singles/doubles splits + win %
tennisrecord shows `Record · Local Singles · Local Doubles · Local Record`.
- **Data:** `perf_match_results.won` + `court_matches.court_kind`.
- **Build:** record stat card on player page; sortable W/L% and wins columns
  on `/players`.
- **Effort:** Low.

### 3. Rankings & distribution
tennisrecord ranks "by record, percentage, most wins" and shows per-section
breakdowns.
- **Data:** existing perf + records.
- **Build:** add win%/wins sorts to `/players`; on `/ratings` add a perf-rating
  histogram and a percentile readout ("top X% of 3.5s").
- **Effort:** Low–Medium.

### 4. Polish to match their UX
- Rating-column **glossary/legend** (match rating vs dynamic rating, "not yet
  calculated", self-rated opponent ⇒ no rating). We already track
  `affectsRating`/shadow.
- **Season selector** on the match log (meaningful once multiple seasons are
  ingested).
- **Effort:** Low.

---

## P1 — Bigger surfaces, data mostly exists

### 5. Team pages
tennisrecord team page: roster (each member + rating + record), schedule +
results. This is also our **captain** use case.
- **Data:** `teams`, `team_matches`, `court_matches`; roster via court
  participation (or `team_members`).
- **Build:** `/teams/[id]` — roster w/ ratings & records, schedule/results,
  link into the flight standings.
- **Effort:** Medium–High.

### 6. League / flight browse + standings
- **Data:** `flight_catalog`, `flights`, `team_matches` (W/L per team).
- **Build:** `/flights` list + `/flights/[key]` standings + roster.
- **Effort:** Medium.

### 7. Head-to-head
- **Data:** shared `court_matches` between two players.
- **Build:** `/players/[id]` "vs" view or a compare page.
- **Effort:** Medium.

---

## P2 — Differentiators (beyond tennisrecord)

tennisrecord has **no** match predictor, appeal calculator, or what-if tools
(confirmed on their live site). These are our opening:

### 8. Match / lineup win-probability predictor
- **Data:** perf ratings + the `optimizer` package.
- **Build:** "set this lineup vs that opponent ⇒ court-by-court win odds +
  expected team result"; optimal-lineup suggestions for captains.
- **Effort:** High (but high differentiation).

### 9. Appeal / what-if rating calculator
- "What would my rating be if X match were excluded / if I'd won?" — leverages
  the per-match perf model.
- **Effort:** Medium.

---

## Crawl / data coverage (enabling work)

- **Flight enumeration** (done) → `db enumerate-flights` discovers flights via
  player record pages, scrapes flight-level Match Summaries into
  `flight_catalog` + `flight_matches`.
- **Scorecard backfill** → `db backfill-scorecards-db` (t=7 per match);
  `--shard i/N` enables multi-account parallelism (no bulk score endpoint
  exists on TennisLink — per-match scorecard is the unit).
- **Pipeline:** enumerate → backfill-scorecards → normalize-matches →
  compute-ratings --persist.
- **Future:** phase-3 incremental (re-scan flight Match Summaries, ingest only
  matches with date > last seen — `flight_matches.played_on` drives this);
  real sub-flight grouping (currently one synthetic subflight per flight).

---

## Notes / open questions

- **Rating calibration:** symmetric split model fixed provisional-player
  inflation; revisit whether explicit shrinkage-to-band is needed once the
  full dataset is in (a genuine over-performer still climbs, at half rate).
- **Data source / ToS:** TennisLink is auth-walled and USTA disavows
  third-party scraping; the sanctioned path is the USTA Connect partner API.
  Multi-account crawling is detection-evasion — weigh before scaling.
