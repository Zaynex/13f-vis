// 13F Pipeline — Orchestrator
//
// Coordinates the full data flow:
//   SEC EDGAR → fetch filing → parse → split-adjust → upsert to DB
//
// Designed to run on a nightly cron, but can be triggered on-demand.
// Each step is independent and retryable.
//
// Architecture diagram:
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │  Pipeline.run(cik, quarter)                                  │
//   │                                                              │
//   │  1. fetchFilingMeta(cik, quarter)                          │
//   │     → SEC EDGAR company submissions JSON                    │
//   │     → find the 13F filing URL for the given quarter        │
//   │                                                              │
//   │  2. fetchFilingContent(url)                                 │
//   │     → GET the raw filing from SEC EDGAR                    │
//   │     → handle 429 (rate limit), 404, timeout                │
//   │                                                              │
//   │  3. parse13FFiling(content, url)                            │
//   │     → detect format → XML/HTML/text                        │
//   │     → validate via Zod schema                              │
//   │                                                              │
//   │  4. splitAdjustments(holdings, filingDate)                  │
//   │     → for each holding, fetch Yahoo Finance split data     │
//   │     → compute adjustedShares + cumulativeSplitFactor        │
//   │                                                              │
//   │  5. computeChanges(institutions, quarter)                    │
//   │     → look up prior quarter holdings by CUSIP              │
//   │     → calculate changeType + changePercent                  │
//   │                                                              │
//   │  6. upsertFiling + upsertHoldings                           │
//   │     → Prisma upsert (idempotent, safe to re-run)           │
//   └──────────────────────────────────────────────────────────────┘

import { PrismaClient } from '@prisma/client'
import { parse13FFiling } from '../parser'
import { getSplitAdjustedShares } from './split-adjuster'
import { calculateChangeBadge, ChangeBadge } from '../schema'
import { FetchError, RateLimitError, NotFoundError } from '../errors'

const prisma = new PrismaClient()

const SEC_EDGAR_BASE = 'https://www.sec.gov'
const SUBMISSIONS_API = 'https://data.sec.gov/submissions'

// SEC EDGAR requires User-Agent with contact info
const EDGAR_HEADERS = {
  'User-Agent': '13F Tracker vincent@example.com',
  'Accept': 'application/json, text/html, application/xml',
}

// SEC EDGAR rate limits: 10 requests/second. We enforce 1 req/sec.
const REQUEST_DELAY_MS = 1_000

// ─── Public API ─────────────────────────────────────────────────────────────

export interface PipelineResult {
  cik: string
  quarter: string
  holdingsProcessed: number
  filingUrl: string
  filedAt: Date
}

/**
 * Run the full pipeline for one institution and one quarter.
 * Idempotent — safe to re-run if interrupted.
 */
