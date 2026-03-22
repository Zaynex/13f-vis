# TODOs — SEC 13F Visualizer

## In Progress
- None

## Completed

### SEC EDGAR Pipeline Robustness
- **What:** Fixed multiple SEC EDGAR filing edge cases that caused all holdings to show as NEW: 13F-HR/A amendment exclusion, periodOfReport extraction from cover page, MM-DD-YYYY date parsing, SEC EDGAR 503/404 fallback chain, inline XML detection in .txt files, and filing date window validation.
- **Why:** Without these fixes, Berkshire Hathaway Q2/Q3 2025 and Bridgewater Associates Q1/Q2 2025 all showed as 100% NEW positions.
- **Where:** `src/lib/pipeline/index.ts` (main fixes), `src/lib/parser/detect.ts` (inline XML detection)
- **Completed:** 2026-03-21

### Non-Consecutive Quarter Comparison + Multi-Quarter Trend View
- **What:** New `/tracker/[cik]` page and `/api/tracker/[cik]` endpoint — compare any two quarters side-by-side with NEW/EXITED/INCREASED/DECREASED/UNCHANGED groupings. Also added Multi-Quarter mode with `?quarters=` param for N-quarter trend table view.
- **Why:** Core feature request: lets users see 6-month or annual change in one view
- **Where:** `src/app/tracker/[cik]/page.tsx`, `src/app/api/tracker/[cik]/route.ts`
- **Completed:** 2026-03-20

### EDGAR Parsing Documentation
- **What:** Document 13F filing format quirks, EDGAR API rate limits, how to add new institutions
- **Why:** Institutional knowledge that will be lost if not written down
- **Where:** `docs/SEC-FILING-FORMATS.md`
- **Completed:** 2026-03-20

### Initial Institution Set
- **What:** Seed the database with 10 major funds (Berkshire, Bridgewater, Citadel, etc.)
- **Why:** Need at least 5-10 institutions for the comparison tool to be meaningful
- **Priority:** P1
- **Status:** Partially done — 4/10 institutions have holdings loaded (Berkshire Hathaway, Bridgewater, BBH, Susquehanna). Corrected CIKs for Citadel, Two Sigma, Point72, BlackRock (seed data had wrong CIKs). Vanguard files 13F-NT under its US entities; individual Vanguard funds file separately under fund-specific CIKs.

## Deferred (post-MVP)

### Company-to-Institution Search (Reverse Lookup)
- **What:** Full-text search: type company name → see all institutions holding it + share count
- **Why:** Useful feature not critical to MVP
- **Priority:** P3
- **Depends on:** Sector classification (add industry tags)

### Sector Allocation Analysis
- **What:** Show % of portfolio in Tech, Healthcare, etc., and concentration risk (top 10 = X%)
- **Why:** High-value for retail investors evaluating fund risk profile
- **Priority:** P2
- **Depends on:** Industry/sector classification pipeline (e.g., GICS sector data)

### Alert System
- **What:** Notify when a tracked institution's position changes by >25% QoQ
- **Why:** Creates ongoing engagement beyond passive browsing
- **Priority:** P2
- **Depends on:** User accounts system

## Known Limitations

### Stock Split Adjustment
13F filings report raw share counts. We pull split data from Polygon.io (primary, free tier: 5 req/min) with Yahoo Finance as fallback. If both are unavailable for a given CUSIP, shares are shown unadjusted with a warning.

### CUSIP Matching
Holdings are matched by CUSIP (unique security identifier) rather than company name, which can vary across filers. CUSIP is always required and is the authoritative identifier.

### Filing Latency
13F filings are submitted 45 days after quarter end. Data shown is always historical. The UI communicates the filing date prominently to set correct expectations.

### changeType Is Pre-Computed at Pipeline Write Time
`changeType` (NEW/EXITED/INCREASED/DECREASED/UNCHANGED) is computed and stored when the pipeline runs, not recomputed at query time. This is a performance optimization but creates a data dependency: if a prior quarter is corrected after a later quarter's data is already stored, the later quarter's `changeType` becomes stale.

**Workaround:** After correcting a prior quarter's data, re-run all subsequent quarters through the pipeline to recompute their `changeType`.

**Proper fix (deferred):** Compute `changeType` dynamically at query time in `/api/institutions/[cik]/holdings` (matching how `/api/tracker/[cik]` already does). The tracker API is the source of truth for change computation; the holdings page API uses cached values.

**Why deferred:** Dynamic computation at query time would require joining all N quarters' holdings for large portfolios, which has O(n²) CUSIP matching cost. At 100+ quarters × 1000+ holdings, this becomes slow. A materialized view or computed-column approach would solve this, but adds significant complexity.

**Context:** This caused Bridgewater Q4 2024 to show all 129 holdings as NEW after Q3 2024 data was fixed, because Q4 was stored before Q3 existed. Re-running Q4 fixed it.
