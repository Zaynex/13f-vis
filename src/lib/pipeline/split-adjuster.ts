// Stock Split Adjuster — Polygon.io + Yahoo Finance Integration
//
// 13F filings report raw (not split-adjusted) share counts.
// To compare quarter-over-quarter share counts accurately, we need to adjust
// for stock splits using the cumulative split factor.
//
// Data sources (in priority order):
// 1. Yahoo Finance chart API — accepts CUSIP directly, no auth needed
// 2. Optional Polygon.io fallback — requires ENABLE_POLYGON_SPLIT_FALLBACK=true
//    and a POLYGON_API_KEY. Polygon free tier is heavily rate limited, so it is
//    kept opt-in for user-triggered on-demand imports.
// 3. Fallback — unadjusted shares (no split adjustment)
//
// Yahoo Finance chart API:
// GET https://query1.finance.yahoo.com/v8/finance/chart/{cusip}?interval=div%2Fsplit
//
// Polygon.io splits API:
// GET https://api.polygon.io/v3/reference/splits?ticker={ticker}&apiKey={key}

import { StockSplitSchema } from '../schema'

const YAHOO_BASE = process.env.YAHOO_FINANCE_BASE_URL ?? 'https://query1.finance.yahoo.com'
const YAHOO_TIMEOUT_MS = Number(process.env.YAHOO_SPLIT_TIMEOUT_MS ?? 1_500)

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

// ─── Polygon.io types ────────────────────────────────────────────────

interface PolygonSplitsResponse {
  results?: PolygonSplitResult[]
  status?: string
  request_id?: string
}

interface PolygonSplitResult {
  ticker: string
  execution_date: string // "2019-06-05"
  split_from: number
  split_to: number
}

// Cached split data per CUSIP to avoid redundant API calls
const splitCache = new Map<string, Map<string, number>>()
// Map<cusip, Map<dateString, cumulativeSplitFactor>>

// Cached CUSIP → ticker mapping (needed for Polygon.io which uses tickers)
const cusipToTickerCache = new Map<string, string>()

const POLYGON_ENABLED =
  process.env.ENABLE_POLYGON_SPLIT_FALLBACK === 'true' && Boolean(process.env.POLYGON_API_KEY)

const POLYGON_BASE = POLYGON_ENABLED
  ? 'https://api.polygon.io'
  : ''

// Time-based rate limiting for Polygon.io (free tier: 5 req/min, 12s between calls).
// When Polygon is failing (consecutive errors), callers skip Polygon entirely and
// fall through to Yahoo Finance — no waiting.
//
// Queue-based slot assignment prevents concurrent requests from racing past the
// 12-second window. Each slot then enforces the minimum interval before the
// actual API call proceeds.
let rateLimitQueue: Promise<void> = Promise.resolve()
let lastPolygonRequestTime = 0
const POLYGON_MIN_INTERVAL_MS = 12_000

// Track consecutive failures to detect when Polygon.io is down
let polygonConsecutiveFailures = 0
const POLYGON_FAILURE_THRESHOLD = 3

async function rateLimitPolygon(): Promise<void> {
  // If Polygon has been failing, skip entirely so callers fall through to Yahoo Finance
  if (polygonConsecutiveFailures >= POLYGON_FAILURE_THRESHOLD) {
    return
  }

  // Capture our slot in the queue
  const ourSlot = rateLimitQueue

  // Create the next slot for callers behind us
  let resolveNext: () => void
  rateLimitQueue = new Promise<void>((r) => { resolveNext = r })

  // Wait for everyone ahead of us to finish their slot
  await ourSlot

  // Enforce minimum interval between actual API calls
  const now = Date.now()
  const elapsed = now - lastPolygonRequestTime
  if (elapsed < POLYGON_MIN_INTERVAL_MS) {
    await new Promise<void>((r) => setTimeout(r, POLYGON_MIN_INTERVAL_MS - elapsed))
  }
  lastPolygonRequestTime = Date.now()

  // Done — let the next in line proceed
  resolveNext!()
}

function recordPolygonFailure(): void {
  polygonConsecutiveFailures++
}

function recordPolygonSuccess(): void {
  polygonConsecutiveFailures = 0
}

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
 *
 * Tries in order:
 * 1. Yahoo Finance chart API (CUSIP as symbol) — no auth needed
 * 2. Optional Polygon.io splits API (requires ticker, fetched via Yahoo Finance quote)
 * 3. Empty map (no split data available)
 */
