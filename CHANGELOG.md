# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
