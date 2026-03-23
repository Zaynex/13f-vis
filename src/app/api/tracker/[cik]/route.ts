// GET /api/tracker/[cik]?from=2025-Q3&to=2025-Q4
//     OR
// GET /api/tracker/[cik]?quarters=2025-Q1,2025-Q2,2025-Q3,2025-Q4
//
// Quarter-over-quarter comparison for a single institution.
// Fetches two quarters' filings and computes the diff at query time
// (not pre-computed — works for any two quarters, consecutive or not).
//
// Dynamic fetch: if a quarter is missing from the DB, automatically fetch it
// from SEC EDGAR and store it. Set fetchIfMissing=false to disable.
//
// When "quarters" param is provided, returns multi-quarter trend data:
// {
//   institution: { cik, name }
//   quarters: ["2025-Q1", "2025-Q2", ...]
//   holdings: [{ cusip, companyName, values: [{ quarter, adjustedShares, rawValue }] }]
// }
//
// When "from" and "to" are provided (legacy), returns two-quarter diff.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TrackerQuerySchema } from '@/lib/schema'
import { calculateChangeBadge, ChangeBadge } from '@/lib/schema'
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
  const quartersParam = searchParams.get('quarters')
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const fetchIfMissing = searchParams.get('fetchIfMissing') !== 'false'

  const { cik } = await params

  // Multi-quarter mode: ?quarters=2025-Q1,2025-Q2,2025-Q3
  if (quartersParam) {
    const quarters = quartersParam.split(',').map((q) => q.trim()).filter(Boolean)

    // Validate all quarter formats
    for (const q of quarters) {
      if (!isValidQuarter(q)) {
        return NextResponse.json(
          { error: `Invalid quarter format: '${q}'. Expected YYYY-QN (e.g. 2025-Q4)` },
          { status: 400 },
        )
      }
    }

    if (quarters.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 quarters required for multi-quarter comparison' },
        { status: 400 },
      )
    }

    try {
      const institution = await prisma.institution.findUnique({ where: { cik } })
      if (!institution) {
        return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
      }

      // Fetch all filings in parallel
      const filings = await prisma.filing.findMany({
        where: { institutionCik: cik, quarter: { in: quarters } },
        include: { holdings: true },
        orderBy: { quarter: 'asc' },
      })

      const missing = quarters.filter((q) => !filings.some((f) => f.quarter === q))

      if (missing.length > 0 && fetchIfMissing) {
        // Dynamically fetch missing quarters in parallel
        const fetchErrors: Error[] = []
        await Promise.all(
          missing.map(async (q) => {
            try {
              await dynamicFetch(cik, q)
            } catch (err) {
              fetchErrors.push(err instanceof Error ? err : new Error(String(err)))
            }
          }),
        )

        // If any fetch failed with NotFoundError, return 404 with available quarters
        const notFoundErrors = fetchErrors.filter((e) => e instanceof NotFoundError)
        if (notFoundErrors.length > 0) {
          const available = await getAvailableQuartersForCik(cik)
          return NextResponse.json(
            {
              error: `No 13F filing found for ${missing.join(', ')} on SEC EDGAR`,
              availableQuarters: available,
            },
            { status: 404 },
          )
        }

        // If other errors occurred, return 500
        if (fetchErrors.length > 0) {
          console.error('[api/tracker] Dynamic fetch failed for quarters:', missing, fetchErrors)
          return NextResponse.json(
            { error: 'Failed to fetch some quarters from SEC EDGAR. Try again later.' },
            { status: 500 },
          )
        }

        // Re-query DB after fetch
        const refetched = await prisma.filing.findMany({
          where: { institutionCik: cik, quarter: { in: quarters } },
          include: { holdings: true },
          orderBy: { quarter: 'asc' },
        })

        const response = buildMultiQuarterResponse(institution, refetched, quarters)
        return NextResponse.json({ ...response, _fetched: true })
      }

      if (missing.length > 0) {
        // fetchIfMissing=false — just report missing
        const available = await getAvailableQuartersForCik(cik)
        return NextResponse.json(
          { error: `Missing data for quarters: ${missing.join(', ')}`, availableQuarters: available },
          { status: 404 },
        )
      }

      return NextResponse.json(buildMultiQuarterResponse(institution, filings, quarters))
    } catch (err) {
      console.error('[api/tracker] Multi-quarter error:', err)
      return NextResponse.json({ error: 'Failed to fetch multi-quarter data' }, { status: 500 })
    }
  }

  // Legacy two-quarter mode
  const parsed = TrackerQuerySchema.safeParse({ cik, from, to })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.format() },
      { status: 400 },
    )
  }

  const { from: fromQuarter, to: toQuarter } = parsed.data

  // Validate quarter formats
  if (!isValidQuarter(fromQuarter) || !isValidQuarter(toQuarter)) {
    const invalid = [!isValidQuarter(fromQuarter) ? fromQuarter : null, !isValidQuarter(toQuarter) ? toQuarter : null].filter(Boolean)
    return NextResponse.json(
      { error: `Invalid quarter format: ${invalid.join(', ')}. Expected YYYY-QN (e.g. 2025-Q4)` },
      { status: 400 },
    )
  }

  try {
    const institution = await prisma.institution.findUnique({ where: { cik } })
    if (!institution) {
      return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
    }

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

    const missing: string[] = []
    if (!fromFiling) missing.push(fromQuarter)
    if (!toFiling) missing.push(toQuarter)

    let _fetched = false

    if (missing.length > 0 && fetchIfMissing) {
      // Fetch missing quarters in parallel
      const fetchErrors: Error[] = []
      await Promise.all(
        missing.map(async (q) => {
          try {
            await dynamicFetch(cik, q)
          } catch (err) {
            fetchErrors.push(err instanceof Error ? err : new Error(String(err)))
          }
        }),
      )

      const notFoundErrors = fetchErrors.filter((e) => e instanceof NotFoundError)
      if (notFoundErrors.length > 0) {
        const available = await getAvailableQuartersForCik(cik)
        return NextResponse.json(
          {
            error: `No 13F filing found for ${missing.join(', ')} on SEC EDGAR`,
            availableQuarters: available,
          },
          { status: 404 },
        )
      }

      if (fetchErrors.length > 0) {
        console.error('[api/tracker] Dynamic fetch failed for quarters:', missing, fetchErrors)
        return NextResponse.json(
          { error: 'Failed to fetch some quarters from SEC EDGAR. Try again later.' },
          { status: 500 },
        )
      }

      // Re-query after fetch
      const [refetchedFrom, refetchedTo] = await Promise.all([
        prisma.filing.findUnique({
          where: { institutionCik_quarter: { institutionCik: cik, quarter: fromQuarter } },
          include: { holdings: true },
        }),
        prisma.filing.findUnique({
          where: { institutionCik_quarter: { institutionCik: cik, quarter: toQuarter } },
          include: { holdings: true },
        }),
      ])

      const response = buildTwoQuarterResponse(institution, refetchedFrom!, refetchedTo!, fromQuarter, toQuarter)
      return NextResponse.json({ ...response, _fetched: true })
    }

    if (!fromFiling) {
      const available = await getAvailableQuartersForCik(cik)
      return NextResponse.json(
        { error: `No holdings data found for ${fromQuarter}`, availableQuarters: available },
        { status: 404 },
      )
    }
    if (!toFiling) {
      const available = await getAvailableQuartersForCik(cik)
      return NextResponse.json(
        { error: `No holdings data found for ${toQuarter}`, availableQuarters: available },
        { status: 404 },
      )
    }

    return NextResponse.json(buildTwoQuarterResponse(institution, fromFiling, toFiling, fromQuarter, toQuarter))
  } catch (err) {
    console.error('[api/tracker] Error:', err)
    return NextResponse.json({ error: 'Failed to compute comparison' }, { status: 500 })
  }
}