async function fetchSplits(cusip: string, beforeDate: Date): Promise<Map<string, number>> {
  // Check cache first
  if (splitCache.has(cusip)) {
    const cached = splitCache.get(cusip)!
    // Filter to only entries before beforeDate
    const filtered = new Map([...cached].filter(([dateStr]) => new Date(dateStr) <= beforeDate))
    return filtered
  }

  // ── 1. Try Yahoo Finance chart API (accepts CUSIP directly) ──
  try {
    const yahooSplits = await fetchYahooSplits(cusip, beforeDate)
    if (yahooSplits.size > 0) {
      splitCache.set(cusip, yahooSplits)
      return new Map([...yahooSplits].filter(([dateStr]) => new Date(dateStr) <= beforeDate))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[splitAdjuster] Yahoo Finance failed for CUSIP ${cusip}: ${msg}`)
  }

  // ── 2. Optional Polygon.io fallback (requires ticker resolution + rate limit) ──
  if (POLYGON_BASE) {
    try {
      const ticker = await resolveCusipToTicker(cusip)
      if (ticker) {
        const polygonSplits = await fetchPolygonSplits(ticker, beforeDate)
        if (polygonSplits.size > 0) {
          splitCache.set(cusip, polygonSplits)
          return new Map([...polygonSplits].filter(([dateStr]) => new Date(dateStr) <= beforeDate))
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[splitAdjuster] Polygon.io failed for CUSIP ${cusip}: ${msg}`)
    }
  }

  // ── 3. No split data available ──
  splitCache.set(cusip, new Map())
  return new Map()
}

async function fetchYahooSplits(cusip: string, beforeDate: Date): Promise<Map<string, number>> {
  const url =
    `${YAHOO_BASE}/v8/finance/chart/${cusip}` +
    `?interval=div%2Fsplit` +
    `&period1=0` +
    `&period2=${Math.floor(beforeDate.getTime() / 1000)}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://finance.yahoo.com/',
    },
    signal: AbortSignal.timeout(YAHOO_TIMEOUT_MS),
  })

  if (!response.ok) return new Map()

  const data: YahooChartResponse = await response.json()
  const result = data.chart?.result?.[0]
  if (!result?.events?.splits) return new Map()

  const splitsMap = new Map<string, number>()
  const events = result.events.splits

  for (const [dateStr, event] of Object.entries(events)) {
    const splitRatio = `${event.numerator}:${event.denominator}`
    const parsed = StockSplitSchema.safeParse({
      cusip,
      splitDate: new Date(parseInt(dateStr) * 1000).toISOString().split('T')[0],
      splitRatio,
    })

    if (!parsed.success) continue

    const factor = event.numerator / event.denominator
    splitsMap.set(parsed.data.splitDate, factor)
  }

  return splitsMap
}

/**
 * Resolve a CUSIP to a stock ticker symbol using Polygon.io ticker search API.
 */
async function resolveCusipToTicker(cusip: string): Promise<string | null> {
  if (cusipToTickerCache.has(cusip)) {
    return cusipToTickerCache.get(cusip)!
  }

  if (!POLYGON_BASE) return null

  try {
    // Wait for rate limit slot before making the request
    await rateLimitPolygon()

    const url =
      `${POLYGON_BASE}/v3/reference/tickers` +
      `?cusip=${encodeURIComponent(cusip)}` +
      `&apiKey=${process.env.POLYGON_API_KEY}`

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (response.status === 429) {
      // Rate limited — wait and return null so Yahoo Finance is tried instead
      recordPolygonFailure()
      await new Promise<void>((r) => setTimeout(r, 12_000))
      return null
    }

    if (!response.ok) {
      recordPolygonFailure()
      return null
    }

    recordPolygonSuccess()

    const data = await response.json()
    const result = data?.results?.[0]
    const ticker = result?.ticker ?? null

    if (ticker) {
      cusipToTickerCache.set(cusip, ticker)
    }
    return ticker
  } catch {
    // Network / timeout error — skip Polygon entirely, fall through to Yahoo Finance
    return null
  }
}

/**
 * Fetch stock splits from Polygon.io for a given ticker.
 */
async function fetchPolygonSplits(ticker: string, beforeDate: Date): Promise<Map<string, number>> {
  if (!POLYGON_BASE) return new Map()

  await rateLimitPolygon()

  try {
    // Fetch splits up to the beforeDate
    const url =
      `${POLYGON_BASE}/v3/reference/splits` +
      `?ticker=${encodeURIComponent(ticker)}` +
      `&apiKey=${process.env.POLYGON_API_KEY}`

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      if (response.status === 429) {
        recordPolygonFailure()
        await new Promise<void>((r) => setTimeout(r, 12_000))
      } else {
        recordPolygonFailure()
      }
      return new Map()
    }

    recordPolygonSuccess()

    const data: PolygonSplitsResponse = await response.json()
    const results = data.results ?? []

    const splitsMap = new Map<string, number>()
    for (const split of results) {
      // Filter to only splits before/on beforeDate
      if (new Date(split.execution_date) <= beforeDate) {
        // split_from/split_to e.g. 1:4 means 1 old share becomes 4 new shares (4:1 split)
        const factor = split.split_to / split.split_from
        splitsMap.set(split.execution_date, factor)
      }
    }

    return splitsMap
  } catch (err) {
    recordPolygonFailure()
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[splitAdjuster] Polygon.io fetch failed for ticker ${ticker}: ${msg}`)
    return new Map()
  }
}

/**
 * Clear the split cache and CUSIP→ticker cache. Useful for testing or forced refresh.
 */
export function clearSplitCache(): void {
  splitCache.clear()
  cusipToTickerCache.clear()
}
