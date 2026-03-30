# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.5.0.2] - 2026-03-31

### Added
- **Institution coverage expansion** — Added 5 new institutions (Vanguard, Goldman Sachs, JPMorgan, State Street, Hollencrest Capital Management). Total tracked: 14 institutions, 661+ quarters of filings.
- **SEC EDGAR auto-discovery** — `scripts/discover-institutions.ts` discovers new CIKs using company_tickers.json + pre-researched CIK lists, verifying each has 13F-HR filings via SEC EDGAR Submissions API.
- **Institution directory** — New `/institutions` page with searchable grid of all tracked funds.
- **CIK request system** — `POST /api/institutions/request` allows authenticated users to submit CIKs for tracking. `RequestedInstitution` model tracks PENDING/APPROVED/REJECTED workflow.
- **`--fast` flag** — Pipeline CLI now supports `--fast` to skip Yahoo Finance split adjustment for faster bulk loading.

### Fixed
- **BigInt overflow** — `rawShares` and `adjustedShares` changed from `Int` to `BigInt` (Vanguard has >2B shares, overflowed 32-bit INT4).
- **Next.js 16 async searchParams** — Fixed `searchParams.get()` to use `await searchParams.get()` in compare route.

## [0.5.0.1] - 2026-03-29

### Added
- **Database sync scripts** — Added `npm run db:sync` and `npm run db:sync:full` for syncing local PostgreSQL database to Supabase. The incremental sync script supports both full and incremental modes based on `updatedAt` timestamps.

### Documentation
- **Tool preferences** — Documented preference for official CLI tools over raw commands in CLAUDE.md.

## [0.5.0.0] - 2026-03-27

### Added
- **Supabase Auth** — Added email/password and Google OAuth login via `@supabase/ssr`. New `/auth` page with login/signup toggle. Next.js middleware protects `/watchlist` and `/api/user/*` routes, redirecting unauthenticated users to `/auth?next=<return-path>`.
- **User watchlist** — New `/watchlist` page shows tracked institutions with latest quarter value. Users can add/remove tracked funds from the institution page via a "Track Fund" button.
- **Protected API routes** — `GET/POST/DELETE /api/user/track` and `GET/POST /api/user/alerts` for managing watchlists and alerts (Supabase, RLS-protected).
- **Dual-client architecture** — Supabase client (`src/lib/supabase.ts`) added alongside existing Prisma/PostgreSQL. Public routes (`/`, `/institutions/[cik]`, `/compare`, `/tracker/[cik]`) remain unauthenticated. Prisma + local PostgreSQL continues handling all SEC EDGAR pipeline work.

## [0.4.0.0] - 2026-03-26

### Added
- **Portfolio distribution pie chart** — Institution holdings page now shows a donut chart of top-10 holdings + "Others" bucket with hover tooltips showing value, weight %, and QoQ change badge. Built with recharts, with a pure `computePieSlices()` function for full testability.

## [0.3.0.0] - 2026-03-25

### Added
- **Dynamic query mode** — API endpoints (`/api/institutions/[cik]/holdings` and `/api/tracker/[cik]`) now auto-fetch missing quarters from SEC EDGAR on demand. No manual pipeline runs needed for new quarters. Concurrent requests for the same missing quarter share one pipeline run via a Promise deduplication cache, preventing thundering herd.
- **Dynamic fetch design doc** — Added `docs/DYNAMIC-FETCH-PLAN.md` documenting the architecture (Promise deduplication, SEC EDGAR fallback, error handling).

### Fixed
- **Polygon.io rate limiter race condition** — Restored queue-based slot assignment to prevent concurrent requests from racing past the 12-second rate limit window.
- **Tracker route null-safety** — Added null checks after dynamic fetch re-query to prevent runtime crash when only one quarter was missing and the other was unavailable on SEC EDGAR.
- **API test fixtures** — MSW handlers now validate query params before returning fixture data, and bypass to the real server when no fixture exists (enabling true integration tests for dynamic fetch).

## [0.2.6.0] - 2026-03-24

