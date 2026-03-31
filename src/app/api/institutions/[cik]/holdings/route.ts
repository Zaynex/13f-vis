// GET /api/institutions/[cik]/holdings
// Query params:
//   quarter (optional) — e.g. "2025-Q4". Defaults to most recent.
//   fetchIfMissing (optional, default: true) — set false to skip dynamic fetch

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { dynamicFetch, getAvailableQuartersForCik } from '@/lib/pipeline/dynamic-fetch'
import { NotFoundError } from '@/lib/errors'

// Quarter format: YYYY-QN where N is 1-4
const QUARTER_REGEX = /^\d{4}-Q[1-4]$/

function isValidQuarter(q: string): boolean {
  return QUARTER_REGEX.test(q)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cik: string }> },
) {
  const { searchParams } = new URL(request.url)
  const quarter = (await searchParams).get('quarter') ?? undefined
  const fetchIfMissing = (await searchParams).get('fetchIfMissing') !== 'false'

  const { cik } = await params

  try {
    // Find the institution
    const institution = await prisma.institution.findUnique({
      where: { cik },
    })

    if (!institution) {
      return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
    }

    // Validate quarter format if provided — fast-fail before any SEC EDGAR calls
    if (quarter && !isValidQuarter(quarter)) {
      return NextResponse.json(
        { error: `Invalid quarter format: '${quarter}'. Expected YYYY-QN (e.g. 2025-Q4)` },
        { status: 400 },
      )
    }

    // Find the filing
    const filing = await prisma.filing.findFirst({
      where: {
        institutionCik: cik,
        ...(quarter ? { quarter } : {}),
      },
      orderBy: quarter ? undefined : { filedAt: 'desc' },
      include: {
        holdings: {
          orderBy: { rawValue: 'desc' },
        },
      },
    })

    if (!filing) {
      // No filing in DB — try dynamic fetch from SEC EDGAR
      if (fetchIfMissing && quarter) {
        try {
          await dynamicFetch(cik, quarter)
        } catch (err) {
          // dynamicFetch threw — SEC EDGAR doesn't have this quarter
          if (err instanceof NotFoundError) {
            const available = await getAvailableQuartersForCik(cik)
            return NextResponse.json(
              {
                error: `No 13F filing found for ${quarter} on SEC EDGAR`,
                availableQuarters: available,
              },
              { status: 404 },
            )
          }
          // Other error (network, rate limit, etc.)
          console.error(`[api/institutions/${cik}/holdings] Dynamic fetch failed:`, err)
          return NextResponse.json(
            { error: 'Failed to fetch filing from SEC EDGAR. Try again later.' },
            { status: 500 },
          )
        }

        // Fetch succeeded — re-query DB
        const refetched = await prisma.filing.findFirst({
          where: { institutionCik: cik, quarter },
          include: { holdings: { orderBy: { rawValue: 'desc' } } },
        })

        if (refetched) {
          const response = await buildHoldingsResponse(cik, refetched, institution.name)
          return NextResponse.json({ ...response, _fetched: true })
        }
      }

      return NextResponse.json({
        institution,
        filing: null,
        holdings: [],
        message: quarter
          ? `No filing found for ${quarter}`
          : 'No filings found for this institution',
      })
    }

    // Filing found — build response
    const response = await buildHoldingsResponse(cik, filing, institution.name)
    return NextResponse.json(response)
  } catch (err) {
    console.error(`[api/institutions/${cik}/holdings] Error:`, err)
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 })
  }
}

async function buildHoldingsResponse(
  cik: string,
  filing: import('@prisma/client').Filing & { holdings: import('@prisma/client').Holding[] },
  institutionName: string,
) {
  // Also fetch prior quarter for change comparison
  const [year, qPart] = filing.quarter.split('-Q')
  const qNum = parseInt(qPart, 10)
  const priorQuarter =
    qNum === 1 ? `${parseInt(year) - 1}-Q4` : `${year}-Q${qNum - 1}`

  const priorFiling = await prisma.filing.findUnique({
    where: { institutionCik_quarter: { institutionCik: cik, quarter: priorQuarter } },
    include: { holdings: { select: { cusip: true, adjustedShares: true } } },
  })

  const priorByCusip = new Map(
    (priorFiling?.holdings ?? []).map((h) => [h.cusip, Number(h.adjustedShares)]),
  )

  const holdings = filing.holdings.map((h) => ({
    cusip: h.cusip,
    companyName: h.companyName,
    adjustedShares: Number(h.adjustedShares),
    rawValue: Number(h.rawValue),
    priorAdjustedShares: priorByCusip.get(h.cusip) ?? null,
    changeType: h.changeType,
    changePercent: h.changePercent ? Number(h.changePercent) : null,
  }))

  return {
    institution: { cik, name: institutionName },
    filing: {
      quarter: filing.quarter,
      filedAt: filing.filedAt,
      filingUrl: filing.filingUrl,
      holdingsFetchedAt: filing.holdingsFetchedAt,
    },
    holdings,
    priorQuarter: priorFiling ? priorFiling.quarter : null,
  }
}
