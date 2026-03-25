# Plan: Dynamic Query Mode

## What it does
When a user queries `/api/institutions/[cik]/holdings?quarter=2025-Q4` and the quarter doesn't exist in the DB, the server automatically fetches it from SEC EDGAR and stores it — then returns the data. No manual pipeline runs needed.

```
User: GET /api/institutions/0001067983/holdings?quarter=2025-Q4
  ↓
DB lookup → NOT FOUND
  ↓
runPipeline(cik, quarter)  ← idempotent, safe to call
  ↓
SEC EDGAR → parse → split-adjust → upsert to DB
  ↓
Return holdings
```

## Key design decisions

### 1. Deduplication — prevent thundering herd
If 100 users simultaneously query the same missing quarter, we must only fetch once.
Solution: module-level `Promise` cache keyed by `cik:quarter`.

```typescript
// src/lib/pipeline/dynamic-fetch.ts
const pendingFetches = new Map<string, Promise<PipelineResult>>()

export async function dynamicFetch(cik: string, quarter: string): Promise<PipelineResult> {
  const key = `${cik}:${quarter}`
  if (pendingFetches.has(key)) return pendingFetches.get(key)!

  const promise = runPipeline(cik, quarter, { skipSplitAdjustment: false })
  pendingFetches.set(key, promise)
  promise.finally(() => pendingFetches.delete(key))
  return promise
}
```

### 2. Error handling — clear 404 when SEC EDGAR doesn't have the quarter
`runPipeline` throws `NotFoundError` when SEC EDGAR has no filing for that quarter. API must catch this and return a clean 404 instead of a 500.

### 3. `fetchIfMissing` flag
Default: `true`. Set `fetchIfMissing=false` to just query DB (old behavior, for clients that don't want automatic fetches).

### 4. Prior quarter for changeType
After fetching current quarter, we also need the prior quarter to compute `changeType`. If prior quarter is also missing, we fetch that too — recursively.

This is already handled: the holdings API fetches the prior quarter for comparison. If it's missing, the `priorAdjustedShares` will be null and `changeType` will be NEW. We could extend to also dynamically fetch the prior quarter, but that adds complexity. For now: just fetch the requested quarter.

### 5. Rate limiting
`runPipeline` already wraps all SEC EDGAR calls with `rateLimiter.run()` (5 req/sec, 3 concurrent). Multiple concurrent dynamic fetches will queue naturally.

## Files to change

| File | Change |
|------|--------|
| `src/app/api/institutions/[cik]/holdings/route.ts` | Check DB → if missing → `dynamicFetch()` → return data |
| `src/app/api/tracker/[cik]/route.ts` | Same pattern for tracker API |
| `src/lib/pipeline/dynamic-fetch.ts` | **New file**: `dynamicFetch()` with Promise cache + deduplication |

## New API behavior

### GET /api/institutions/[cik]/holdings?quarter=2025-Q4

**DB has data:**
```json
{ "institution": {...}, "filing": {...}, "holdings": [...] }
```

**DB missing, SEC EDGAR has it:**
```json
{ "institution": {...}, "filing": {...}, "holdings": [...], "_fetched": true }
```
(`_fetched: true` indicates this was dynamically fetched)

**DB missing, SEC EDGAR also doesn't have it:**
```json
{ "error": "No 13F filing found for 2025-Q9", "availableQuarters": ["2025-Q4", "2025-Q3", ...] }
```
HTTP 404. `availableQuarters` helps the user correct their query.

### GET /api/tracker/[cik]?from=2025-Q3&to=2025-Q4

Same dynamic fetch for both quarters if missing.

## NOT in scope
- Recursive prior-quarter fetching (prior quarter computed as NEW if missing)
- Background job / queue system for long-running fetches
- Per-user fetch deduplication (deduplication is per CIK+quarter across all requests)
- Polling / async status endpoint (future: return 202 + poll)

## What already exists
- `runPipeline(cik, quarter)` — already exported, idempotent, handles all SEC EDGAR fetching
- `rateLimiter` singleton — already limits to 5 req/sec with 3 concurrent
- `getAvailableQuarters(cik)` — exported, returns quarters available on SEC EDGAR
- `withRetry` — already retries on 429 and transient failures

## Test coverage
- Add unit test for `dynamicFetch` Promise deduplication
- Add API integration test: missing quarter → 404 with clear error
- Add API integration test: missing quarter → dynamic fetch → 200 with data