function buildMultiQuarterResponse(
  institution: { cik: string; name: string },
  filings: Array<{ quarter: string; holdings: Array<{ cusip: string; companyName: string; adjustedShares: bigint | number; rawValue: bigint | number }> }>,
  quarters: string[],
) {
  // Build per-quarter CUSIP maps
  const byQuarter = new Map<string, Map<string, { companyName: string; adjustedShares: number; rawValue: number }>>()
  for (const filing of filings) {
    const map = new Map(
      filing.holdings.map((h) => [
        h.cusip,
        { companyName: h.companyName, adjustedShares: Number(h.adjustedShares), rawValue: Number(h.rawValue) },
      ]),
    )
    byQuarter.set(filing.quarter, map)
  }

  // Union of all CUSIPs across quarters
  const allCusips = new Set<string>()
  for (const map of byQuarter.values()) {
    for (const cusip of map.keys()) allCusips.add(cusip)
  }

  // Build holdings rows
  const holdings = Array.from(allCusips)
    .map((cusip) => {
      const values = quarters.map((q) => {
        const h = byQuarter.get(q)?.get(cusip)
        return {
          quarter: q,
          adjustedShares: h ? h.adjustedShares : null,
          rawValue: h?.rawValue ?? null,
        }
      })

      // Company name: first quarter that has this CUSIP
      let firstName = 'UNKNOWN'
      for (const q of quarters) {
        const h = byQuarter.get(q)?.get(cusip)
        if (h) { firstName = h.companyName; break }
      }

      return { cusip, companyName: firstName, values }
    })
    .sort((a, b) => {
      const totalValue = (row: typeof a) =>
        row.values.reduce((sum, v) => sum + (v.rawValue ?? 0), 0)
      return totalValue(b) - totalValue(a)
    })

  return {
    institution: { cik: institution.cik, name: institution.name },
    quarters,
    holdings,
  }
}

