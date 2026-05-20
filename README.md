# SEC 13F Institutional Holdings Visualizer

Track what institutional investors (the "smart money") are doing with their portfolios every quarter.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your PostgreSQL connection string

# 3. Initialize database
npm run db:generate   # Generate Prisma client
npm run db:push        # Push schema to database
npm run db:seed        # Seed initial institution set
npm run db:sync:institutions -- --quarters=4  # Sync recent 13F-HR filer directory

# 4. Fetch 13F data
npm run pipeline:run -- --cik 0001067983 --quarter 2025-Q4   # single quarter
npm run pipeline:run -- --all                                # recent quarter for all institutions
npm run pipeline:run -- --all --backfill                     # ALL historical quarters (slow)
npm run pipeline:run -- --all --backfill --max-quarters 8    # last 8 quarters per institution
npm run pipeline:run -- --cik 0001067983 --backfill          # backfill single institution
npm run pipeline:run -- --cik 0001067983 --backfill --no-split-adjust  # skip Yahoo Finance

# 5. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
SEC EDGAR API
     ↓
Data Pipeline (fetch → parse XML/HTML/text → split-adjust → upsert)
     ↓
PostgreSQL (institutions / filings / holdings)
     ↓
Next.js API Routes
     ↓
React Frontend (holdings dashboard + quarter selector + comparison view + tracker)
```

## Key Design Decisions

- **Dynamic query mode**: API endpoints auto-fetch missing quarters from SEC EDGAR on demand — no manual pipeline runs needed for new quarters. Concurrent requests for the same missing quarter share one pipeline run via a Promise deduplication cache, preventing thundering herd.
- **SEC institution directory sync**: fuzzy search reads the local institution directory, which can be populated from SEC EDGAR quarterly `form.idx` files via `npm run db:sync:institutions`; this sync only stores CIK/name and does not fetch holdings until a user opens an institution or changes quarters.
- **CUSIP as primary join key**: Company names vary across filers. CUSIP is authoritative.
- **Split-adjusted shares**: 13F reports raw shares; Yahoo Finance CUSIP lookup is used first to compute split-adjusted counts for accurate QoQ comparison. Polygon.io can be enabled as a fallback, but is off by default because its free tier is slow for user-triggered imports.
- **Multi-format parser**: EDGAR filings arrive in XML (~40%), HTML (~50%), and text (~10%). The parser handles all three via chain of responsibility.
- **Zod at every external boundary**: All SEC and Yahoo Finance data is validated before touching the DB.

## Initial Institution Set

Pre-seeded institutions and their correct SEC CIKs (all verified on SEC EDGAR):
- Berkshire Hathaway (`0001067983`) — 13F-HR ✅
- Bridgewater Advisors Inc (`0001600319`) — 13F-HR ✅
- Two Sigma Investments LP (`0001179392`) — 13F-HR ✅
- Citadel Advisors LLC (`0001423053`) — 13F-HR ✅
- Point72 Hong Kong Ltd (`0001599822`) — 13F-HR ✅ (US parent files SC 13G only)
- Point72 Europe London LLP (`0001698051`) — 13F-HR ✅
- Susquehanna International Group (`0001765924`) — 13F-HR ✅
- Brown Brothers Harriman (`0000014661`) — 13F-HR ✅
- BlackRock Group LTD (`0001003283`) — 13F-HR ✅

> Note: Vanguard and individual Vanguard funds file 13F-NT or under separate fund CIKs. SteelOak Capital and other small funds not listed have CIKs that need individual verification via SEC EDGAR.

> Note: Some seeded CIKs were incorrect. See `docs/SEC-FILING-FORMATS.md` for details on how to verify CIKs via SEC EDGAR.

## Detailed Format Reference

For engineers working on the parsing pipeline, see `docs/SEC-FILING-FORMATS.md` — covers all three 13F filing formats (XML variants, HTML table structure, EDGAR URL conventions), common parsing bugs, and real examples from production filings.

For the dynamic query mode design (auto-fetch on missing quarters, Promise deduplication, SEC EDGAR fallback behavior), see `docs/DYNAMIC-FETCH-PLAN.md`.

## Glossary

For users unfamiliar with financial terminology (CUSIP, 13F, ETF, split-adjusted shares, etc.), see `docs/GLOSSARY.md` — explains all the terms used in the UI and what they mean for your investment analysis.

## Tech Stack

- Next.js 15 (App Router, TypeScript)
- Prisma (PostgreSQL ORM)
- React Query (data fetching/caching)
- Tailwind CSS (dark-first design)
- Zod (validation)
- recharts (portfolio distribution pie chart)
- cheerio (HTML parsing)
