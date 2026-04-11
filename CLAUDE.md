# sec-13f-visualizer

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

## Tool Preferences

- Prefer official CLI tools over raw commands or third-party alternatives.
- Examples:
  - Use `supabase` CLI instead of manual `pg_dump`/handwritten SQL export flows.
  - Use `vercel` CLI instead of raw `curl` against Vercel APIs.
- In this repo, prefer `npm` commands because the project is committed with `package-lock.json`.

## Project Snapshot

- Stack: Next.js App Router, TypeScript, Prisma, PostgreSQL, Supabase Auth, Tailwind, Vitest.
- Purpose: ingest SEC 13F filings, normalize holdings, and present institution/compare/tracker/watchlist views.
- Runtime shape:
  - UI pages live in `src/app/*`
  - API routes live in `src/app/api/*`
  - SEC ingestion pipeline lives in `src/lib/pipeline/*`
  - Filing parsers live in `src/lib/parser/*`
  - Prisma schema lives in `prisma/schema.prisma`
  - Supabase SQL and scripts live in `supabase/*`

## Working Rules For This Repo

- Verify repo reality before trusting docs. Some docs capture earlier designs and may lag the current code.
- Preserve the current architecture:
  - App Router route handlers, not Pages Router APIs
  - Prisma is the app data layer
  - Supabase handles auth/session concerns
- Do not introduce a second way to access the same data if Prisma already owns that path.
- Keep CIK handling strict: CIKs are zero-padded 10-digit strings.
- Keep quarter handling strict: use `YYYY-QN` format.
- Treat SEC/network fetching code as rate-limited and failure-prone. Favor narrow changes and explicit error handling.

## Important Project Behaviors

- Missing-quarter reads can trigger on-demand SEC ingestion through `src/lib/pipeline/dynamic-fetch.ts`.
- Concurrent requests for the same missing `CIK + quarter` are deduplicated via an in-memory Promise map.
- Split-adjustment is optional and may use Polygon/Yahoo data. Bulk or fragile pipeline runs may intentionally use `--fast` / `--no-split-adjust`.
- Protected user features are `/watchlist` and `/api/user/*`, enforced by `src/middleware.ts`.
- Watchlist/alerts depend on Supabase auth plus Prisma tables, not Supabase table reads in route handlers.

## Commands

- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- All tests: `npm run test:all`
- Unit tests: `npm run test:unit`
- API tests: `npm run test:api`
- Prisma client: `npm run db:generate`
- Push schema: `npm run db:push`
- Seed institutions: `npm run db:seed`
- Run pipeline for one filing:
  - `npm run pipeline:run -- --cik 0001067983 --quarter 2025-Q4`
- Backfill one institution:
  - `npm run pipeline:run -- --cik 0001067983 --backfill`
- Fast bulk/backfill mode:
  - `npm run pipeline:run -- --all --backfill --fast`

## Environment

- Required baseline env:
  - `DATABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Optional but relevant:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `POLYGON_API_KEY`
  - `YAHOO_FINANCE_BASE_URL`
- Keep secrets in env files or Vercel env vars. Never commit secrets.

## File-Level Guidance

- When changing parsing or pipeline behavior, review:
  - `src/lib/parser/*`
  - `src/lib/pipeline/*`
  - `docs/SEC-FILING-FORMATS.md`
- When changing auth/watchlist behavior, review:
  - `src/middleware.ts`
  - `src/app/auth/*`
  - `src/app/api/user/*`
  - `docs/OAUTH-DEBUGGING.md`
- When changing schema or persistence behavior, review:
  - `prisma/schema.prisma`
  - `prisma/seed.ts`
  - `supabase/migrations/*`

## Validation Expectations

- Prefer targeted tests for the area you changed before broader test runs.
- For API changes, run `npm run test:api` when feasible.
- For parser/pipeline changes, run the smallest relevant fixture/test first, then a real pipeline command if env is available.
- For schema changes, ensure Prisma client regeneration is considered.

## Available Skills

- /office-hours
- /plan-ceo-review
- /plan-eng-review
- /plan-design-review
- /design-consultation
- /review
- /ship
- /browse
- /qa
- /qa-only
- /design-review
- /setup-browser-cookies
- /retro
- /debug
- /document-release