### Added
- **Weight % column on holdings table** — Each position now shows its portfolio weight percentage (value / total portfolio value), making it easy to see concentration at a glance.
- **Concentration summary panel** — Institution holdings page now shows portfolio total value, position count, top-10 concentration %, and largest position — all computed client-side from existing data.

## [0.2.5.0] - 2026-03-22

### Added
- **Tracker quarter-over-quarter comparison page** (`/tracker/[cik]`) — New dedicated page for comparing any two quarters side-by-side with NEW/EXITED/INCREASED/DECREASED/UNCHANGED groupings. Computes changeType dynamically at query time, immune to stale pre-computed values.
- **Tracker API** (`/api/tracker/[cik]`) — New API endpoint with two modes: `?from=Q1&to=Q2` for two-quarter comparison, and `?quarters=Q1,Q2,Q3,Q4` for multi-quarter trend view.
- **Info tooltips on holdings table** — Column headers (CUSIP, Shares, Value, Change) now show glossary tooltips explaining each term.
- **MSW test infrastructure** — Mock Service Worker setup with handlers for all API endpoints, enabling isolated API integration tests without a running server.

### Fixed
- **CIK zero-padding bug** — Pipeline CIK URL construction was incorrectly stripping leading zeros, causing ALL non-Berkshire institutions to return zero holdings. Fixed: `cikInUrl = paddedCik` (was `parseInt(paddedCik, 10).toString()`).
- **Rate limiter + retry** — `fetchFilingMeta` and `fetchFilingContent` now wrap all SEC EDGAR requests with `rateLimiter.run()` + `withRetry()`, handling 429 rate limits and transient failures gracefully.

### Changed
- **CIK seed data corrections** — Corrected CIKs for Citadel (0001423053), Two Sigma (0001179392), Point72 HK (0001599822), Point72 London (0001698051), BlackRock (0001003283), Susquehanna (0000924808). All 9 institutions now have holdings data loaded.
- **Seed data refinements** — Susquehanna name typo fixed (`SUSPQUEHANNA` → `SUSQUEHANNA`). Point72 US entity excluded (files SC 13G only, not 13F-HR).

## [0.2.4.2] - 2026-03-21

### Fixed
- **13F-HR/A amendment exclusion** — Amendments (`13F-HR/A`) report on prior quarters and were sometimes selected as the primary filing for a target quarter, causing all holdings to show as NEW. Pipeline now excludes `13F-HR/A` from filing selection.
- **periodOfReport extraction** — Cover page parsing now extracts `periodOfReport` directly from the XML to determine the correct filing quarter, instead of relying on the filing date which can be in a different calendar quarter.
- **MM-DD-YYYY date format** — `periodOfReport` values in `MM-DD-YYYY` format (e.g. `06-30-2025`) are now correctly parsed when deriving the filing quarter.
- **SEC EDGAR 503 fallback** — When holdings XML URLs return 503/404, the pipeline now falls back to the `.txt` document. If no holdings are parsed from the `.txt` content, it extracts the embedded `infotable.xml` reference and fetches it directly.
- **Inline XML in .txt files** — Format detection now correctly routes `.txt` files containing embedded XML (`ns1:informationTable`) to the XML parser instead of the text parser.
- **All holdings showing as NEW** — Berkshire Hathaway Q2/Q3 2025 and Bridgewater Associates Q1/Q2 2025 now show correct change types (INCREASED/DECREASED/UNCHANGED) instead of all NEW.

### Changed
- **Sequential split lookups** — Polygon.io split lookups now run sequentially (instead of `Promise.all`) to respect the free-tier rate limit of 5 req/min, preventing 429 errors during backfill.
- **Filing date validation** — When `periodOfReport` is unknown or mismatched, the pipeline now validates that the filing date falls within the target quarter's filing window before accepting or rejecting the filing.

## [0.2.4.1] - 2026-03-21

### Fixed
- **MultiTrendTable trend arrows** — Removed incorrect `.reverse()` call that caused trend arrows to show opposite direction. The API returns values in reverse chronological order (newest first); the old code reversed this, making the delta calculation backwards. Trend arrows now correctly show ↑ when shares increased and ↓ when shares decreased.

## [0.2.4] - 2026-03-21