export async function runPipeline(
  cik: string,
  quarter: string,
  options?: { skipUpsert?: boolean },
): Promise<PipelineResult> {
  // 1. Fetch filing metadata from SEC EDGAR
  const meta = await fetchFilingMeta(cik, quarter)
  await delay(REQUEST_DELAY_MS)

  // 2. Fetch raw filing content
  const { content, filedAt } = await fetchFilingContent(meta.filingUrl)
  await delay(REQUEST_DELAY_MS)

  // 3. Parse into normalized holdings
  const rawHoldings = await parse13FFiling(content, meta.filingUrl)

  // 4. Apply split adjustments
  const filingDate = new Date(filedAt)
  const splitAdjustedHoldings = await Promise.all(
    rawHoldings.map(async (h) => {
      const { adjustedShares, cumulativeFactor } = await getSplitAdjustedShares(
        h.cusip,
        h.shares,
        filingDate,
      )
      return { ...h, adjustedShares, cumulativeFactor }
    }),
  )

  // 5. Compute changes vs prior quarter
  const priorHoldings = await getPriorQuarterHoldings(cik, quarter)
  const priorByCusip = new Map(priorHoldings.map((h) => [h.cusip, h.adjustedShares]))

  // Aggregate by CUSIP: sum adjustedShares across all sub-advisor entries in the same filing.
  // rawShares/rawValue are summed; cumulativeFactor is the same for all entries of the same CUSIP.
  const aggregatedByCusip = new Map<string, { rawShares: number; rawValue: number; adjShares: number; name: string; cumFactor: number }>()
  for (const h of splitAdjustedHoldings) {
    const key = h.cusip
    const existing = aggregatedByCusip.get(key)
    if (existing) {
      existing.rawShares += h.shares
      existing.rawValue += h.value
      existing.adjShares += h.adjustedShares
    } else {
      aggregatedByCusip.set(key, {
        rawShares: h.shares,
        rawValue: h.value,
        adjShares: h.adjustedShares,
        name: h.companyName,
        cumFactor: h.cumulativeFactor,
      })
    }
  }

  const enrichedHoldings = [...aggregatedByCusip.entries()].map(([cusip, agg]) => {
    const priorShares = priorByCusip.get(cusip) ?? null
    const badge = calculateChangeBadge(agg.adjShares, priorShares)
    const changePercent =
      priorShares !== null && priorShares > 0
        ? ((agg.adjShares - priorShares) / priorShares) * 100
        : null
    return {
      cusip,
      companyName: agg.name,
      rawShares: agg.rawShares,
      rawValue: agg.rawValue,
      adjustedShares: agg.adjShares,
      cumulativeFactor: agg.cumFactor,
      priorAdjustedShares: priorShares,
      changeType: badge,
      changePercent,
    }
  })

  // 6. Upsert to DB (or skip if dry-run)
  if (!options?.skipUpsert) {
    await upsertFilingAndHoldings(cik, quarter, meta.filingUrl, filedAt, enrichedHoldings)
  }

  return {
    cik,
    quarter,
    holdingsProcessed: enrichedHoldings.length,
    filingUrl: meta.filingUrl,
    filedAt: new Date(filedAt),
  }
}

// ─── Step 1: Fetch Filing Metadata ──────────────────────────────────────────

interface FilingMeta {
  filingUrl: string
  filedAt: string
}

