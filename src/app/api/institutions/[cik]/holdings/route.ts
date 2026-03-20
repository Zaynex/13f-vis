// GET /api/institutions/[cik]/holdings
// Query params:
//   quarter (optional) — e.g. "2025-Q4". Defaults to most recent.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cik: string }> },
) {
  const { searchParams } = new URL(request.url)
  const quarter = searchParams.get('quarter') ?? undefined

  const { cik } = await params

  try {
    // Find the institution
    const institution = await prisma.institution.findUnique({
      where: { cik },
    })

    if (!institution) {
      return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
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
      return NextResponse.json({
        institution,
        filing: null,
        holdings: [],
        message: quarter
          ? `No filing found for ${quarter}`
          : 'No filings found for this institution',
      })
    }

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
      (priorFiling?.holdings ?? []).map((h) => [h.cusip, h.adjustedShares]),
    )

    const holdings = filing.holdings.map((h) => ({
      cusip: h.cusip,
      companyName: h.companyName,
      adjustedShares: h.adjustedShares,
      rawValue: Number(h.rawValue),
      priorAdjustedShares: priorByCusip.get(h.cusip) ?? null,
      changeType: h.changeType,
      changePercent: h.changePercent ? Number(h.changePercent) : null,
    }))

    return NextResponse.json({
      institution,
      filing: {
        quarter: filing.quarter,
        filedAt: filing.filedAt,
        filingUrl: filing.filingUrl,
        holdingsFetchedAt: filing.holdingsFetchedAt,
      },
      holdings,
      priorQuarter: priorFiling ? priorFiling.quarter : null,
    })
  } catch (err) {
    console.error(`[api/institutions/${cik}/holdings] Error:`, err)
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 })
  }
}