### Added
- **Polygon.io split adjustment** — Replaced broken Yahoo Finance-only split adjustment with Polygon.io as primary data source. CUSIP→ticker resolution uses Polygon.io's `/v3/reference/tickers?cusip=` endpoint; split data uses `/v3/reference/splits`. Falls back to Yahoo Finance chart API if Polygon.io is unavailable, then to unadjusted shares.
- **Pipeline env loading** — `pipeline:run` now loads `.env.local` via Node's `--env-file` flag, ensuring `POLYGON_API_KEY` and other secrets are available to the CLI.

### Changed
- **Sequential split lookups** — Changed from `Promise.all` to sequential `for...of` in the pipeline to respect Polygon.io's free-tier rate limit (5 req/min), preventing 429 errors from burst requests.

## [0.2.3] - 2026-03-21

### Fixed
- **filedAt now uses SEC filing date** — `meta.filedAt` (SEC filing date from EDGAR API) is now used for split adjustment and database storage instead of the HTTP `Date` header. This fixes the quarter sorting issue where filings appeared in insertion order rather than chronological order due to identical `filedAt` timestamps.

### Added
- **Quarter selector on institution page** — Users can now switch to any available quarter directly on the institution page (`/institutions/[cik]`) via a dropdown, without needing to navigate to the tracker page.
- **Single-quarter mode in tracker** — Added "Single" toggle button to the tracker page for viewing a single quarter's holdings in isolation.

## [0.2.2] - 2026-03-21

### Added
- **Historical backfill** — `npm run pipeline:run -- --all --backfill` fetches all available historical quarters for each institution from SEC EDGAR. `--max-quarters N` limits how many quarters to backfill.
- **Throughput optimization** — Pipeline now fetches from SEC EDGAR at 5 req/sec (3 concurrent workers) instead of 1 req/sec, plus exponential backoff retry on 429 errors.
- **Rate limiter library** — New `RateLimiter` class with semaphore concurrency control and `withRetry` utility with configurable retry predicate.
- **`--no-split-adjust` flag** — Skip Yahoo Finance API calls and use raw SEC EDGAR shares directly. Useful when Yahoo Finance is unavailable.

### Fixed
- **Type mismatch in tracker API** — `adjustedShares` changed from `bigint` to `number` to match actual Prisma schema type.

## [0.2.1] - 2026-03-21

### Added
- **Financial glossary** — Added `docs/GLOSSARY.md` with explanations for CUSIP, 13F Filing, ETF, QoQ, adjusted shares, and other financial terms.

### Changed
- **InfoTooltip on column headers** — Added hover tooltips to CUSIP, Shares, Value, Change columns explaining each term in HoldingsTable and Compare page.

### Fixed
- **Multi-quarter trend arrow logic** — Fixed bug where trend arrows compared first vs last quarter instead of two most recent consecutive quarters. APPLE INC now correctly shows ↓ when shares decreased from Q4→Q3.

### Tests
- **MSW test infrastructure** — Added Vitest with MSW (Mock Service Worker) for API endpoint testing. 27 tests covering change badge logic and data accuracy.

## [0.2.0] - 2026-03-20

### Added
- **Multi-quarter comparison mode** — New `?quarters=` param on `/api/tracker/[cik]` returns all holdings across N quarters with per-quarter shares and value. UI: Two-way / Multi-quarter toggle on tracker page with checkbox quarter selector and TrendTable showing all positions across quarters with trend arrows.
- **Quarter-over-quarter holdings tracker** — New `/tracker/[cik]` page and `/api/tracker/[cik]` endpoint supporting comparison of any two quarters (consecutive or non-consecutive). Shows holdings grouped by NEW/EXITED/INCREASED/DECREASED/UNCHANGED with summary stats.

### Changed
- **Track Changes CTA** — Added prominent CTA directing users to the tracker for each institution.

### Fixed
- Updated to Next.js 15 async params for API routes (resolves type errors).
- Resolved type errors in parsers and schema.
- Fixed inconsistent quarter button ordering in multi-select mode (buttons and heading now both use reverse chronological order).

## [0.1.1] - 2026-03-19

### Added
- Initial SEC 13F visualizer with EDGAR parsing, Prisma/SQLite database, and institution search.
