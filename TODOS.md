# TODOs — SEC 13F Visualizer

## In Progress
- None

## Completed

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
- **Status:** Partially done — 4/10 institutions have holdings loaded (Berkshire Hathaway, Bridgewater, BBH, Susquehanna). Vanguard, Citadel, Point72, Two Sigma, BlackRock file 13F-NT (no holdings).

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
13F filings report raw share counts. We pull split data from Yahoo Finance to compute split-adjusted counts. If Yahoo Finance is unavailable for a given CUSIP, shares are shown unadjusted with a warning. This is a known limitation and is documented.

### CUSIP Matching
Holdings are matched by CUSIP (unique security identifier) rather than company name, which can vary across filers. CUSIP is always required and is the authoritative identifier.

### Filing Latency
13F filings are submitted 45 days after quarter end. Data shown is always historical. The UI communicates the filing date prominently to set correct expectations.
