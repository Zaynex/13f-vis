// GET /api/tracker/[cik]?from=2025-Q3&to=2025-Q4
//
// Quarter-over-quarter comparison for a single institution.
// Fetches two quarters' filings and computes the diff at query time
// (not pre-computed — works for any two quarters, consecutive or not).
//
// Response shape:
// {
//   institution: { cik, name }
//   from: { quarter, totalValue, holdings: [...] }
//   to: { quarter, totalValue, holdings: [...] }
//   diff: {
//     new: [...],      // in "to" but not "from"
//     exited: [...],   // in "from" but not "to"
//     increased: [...], // in both, toShares > fromShares
//     decreased: [...], // in both, toShares < fromShares
//     unchanged: [...]  // in both, same shares
//   }
//   summary: {
//     fromTotalValue, toTotalValue,
//     valueDelta, valueDeltaPercent,
//     newCount, exitedCount, increasedCount, decreasedCount, unchangedCount
//   }
// }

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TrackerQuerySchema } from '@/lib/schema'
import { calculateChangeBadge, ChangeBadge } from '@/lib/schema'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cik: string }> },
) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''

  const { cik } = await params
  const parsed = TrackerQuerySchema.safeParse({ cik, from, to })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.format() },
      { status: 400 },
    )
  }

  const { from: fromQuarter, to: toQuarter } = parsed.data

  try {
    // Fetch institution
    const institution = await prisma.institution.findUnique({
      where: { cik },
    })
    if (!institution) {
      return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
    }

    // Fetch both filings in parallel
    const [fromFiling, toFiling] = await Promise.all([
      prisma.filing.findUnique({
        where: { institutionCik_quarter: { institutionCik: cik, quarter: fromQuarter } },
        include: { holdings: true },
      }),
      prisma.filing.findUnique({
        where: { institutionCik_quarter: { institutionCik: cik, quarter: toQuarter } },
        include: { holdings: true },
      }),
    ])

    if (!fromFiling) {
      return NextResponse.json(
        { error: `No holdings data found for ${fromQuarter}` },
        { status: 404 },
      )
    }
    if (!toFiling) {
      return NextResponse.json(
        { error: `No holdings data found for ${toQuarter}` },
        { status: 404 },
      )
    }

    // Build CUSIP lookup maps
    const fromByCusip = new Map(
      fromFiling.holdings.map((h) => [
        h.cusip,
        { companyName: h.companyName, adjustedShares: h.adjustedShares, rawValue: Number(h.rawValue) },
      ]),
    )
    const toByCusip = new Map(
      toFiling.holdings.map((h) => [
        h.cusip,
        { companyName: h.companyName, adjustedShares: h.adjustedShares, rawValue: Number(h.rawValue) },
      ]),
    )

    // Compute diff
    type DiffEntry = {
      cusip: string
      companyName: string
      fromShares: number | null
      toShares: number | null
      fromValue: number | null
      toValue: number | null
      deltaShares: number | null
      deltaPercent: number | null
      changeType: ChangeBadge
    }

    const allCusips = new Set([...fromByCusip.keys(), ...toByCusip.keys()])
    const diffEntries: DiffEntry[] = []

    for (const cusip of allCusips) {
      const fromH = fromByCusip.get(cusip)
      const toH = toByCusip.get(cusip)
      const fromShares = fromH?.adjustedShares ?? null
      const toShares = toH?.adjustedShares ?? null
      const fromValue = fromH?.rawValue ?? null
      const toValue = toH?.rawValue ?? null

      const changeType = calculateChangeBadge(toShares, fromShares)

      let deltaShares: number | null = null
      let deltaPercent: number | null = null

      if (fromShares !== null && toShares !== null) {
        deltaShares = toShares - fromShares
        if (fromShares > 0) {
          deltaPercent = ((toShares - fromShares) / fromShares) * 100
        }
      }

      // Use "to" quarter's companyName as authoritative
      const companyName = toH?.companyName ?? fromH?.companyName ?? 'UNKNOWN'

      // Warn if names diverge (data quality signal — not a hard error)
      if (fromH && toH && fromH.companyName !== toH.companyName) {
        console.warn(`[api/tracker] Company name differs for CUSIP ${cusip}: "${fromH.companyName}" vs "${toH.companyName}" — using "${toH.companyName}"`)
      }

      diffEntries.push({
        cusip,
        companyName,
        fromShares,
        toShares,
        fromValue,
        toValue,
        deltaShares,
        deltaPercent,
        changeType,
      })
    }

    // Group by changeType
    const grouped = {
      new: [] as DiffEntry[],
      exited: [] as DiffEntry[],
      increased: [] as DiffEntry[],
      decreased: [] as DiffEntry[],
      unchanged: [] as DiffEntry[],
    }

    for (const entry of diffEntries) {
      switch (entry.changeType) {
        case 'NEW': grouped.new.push(entry); break
        case 'EXITED': grouped.exited.push(entry); break
        case 'INCREASED': grouped.increased.push(entry); break
        case 'DECREASED': grouped.decreased.push(entry); break
        case 'UNCHANGED': grouped.unchanged.push(entry); break
      }
    }

    // Sort each group by absolute delta value (largest moves first)
    const sortByAbsDelta = (a: DiffEntry, b: DiffEntry) =>
      Math.abs(b.deltaShares ?? 0) - Math.abs(a.deltaShares ?? 0)

    grouped.new.sort((a, b) => (b.toValue ?? 0) - (a.toValue ?? 0))
    grouped.exited.sort((a, b) => (a.fromValue ?? 0) - (b.fromValue ?? 0))
    grouped.increased.sort(sortByAbsDelta)
    grouped.decreased.sort(sortByAbsDelta)
    grouped.unchanged.sort((a, b) => (b.toValue ?? 0) - (a.toValue ?? 0))

    // Summary stats
    const fromTotalValue = fromFiling.holdings.reduce((sum, h) => sum + Number(h.rawValue), 0)
    const toTotalValue = toFiling.holdings.reduce((sum, h) => sum + Number(h.rawValue), 0)
    const valueDelta = toTotalValue - fromTotalValue
    const valueDeltaPercent = fromTotalValue > 0 ? (valueDelta / fromTotalValue) * 100 : null

    return NextResponse.json({
      institution: { cik: institution.cik, name: institution.name },
      from: {
        quarter: fromQuarter,
        totalValue: fromTotalValue,
        holdings: fromFiling.holdings.map((h) => ({
          cusip: h.cusip,
          companyName: h.companyName,
          adjustedShares: h.adjustedShares,
          rawValue: Number(h.rawValue),
        })),
      },
      to: {
        quarter: toQuarter,
        totalValue: toTotalValue,
        holdings: toFiling.holdings.map((h) => ({
          cusip: h.cusip,
          companyName: h.companyName,
          adjustedShares: h.adjustedShares,
          rawValue: Number(h.rawValue),
        })),
      },
      diff: grouped,
      summary: {
        fromTotalValue,
        toTotalValue,
        valueDelta,
        valueDeltaPercent: valueDeltaPercent !== null ? Number(valueDeltaPercent.toFixed(2)) : null,
        newCount: grouped.new.length,
        exitedCount: grouped.exited.length,
        increasedCount: grouped.increased.length,
        decreasedCount: grouped.decreased.length,
        unchangedCount: grouped.unchanged.length,
      },
    })
  } catch (err) {
    console.error('[api/tracker] Error:', err)
    return NextResponse.json({ error: 'Failed to compute comparison' }, { status: 500 })
  }
}
