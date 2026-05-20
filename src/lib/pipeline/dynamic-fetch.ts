// Dynamic Fetch — On-demand SEC EDGAR fetching with deduplication
//
// Problem: When a user queries a quarter that doesn't exist in the DB,
// we want to automatically fetch it from SEC EDGAR rather than returning 404.
// But if 100 users query the same missing quarter simultaneously,
// we must only fetch once.
//
// Solution: Promise-based deduplication cache. First request triggers the fetch,
// all concurrent requests share the same Promise.
//
// Data flow:
//   API route → DB lookup → NOT FOUND → dynamicFetch() → SEC EDGAR → parse → DB → return

import { runPipeline } from './index'
import { getAvailableQuarters } from './index'

// Deduplication cache: key = "CIK:quarter", value = pending Promise
// Cleared on success or failure via .finally()
const pendingFetches = new Map<string, Promise<unknown>>()
const pendingLatestFetches = new Map<string, Promise<DynamicFetchLatestResult>>()

export interface DynamicFetchOptions {
  /** Skip split adjustment (faster but unadjusted shares) */
  skipSplitAdjustment?: boolean
}

export interface DynamicFetchLatestResult {
  quarter: string
  fetched: boolean
}

export interface DynamicFetchManyOptions extends DynamicFetchOptions {
  /** Maximum number of distinct quarter pipelines to start at once */
  concurrency?: number
}

/**
 * Fetch a quarter's holdings from SEC EDGAR if not in DB.
 * Idempotent — safe to call multiple times concurrently.
 * Deduplicates concurrent requests for the same CIK+quarter.
 */
export async function dynamicFetch(
  cik: string,
  quarter: string,
  options: DynamicFetchOptions = {},
): Promise<void> {
  const key = `${cik}:${quarter}`

  // Already fetching? Wait for that Promise instead of starting a new one.
  if (pendingFetches.has(key)) {
    await pendingFetches.get(key)
    return
  }

  // Start the pipeline fetch and cache the Promise.
  // .finally() ensures we clean up the cache whether it succeeds or fails.
  const promise = runPipeline(cik, quarter, {
    skipUpsert: false,
    skipSplitAdjustment: options.skipSplitAdjustment ?? false,
  }).finally(() => {
    pendingFetches.delete(key)
  })

  pendingFetches.set(key, promise as Promise<unknown>)
  await promise
}

/**
 * Fetch the newest 13F-HR quarter currently available on SEC EDGAR.
 * Concurrent calls for the same CIK share both the submissions lookup and
 * the underlying CIK+quarter pipeline.
 */
export async function dynamicFetchLatest(
  cik: string,
  options: DynamicFetchOptions = {},
): Promise<DynamicFetchLatestResult> {
  const key = cik

  if (pendingLatestFetches.has(key)) {
    return pendingLatestFetches.get(key)!
  }

  const promise = (async () => {
    const quarters = await getAvailableQuarters(cik)
    const latestQuarter = quarters[0]

    if (!latestQuarter) {
      throw new Error(`No 13F-HR quarters available for CIK ${cik}`)
    }

    await dynamicFetch(cik, latestQuarter, options)
    return { quarter: latestQuarter, fetched: true }
  })().finally(() => {
    pendingLatestFetches.delete(key)
  })

  pendingLatestFetches.set(key, promise)
  return promise
}

/**
 * Fetch several missing quarters with bounded concurrency.
 * Each item still goes through dynamicFetch(), so duplicate quarters and
 * concurrent requests from other API calls reuse the same CIK+quarter promise.
 */
export async function dynamicFetchMany(
  cik: string,
  quarters: string[],
  options: DynamicFetchManyOptions = {},
): Promise<void> {
  const uniqueQuarters = [...new Set(quarters)]
  const concurrency = Math.max(1, options.concurrency ?? 2)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < uniqueQuarters.length) {
      const quarter = uniqueQuarters[nextIndex]
      nextIndex += 1
      await dynamicFetch(cik, quarter, options)
    }
  }

  const workerCount = Math.min(concurrency, uniqueQuarters.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
}

/**
 * Get quarters available on SEC EDGAR for a given CIK.
 * Useful for showing available quarters in error messages.
 */
export async function getAvailableQuartersForCik(cik: string): Promise<string[]> {
  return getAvailableQuarters(cik)
}
