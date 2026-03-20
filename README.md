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

# 4. Fetch 13F data (example: Berkshire Hathaway, Q4 2025)
npm run pipeline:run -- --cik 0001067983 --quarter 2025-Q4

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
React Frontend (holdings dashboard + comparison view)
```

## Key Design Decisions

- **CUSIP as primary join key**: Company names vary across filers. CUSIP is authoritative.
- **Split-adjusted shares**: 13F reports raw shares; Yahoo Finance stock split data is used to compute split-adjusted counts for accurate QoQ comparison.
- **Multi-format parser**: EDGAR filings arrive in XML (~40%), HTML (~50%), and text (~10%). The parser handles all three via chain of responsibility.
- **Zod at every external boundary**: All SEC and Yahoo Finance data is validated before touching the DB.

## Initial Institution Set

Pre-seeded institutions and their correct SEC CIKs:
- Berkshire Hathaway (`0001067983`) — 42 holdings loaded ✅
- Bridgewater Associates (`0001600319`) — 448 holdings loaded ✅
- Brown Brothers Harriman (`0000014661`) — 1833 holdings loaded ✅
- Susquehanna International Group (`0001765924`) — 107 holdings loaded ✅
- Citadel Advisors (`0001576996`) — 13F-NT only (no holdings)
- Two Sigma Investments (`0001569734`) — 13F-NT only (no holdings)
- Point72 Asset Management (`0002017863`) — 13F-NT only (no holdings)
- Vanguard Group (`0000947529`) — 13F-NT only (no holdings)
- BlackRock (Isle of Man) (`0001483438`) — 13F-NT only (no holdings)

> Note: Some seeded CIKs were incorrect. See `docs/SEC-FILING-FORMATS.md` for details on how to verify CIKs via SEC EDGAR.

## Detailed Format Reference

For engineers working on the parsing pipeline, see `docs/SEC-FILING-FORMATS.md` — covers all three 13F filing formats (XML variants, HTML table structure, EDGAR URL conventions), common parsing bugs, and real examples from production filings.

## Tech Stack

- Next.js 15 (App Router, TypeScript)
- Prisma (PostgreSQL ORM)
- React Query (data fetching/caching)
- Tailwind CSS (dark-first design)
- Zod (validation)
- cheerio (HTML parsing)
