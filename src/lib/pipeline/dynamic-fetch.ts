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

export interface DynamicFetchOptions {
  /** Skip split adjustment (faster but unadjusted shares) */
  skipSplitAdjustment?: boolean
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
 * Get quarters available on SEC EDGAR for a given CIK.
 * Useful for showing available quarters in error messages.
 */
export async function getAvailableQuartersForCik(cik: string): Promise<string[]> {
  return getAvailableQuarters(cik)
}
