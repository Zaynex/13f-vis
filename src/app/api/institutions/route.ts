// GET /api/institutions
// Returns all tracked institutions (with optional search query)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { InstitutionSearchSchema } from '@/lib/schema'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = (await searchParams).get('q') ?? ''

  // Validate query param against schema
  const parsed = InstitutionSearchSchema.safeParse({ query })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query parameter' }, { status: 400 })
  }

  try {
    const institutions = await prisma.institution.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { cik: { contains: query } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      take: query ? 20 : 100,
      select: {
        cik: true,
        name: true,
      },
    })

    return NextResponse.json({ institutions })
  } catch (err) {
    console.error('[api/institutions] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
  }
}
