// GET /api/compare
// Query params:
//   ciks (required) — comma-separated CIKs, 2-5 funds
//   quarter (optional) — defaults to most recent common quarter

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ComparisonSchema } from '@/lib/schema'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ciksParam = searchParams.get('ciks') ?? ''
  const quarter = searchParams.get('quarter') ?? undefined

  // Validate input
  const ciks = ciksParam.split(',').map((c) => c.trim()).filter(Boolean)
  const parsed = ComparisonSchema.safeParse({ ciks, quarter })

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid parameters', details: parsed.error.format() }, { status: 400 })
  }

  try {
    // Fetch institutions
    const institutions = await prisma.institution.findMany({
      where: { cik: { in: parsed.data.ciks } },
      orderBy: { name: 'asc' },
    })

    if (institutions.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 valid institutions' }, { status: 400 })
    }

    // Find the target quarter (most recent quarter with data for ALL selected institutions)
    let targetQuarter = quarter

    if (!targetQuarter) {
      // Find common quarters across all institutions
      const allFilings = await prisma.filing.findMany({
        where: {
          institutionCik: { in: parsed.data.ciks },
          holdingsFetchedAt: { not: null },
        },
        select: { institutionCik: true, quarter: true, filedAt: true },
        orderBy: { filedAt: 'desc' },
      })

      const quarterCounts = new Map<string, number>()
      for (const f of allFilings) {
        quarterCounts.set(f.quarter, (quarterCounts.get(f.quarter) ?? 0) + 1)
      }

      // Find the most recent quarter that all selected institutions have
      const sortedQuarters = [...quarterCounts.entries()]
        .filter(([, count]) => count === parsed.data.ciks.length)
        .sort(([a], [b]) => b.localeCompare(a)) // descending

      if (sortedQuarters.length === 0) {
        return NextResponse.json({
          error: 'No common quarter found for selected institutions',
        }, { status: 404 })
      }

      targetQuarter = sortedQuarters[0][0]
    }

    // Fetch holdings for each institution in the target quarter
    const holdingsByCik = new Map<string, Map<string, { companyName: string; adjustedShares: number; rawValue: number }>>()

    for (const cik of parsed.data.ciks) {
      const filing = await prisma.filing.findUnique({
        where: { institutionCik_quarter: { institutionCik: cik, quarter: targetQuarter! } },
        include: { holdings: true },
      })

      if (!filing) continue

      const byCusip = new Map(
        filing.holdings.map((h) => [
          h.cusip,
          { companyName: h.companyName, adjustedShares: h.adjustedShares, rawValue: Number(h.rawValue) },
        ]),
      )
      holdingsByCik.set(cik, byCusip)
    }

    // Compute overlap and unique sets
    // All CUSIPs across all funds
    const allCusips = new Set<string>()
    for (const byCusip of holdingsByCik.values()) {
      for (const cusip of byCusip.keys()) {
        allCusips.add(cusip)
      }
    }

    // Overlapping: present in ALL selected funds
    const overlapping: Array<{
      cusip: string
      companyName: string
      funds: string[]
      totalValue: number
    }> = []

    for (const cusip of allCusips) {
      const fundsHolding: string[] = []
      let totalValue = 0

      for (const inst of institutions) {
        const byCusip = holdingsByCik.get(inst.cik)
        if (byCusip?.has(cusip)) {
          const h = byCusip.get(cusip)!
          fundsHolding.push(inst.cik)
          totalValue += h.rawValue
        }
      }

      if (fundsHolding.length >= 2) {
        // Get company name from the first fund that has it
        let companyName = 'UNKNOWN'
        for (const inst of institutions) {
          const byCusip = holdingsByCik.get(inst.cik)
          if (byCusip?.has(cusip)) {
            companyName = byCusip.get(cusip)!.companyName
            break
          }
        }

        overlapping.push({ cusip, companyName, funds: fundsHolding, totalValue })
      }
    }

    // Sort overlapping by total value
    overlapping.sort((a, b) => b.totalValue - a.totalValue)

    // Unique per fund: present in only that fund
    const uniqueByFund = new Map<string, Array<{ cusip: string; companyName: string; rawValue: number }>>()
    for (const inst of institutions) {
      const byCusip = holdingsByCik.get(inst.cik)
      if (!byCusip) continue

      const unique: Array<{ cusip: string; companyName: string; rawValue: number }> = []
      for (const [cusip, h] of byCusip.entries()) {
        // Only unique to this fund (not held by any other selected fund)
        const heldByOthers = [...holdingsByCik.entries()]
          .filter(([cik]) => cik !== inst.cik)
          .some(([, m]) => m.has(cusip))

        if (!heldByOthers) {
          unique.push({ cusip, companyName: h.companyName, rawValue: h.rawValue })
        }
      }
      unique.sort((a, b) => b.rawValue - a.rawValue)
      uniqueByFund.set(inst.cik, unique)
    }

    return NextResponse.json({
      quarter: targetQuarter,
      institutions: institutions.map((i) => ({
        cik: i.cik,
        name: i.name,
        holdingCount: holdingsByCik.get(i.cik)?.size ?? 0,
      })),
      overlapping,
      uniqueByFund: Object.fromEntries(
        [...uniqueByFund.entries()].map(([cik, holdings]) => [cik, holdings]),
      ),
    })
  } catch (err) {
    console.error('[api/compare] Error:', err)
    return NextResponse.json({ error: 'Failed to compute comparison' }, { status: 500 })
  }
}
