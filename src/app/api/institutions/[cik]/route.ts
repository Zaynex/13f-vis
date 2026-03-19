// GET /api/institutions/[cik]
// Returns institution details including list of available quarters

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: { cik: string } },
) {
  const cik = params.cik

  try {
    const institution = await prisma.institution.findUnique({
      where: { cik },
      include: {
        filings: {
          where: { holdingsFetchedAt: { not: null } },
          orderBy: { filedAt: 'desc' },
          select: {
            quarter: true,
            filedAt: true,
            _count: { select: { holdings: true } },
          },
        },
      },
    })

    if (!institution) {
      return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
    }

    return NextResponse.json({
      institution: {
        cik: institution.cik,
        name: institution.name,
      },
      filings: institution.filings.map((f) => ({
        quarter: f.quarter,
        filedAt: f.filedAt,
        holdingsCount: f._count.holdings,
      })),
    })
  } catch (err) {
    console.error(`[api/institutions/${cik}] Error:`, err)
    return NextResponse.json({ error: 'Failed to fetch institution' }, { status: 500 })
  }
}
