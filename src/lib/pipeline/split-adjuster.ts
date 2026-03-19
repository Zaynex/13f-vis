// Stock Split Adjuster — Yahoo Finance Integration
//
// 13F filings report raw (not split-adjusted) share counts.
// To compare quarter-over-quarter share counts accurately, we need to adjust
// for stock splits using the cumulative split factor.
//
// Yahoo Finance provides historical stock split data via their chart API:
// GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=div%2Fsplit
//
// Since we work with CUSIPs (not tickers), we first need to map CUSIP → ticker.
// Yahoo Finance chart API accepts CUSIP as the symbol parameter in some cases,
// or we can use a CUSIP→ticker mapping service.
//
// For MVP: we use Yahoo Finance's chart endpoint. If the CUSIP isn't recognized,
// we fall back to unadjusted shares (no split adjustment) and log a warning.

import { StockSplitSchema } from '../schema'

const YAHOO_BASE = process.env.YAHOO_FINANCE_BASE_URL ?? 'https://query1.finance.yahoo.com'

interface YahooSplitEvent {
  date: number // Unix timestamp
  numerator: number
  denominator: number
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[]
    error?: { code: string; description: string }
  }
}

interface YahooChartResult {
  symbol: string
  events?: {
    splits?: Record<string, YahooSplitEvent>
  }
}

// Cached split data per CUSIP to avoid redundant API calls
const splitCache = new Map<string, Map<string, number>>()
// Map<cusip, Map<dateString, cumulativeSplitFactor>>

/**
 * Fetch split-adjusted share count for a holding.
 *
 * Given a raw share count and the filing date, this function:
 * 1. Fetches all split events for the CUSIP from Yahoo Finance
 * 2. Computes the cumulative split factor as of the filing date
 * 3. Returns adjustedShares = rawShares / cumulativeSplitFactor
 *
 * If no split data is available, returns rawShares unchanged.
 */
export async function getSplitAdjustedShares(
  cusip: string,
  rawShares: number,
  filingDate: Date,
): Promise<{ adjustedShares: number; cumulativeFactor: number }> {
  const splits = await fetchSplits(cusip, filingDate)

  if (splits.size === 0) {
    return { adjustedShares: rawShares, cumulativeFactor: 1.0 }
  }

  // Cumulative split factor: product of (numerator/denominator) for all
  // splits that occurred on or before the filing date
  let cumulativeFactor = 1.0

  for (const [, factor] of splits) {
    cumulativeFactor *= factor
  }

  const adjustedShares = Math.round(rawShares / cumulativeFactor)

  return { adjustedShares, cumulativeFactor }
}

/**
 * Fetch all stock splits for a CUSIP that occurred before/on the filing date.
 * Returns a Map of date string → cumulative split factor up to that date.
 */
async function fetchSplits(cusip: string, beforeDate: Date): Promise<Map<string, number>> {
  // Check cache first
  if (splitCache.has(cusip)) {
    const cached = splitCache.get(cusip)!
    // Filter to only entries before beforeDate
    const filtered = new Map([...cached].filter(([dateStr]) => new Date(dateStr) <= beforeDate))
    return filtered
  }

  try {
    // Yahoo Finance chart API accepts CUSIP as symbol parameter
    // We use a broad date range to catch all historical splits
    const url =
      `${YAHOO_BASE}/v8/finance/chart/${cusip}` +
      `?interval=div%2Fsplit` +
      `&period1=0` + // from epoch
      `&period2=${Math.floor(beforeDate.getTime() / 1000)}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.warn(`[splitAdjuster] Yahoo Finance returned ${response.status} for CUSIP ${cusip}`)
      return new Map()
    }

    const data: YahooChartResponse = await response.json()
    const result = data.chart?.result?.[0]

    if (!result?.events?.splits) {
      return new Map()
    }

    const splitsMap = new Map<string, number>()
    const events = result.events.splits

    for (const [dateStr, event] of Object.entries(events)) {
      // Validate with Zod
      const splitRatio = `${event.numerator}:${event.denominator}`
      const parsed = StockSplitSchema.safeParse({
        cusip,
        splitDate: new Date(parseInt(dateStr) * 1000).toISOString().split('T')[0],
        splitRatio,
      })

      if (!parsed.success) continue

      // Cumulative factor: multiply all split ratios up to this date
      const factor = event.numerator / event.denominator
      splitsMap.set(parsed.data.splitDate, factor)
      splitCache.set(cusip, splitsMap)
    }

    // Return filtered map (only splits before beforeDate)
    return new Map([...splitsMap].filter(([dateStr]) => new Date(dateStr) <= beforeDate))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[splitAdjuster] Failed to fetch splits for CUSIP ${cusip}: ${msg}`)
    return new Map()
  }
}

/**
 * Clear the split cache. Useful for testing or forced refresh.
 */
export function clearSplitCache(): void {
  splitCache.clear()
}