async function fetchFilingMeta(cik: string, quarter: string): Promise<FilingMeta> {
  // SEC EDGAR provides a company submissions JSON at:
  // https://data.sec.gov/submissions/CIK<10-digit>.json
  const paddedCik = cik.padStart(10, '0')
  const url = `${SUBMISSIONS_API}/CIK${paddedCik}.json`

  const response = await fetch(url, {
    headers: EDGAR_HEADERS,
    signal: AbortSignal.timeout(30_000),
  })

  if (response.status === 429) {
    throw new RateLimitError(60_000, { filingUrl: url, quarter })
  }

  if (response.status === 404) {
    throw new NotFoundError(`CIK ${cik} not found on SEC EDGAR`, { filingUrl: url })
  }

  if (!response.ok) {
    throw new FetchError(`SEC EDGAR API returned ${response.status}`, { filingUrl: url })
  }

  const data = await response.json()
  const recent = data?.filings?.recent

  // SEC EDGAR returns parallel arrays — zip them into filing objects
  // Structure: { accessionNumber: [...], filingDate: [...], form: [...], primaryDocument: [...] }
  if (!recent || !Array.isArray(recent.accessionNumber)) {
    throw new FetchError(`Unexpected EDGAR response structure for CIK ${cik}`, { filingUrl: url })
  }

  const count = recent.accessionNumber.length
  const filings: Array<{
    accessionNumber: string
    filingDate: string
    form: string
    primaryDocument: string
  }> = []

  for (let i = 0; i < count; i++) {
    filings.push({
      accessionNumber: String(recent.accessionNumber[i] ?? ''),
      filingDate: String(recent.filingDate[i] ?? ''),
      form: String(recent.form[i] ?? ''),
      primaryDocument: String(recent.primaryDocument[i] ?? ''),
    })
  }

  // Find the 13F filing for the given quarter
  // quarter format: "2025-Q4" → filingDate "2025-11-14"
  const [year, qPart] = quarter.split('-Q')
  const qNum = parseInt(qPart, 10)

  // Quarter end months: Q1=03-31, Q2=06-30, Q3=09-30, Q4=12-31
  const quarterEndMonths: Record<string, string> = {
    Q1: '03-31',
    Q2: '06-30',
    Q3: '09-30',
    Q4: '12-31',
  }
  const qKey = `Q${qPart}`
  const quarterEnd = `${year}-${quarterEndMonths[qKey]}`
  // Quarter start: first day of the quarter
  const quarterStartMonths: Record<string, string> = {
    Q1: '01-01',
    Q2: '04-01',
    Q3: '07-01',
    Q4: '10-01',
  }
  const qsStr = `${year}-${quarterStartMonths[qKey]}`
  const quarterStart = new Date(qsStr + 'T00:00:00')

  // Due dates are 45 days after quarter end, allow 60 days buffer for late filers
  const dueDate = addDays(new Date(`${quarterEnd}T00:00:00`), 60)

  // Filter for 13F filings (forms: 13F, 13F-HR, 13F-HR/A, etc.)
  const f13fFilings = filings.filter((f) => f.form.toUpperCase().includes('13F'))

  // Sort by filing date descending
  const sorted = [...f13fFilings].sort(
    (a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime(),
  )

  // Find the best matching filing
  let selectedFiling = sorted.find(
    (f) => f.filingDate >= quarterStart.toISOString().split('T')[0] && f.filingDate <= dueDate.toISOString().split('T')[0],
  )

  // Fallback: most recent 13F filing
  if (!selectedFiling) {
    selectedFiling = sorted[0]
  }

  if (!selectedFiling) {
    throw new NotFoundError(
      `No 13F filing found for ${cik} in quarter ${quarter}`,
      { filingUrl: url, quarter },
    )
  }

  // Build the EDGAR filing URL
  // Format: https://www.sec.gov/Archives/edgar/data/<CIK>/<accession>/<document>
  // CIK in URL is NOT zero-padded (SEC normalizes it)
  // Accession in directory is WITHOUT dashes; in filename it HAS dashes
  const cikInUrl = parseInt(paddedCik, 10).toString()
  const accessionNormalized = selectedFiling.accessionNumber.replace(/-/g, '')
  const accessionFilename = selectedFiling.accessionNumber // keep dashes for filename

  // primaryDocument from the submissions API points to the COVER PAGE (primary_doc.xml).
  // The actual holdings (INFOTABLE) are in a separate document, typically named "50240.xml"
  // or similar. We need to fetch the INDEX page to find the correct document.
  const indexUrl = `${SEC_EDGAR_BASE}/Archives/edgar/data/${cikInUrl}/${accessionNormalized}/${accessionFilename}-index.htm`
  const holdingsUrl = await findInformationTableUrl(indexUrl)

  return {
    filingUrl: holdingsUrl ?? `${SEC_EDGAR_BASE}/Archives/edgar/data/${cikInUrl}/${accessionNormalized}/50240.xml`,
    filedAt: selectedFiling.filingDate,
  }
}

// ─── Helper: Find information table URL from index page ─────────────────────

async function findInformationTableUrl(indexUrl: string): Promise<string | null> {
  try {
    const response = await fetch(indexUrl, {
      headers: EDGAR_HEADERS,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null

    const html = await response.text()

    // Look for 50240.xml or similar information table documents
    // Pattern: /Archives/edgar/data/<cik>/<acc>/<number>.xml where number is not the accession
    // Use [^"]* (not [^"]+) to avoid greedy matching across HTML tags
    const matches = [...html.matchAll(/href="(\/Archives\/edgar\/data\/[^"]*50240\.xml)"/gi)]
    if (matches.length > 0) {
      const path = matches[0][1]
      // Convert relative path to absolute URL
      return path.startsWith('http') ? path : `${SEC_EDGAR_BASE}${path}`
    }

    // Also try: look for infotable.xml or similar
    // Prefer the NON-XSL version (raw XML) over xslForm13F_X02/ (which is HTML)
    const infoMatches = [...html.matchAll(/href="(\/Archives\/edgar\/data\/[^"]*infotable\.xml)"/gi)]
    // Find non-XSL version first
    for (const match of infoMatches) {
      const path = match[1]
      if (!path.includes('-index') && !path.includes('xslForm')) {
        return path.startsWith('http') ? path : `${SEC_EDGAR_BASE}${path}`
      }
    }
    // Fallback: XSL version (will be HTML, but parseable)
    for (const match of infoMatches) {
      const path = match[1]
      if (!path.includes('-index')) {
        return path.startsWith('http') ? path : `${SEC_EDGAR_BASE}${path}`
      }
    }

    // Last resort: any .xml that's NOT primary_doc and NOT accession-numbered
    // Use [^"]* (not [^"]+) to avoid greedy matching across HTML tags
    // Use /i flag to match .XML (uppercase) as well as .xml
    const xmlMatches = [...html.matchAll(/href="(\/Archives\/edgar\/data\/[^"]*\.xml)"/gi)]
    for (const match of xmlMatches) {
      const url = match[1]
      // Skip primary_doc (cover page) and accession-numbered files
      if (url.includes('primary_doc') || url.includes('-index')) continue
      // Skip if it looks like an accession-numbered file (contains two number segments)
      const filename = url.split('/').pop() ?? ''
      if (/^\d{10,}\.xml$/.test(filename)) continue
      return url.startsWith('http') ? url : `${SEC_EDGAR_BASE}${url}`
    }

    return null
  } catch {
    return null
  }
}

// ─── Step 2: Fetch Filing Content ───────────────────────────────────────────

async function fetchFilingContent(filingUrl: string): Promise<{ content: string; filedAt: string }> {
  const response = await fetch(filingUrl, {
    headers: { ...EDGAR_HEADERS, 'Accept': 'text/html, application/xml, text/plain' },
    signal: AbortSignal.timeout(60_000),
  })

  if (response.status === 429) {
    throw new RateLimitError(60_000, { filingUrl })
  }

  if (response.status === 404) {
    throw new NotFoundError(`Filing not found: ${filingUrl}`)
  }

  if (!response.ok) {
    throw new FetchError(`Failed to fetch filing: ${response.status}`, { filingUrl })
  }

  const content = await response.text()
  const filedAt = response.headers.get('Date') ?? new Date().toISOString()

  return { content, filedAt }
}

// ─── Step 5: Get Prior Quarter Holdings ────────────────────────────────────

interface PriorHolding {
  cusip: string
  adjustedShares: number
}

async function getPriorQuarterHoldings(cik: string, quarter: string): Promise<PriorHolding[]> {
  const priorQuarter = getPriorQuarter(quarter)

  const priorFiling = await prisma.filing.findUnique({
    where: {
      institutionCik_quarter: { institutionCik: cik, quarter: priorQuarter },
    },
    include: { holdings: { select: { cusip: true, adjustedShares: true } } },
  })

  return priorFiling?.holdings ?? []
}

// ─── Step 6: Upsert ─────────────────────────────────────────────────────────

interface EnrichedHolding {
  cusip: string
  companyName: string
  rawShares: number
  rawValue: number
  adjustedShares: number
  cumulativeFactor: number
  priorAdjustedShares: number | null
  changeType: ChangeBadge
  changePercent: number | null
}

async function upsertFilingAndHoldings(
  cik: string,
  quarter: string,
  filingUrl: string,
  filedAt: string,
  holdings: EnrichedHolding[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Upsert institution
    await tx.institution.upsert({
      where: { cik },
      update: {},
      create: { cik, name: `CIK ${cik}` }, // name will be updated from SEC data
    })

    // Upsert filing
    const filing = await tx.filing.upsert({
      where: {
        institutionCik_quarter: { institutionCik: cik, quarter },
      },
      update: {
        filingUrl,
        filedAt: new Date(filedAt),
        holdingsFetchedAt: new Date(),
      },
      create: {
        institutionCik: cik,
        quarter,
        filingUrl,
        filedAt: new Date(filedAt),
        holdingsFetchedAt: new Date(),
      },
    })

    // Delete existing holdings (simpler than diff)
    await tx.holding.deleteMany({ where: { filingId: filing.id } })

    // Insert new holdings
    await tx.holding.createMany({
      data: holdings.map((h) => ({
        filingId: filing.id,
        cusip: h.cusip,
        companyName: h.companyName,
        rawShares: h.rawShares,
        rawValue: h.rawValue,
        cumulativeSplitFactor: h.cumulativeFactor,
        adjustedShares: h.adjustedShares,
        priorAdjustedShares: h.priorAdjustedShares,
        changeType: h.changeType,
        changePercent: h.changePercent,
      })),
    })
  })
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getPriorQuarter(quarter: string): string {
  const [year, qPart] = quarter.split('-Q')
  const qNum = parseInt(qPart, 10)
  const y = parseInt(year, 10)

  if (qNum === 1) {
    return `${y - 1}-Q4`
  }
  return `${y}-Q${qNum - 1}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
