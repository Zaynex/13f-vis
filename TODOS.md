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

### Institution Coverage Expansion
- **What:** Two-phase SEC EDGAR auto-discovery + institution directory page
- **Why:** Only 9 institutions was insufficient — users had nothing to browse and left quickly
- **Phase 1:** `scripts/discover-institutions.ts` — company_tickers.json (Phase 1) + pre-researched CIKs (Phase 2). Discovered 5 new institutions: Vanguard (0000102909), Goldman Sachs (0000886982), JPMorgan (0000019617), State Street (0000093751), Hollencrest Capital Management (0001161722). Total: 14 institutions, 661+ quarters.
- **Phase 2:** `/institutions` directory page with search, CIK request modal, `POST /api/institutions/request` endpoint, `RequestedInstitution` model with PENDING/APPROVED/REJECTED workflow.
- **BigInt fix:** `rawShares`/`adjustedShares` changed from `Int` to `BigInt` — Vanguard has >2B shares, overflowed 32-bit INT4.
- **CLI:** Added `--fast` flag to skip Yahoo Finance split adjustment for faster bulk loading.
- **Completed:** 2026-03-31 (v0.5.0.2)
- **Where:** `scripts/discover-institutions.ts`, `src/app/institutions/page.tsx`, `src/app/api/institutions/request/route.ts`, `prisma/schema.prisma`

### Sector Allocation Analysis
- **What:** Show % of portfolio in Tech, Healthcare, etc., and concentration risk (top 10 = X%)
- **Why:** High-value for retail investors evaluating fund risk profile
- **Priority:** P2
- **Depends on:** Industry/sector classification pipeline (e.g., GICS sector data)
- **Completed:** 2026-03-24 (v0.2.6.0) — Minimal approach implemented: weight % column on holdings table + top-10 concentration metric + portfolio value + largest position in concentration summary panel. Full sector/industry classification (Tech, Healthcare, etc.) deferred — requires external data enrichment API.
- **Where:** `src/app/institutions/[cik]/page.tsx`, `src/components/HoldingsTable.tsx`

### Portfolio Distribution Pie Chart
- **What:** Added donut chart of top-10 holdings + "Others" bucket with hover tooltips showing value, weight %, and QoQ change badge on the institution holdings page.
- **Why:** Visual pie/donut charts are the standard for portfolio distribution — immediately shows concentration and largest positions without reading a table.
- **Where:** `src/components/HoldingsPieChart.tsx`, `src/lib/holdings-pie.ts`, `src/app/institutions/[cik]/page.tsx`
- **Completed:** 2026-03-26 (v0.4.0.0)

### Supabase Auth + User Watchlists
- **What:** Added Supabase Auth (email + Google OAuth) with dual-client architecture — Prisma + local PostgreSQL for SEC data, Supabase for user auth and watchlists. New `/auth` page, `/watchlist` page, middleware-protected API routes, and "Track Fund" button on institution pages.
- **Why:** Turns the app into a personal investment tracking tool — users log in to save tracked funds.
- **Where:** `src/lib/supabase.ts`, `src/middleware.ts`, `src/app/auth/`, `src/app/watchlist/`, `src/app/api/user/`, `src/app/institutions/[cik]/page.tsx`
- **Completed:** 2026-03-27 (v0.5.0.0)

## Deferred (post-MVP)

### Company-to-Institution Search (Reverse Lookup)
- **What:** Full-text search: type company name → see all institutions holding it + share count
- **Why:** Useful feature not critical to MVP
- **Priority:** P3
- **Depends on:** Sector classification (add industry tags)

### Alert System
- **What:** Institution-level alerts computed dynamically at query time — fires when any holding changes by >thresholdPct (NEW, EXITED, INCREASED >X%, DECREASED >X%)
- **Why:** Creates ongoing engagement beyond passive browsing
- **Priority:** P2
- **Completed:** 2026-03-31 (v0.5.0.3) — GET /api/user/alerts computes fired alerts for all tracked institutions, POST upserts threshold per fund. UserTrackedInstitution model stores thresholdPct (default 25%) per user+institution.
- **Depends on:** Supabase Auth (unblocked by v0.5.0.0)

## Known Limitations

### Stock Split Adjustment
13F filings report raw share counts. We pull split data from Polygon.io (primary, free tier: 5 req/min) with Yahoo Finance as fallback. If both are unavailable for a given CUSIP, shares are shown unadjusted with a warning.

### CUSIP Matching
Holdings are matched by CUSIP (unique security identifier) rather than company name, which can vary across filers. CUSIP is always required and is the authoritative identifier.

### Filing Latency
13F filings are submitted 45 days after quarter end. Data shown is always historical. The UI communicates the filing date prominently to set correct expectations.

### changeType Is Pre-Computed at Pipeline Write Time (Mitigated by Tracker API)
`changeType` (NEW/EXITED/INCREASED/DECREASED/UNCHANGED) is computed and stored when the pipeline runs, not recomputed at query time. This is a performance optimization but creates a data dependency: if a prior quarter is corrected after a later quarter's data is already stored, the later quarter's `changeType` becomes stale.

**Mitigation:** `/api/tracker/[cik]` computes `changeType` dynamically at query time using `calculateChangeBadge(toShares, fromShares)`, making it immune to staleness. The tracker page and comparison features use the tracker API. The holdings page API (`/api/institutions/[cik]/holdings`) uses pre-computed cached values.

**Workaround:** After correcting a prior quarter's data, re-run all subsequent quarters through the pipeline to recompute their `changeType` for the holdings page.

**Proper fix (deferred):** Compute `changeType` dynamically at query time in `/api/institutions/[cik]/holdings` (matching how `/api/tracker/[cik]` does). This would require materializing all historical holdings per CUSIP, which has O(n²) cost for large portfolios.

**Context:** This caused Bridgewater Q4 2024 to show all 129 holdings as NEW after Q3 2024 data was fixed, because Q4 was stored before Q3 existed. Re-running Q4 fixed it.