function buildTwoQuarterResponse(
  institution: { cik: string; name: string },
  fromFiling: { holdings: Array<{ cusip: string; companyName: string; adjustedShares: bigint | number; rawValue: bigint | number }> },
  toFiling: { holdings: Array<{ cusip: string; companyName: string; adjustedShares: bigint | number; rawValue: bigint | number }> },
  fromQuarter: string,
  toQuarter: string,
) {
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

  type DiffEntry = {
    cusip: string; companyName: string
    fromShares: number | null; toShares: number | null
    fromValue: number | null; toValue: number | null
    deltaShares: number | null; deltaPercent: number | null
    changeType: ChangeBadge
  }

  const allCusips = new Set([...fromByCusip.keys(), ...toByCusip.keys()])
  const diffEntries: DiffEntry[] = []

  for (const cusip of allCusips) {
    const fromH = fromByCusip.get(cusip)
    const toH = toByCusip.get(cusip)
    const fromShares = fromH ? Number(fromH.adjustedShares) : null
    const toShares = toH ? Number(toH.adjustedShares) : null
    const fromValue = fromH?.rawValue ?? null
    const toValue = toH?.rawValue ?? null
    const changeType = calculateChangeBadge(toShares, fromShares)
    let deltaShares: number | null = null
    let deltaPercent: number | null = null
    if (fromShares !== null && toShares !== null) {
      deltaShares = toShares - fromShares
      if (fromShares > 0) deltaPercent = ((toShares - fromShares) / fromShares) * 100
    }
    const companyName = toH?.companyName ?? fromH?.companyName ?? 'UNKNOWN'
    diffEntries.push({ cusip, companyName, fromShares, toShares, fromValue, toValue, deltaShares, deltaPercent, changeType })
  }

  const grouped = { new: [] as DiffEntry[], exited: [] as DiffEntry[], increased: [] as DiffEntry[], decreased: [] as DiffEntry[], unchanged: [] as DiffEntry[] }
  for (const entry of diffEntries) {
    switch (entry.changeType) {
      case 'NEW': grouped.new.push(entry); break
      case 'EXITED': grouped.exited.push(entry); break
      case 'INCREASED': grouped.increased.push(entry); break
      case 'DECREASED': grouped.decreased.push(entry); break
      case 'UNCHANGED': grouped.unchanged.push(entry); break
    }
  }

  const sortByAbsDelta = (a: DiffEntry, b: DiffEntry) => Math.abs(b.deltaShares ?? 0) - Math.abs(a.deltaShares ?? 0)
  grouped.new.sort((a, b) => (b.toValue ?? 0) - (a.toValue ?? 0))
  grouped.exited.sort((a, b) => (a.fromValue ?? 0) - (b.fromValue ?? 0))
  grouped.increased.sort(sortByAbsDelta)
  grouped.decreased.sort(sortByAbsDelta)
  grouped.unchanged.sort((a, b) => (b.toValue ?? 0) - (a.toValue ?? 0))

  const fromTotalValue = fromFiling.holdings.reduce((sum, h) => sum + Number(h.rawValue), 0)
  const toTotalValue = toFiling.holdings.reduce((sum, h) => sum + Number(h.rawValue), 0)
  const valueDelta = toTotalValue - fromTotalValue
  const valueDeltaPercent = fromTotalValue > 0 ? (valueDelta / fromTotalValue) * 100 : null

  return {
    institution: { cik: institution.cik, name: institution.name },
    from: { quarter: fromQuarter, totalValue: fromTotalValue, holdings: fromFiling.holdings.map((h) => ({ cusip: h.cusip, companyName: h.companyName, adjustedShares: Number(h.adjustedShares), rawValue: Number(h.rawValue) })) },
    to: { quarter: toQuarter, totalValue: toTotalValue, holdings: toFiling.holdings.map((h) => ({ cusip: h.cusip, companyName: h.companyName, adjustedShares: Number(h.adjustedShares), rawValue: Number(h.rawValue) })) },
    diff: grouped,
    summary: { fromTotalValue, toTotalValue, valueDelta, valueDeltaPercent: valueDeltaPercent !== null ? Number(valueDeltaPercent.toFixed(2)) : null, newCount: grouped.new.length, exitedCount: grouped.exited.length, increasedCount: grouped.increased.length, decreasedCount: grouped.decreased.length, unchangedCount: grouped.unchanged.length },
  }
}
