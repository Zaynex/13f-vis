// POST /api/institutions/request
// Request tracking of a new institutional investor by CIK

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CikRequestSchema } from '@/lib/schema'

export async function POST(request: Request) {
  // Check auth — require login
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CikRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { cik, name, notes } = parsed.data

  // Check if already tracked
  const existing = await prisma.institution.findUnique({ where: { cik } })
  if (existing) {
    return NextResponse.json(
      { error: 'CIK already tracked', institution: { cik: existing.cik, name: existing.name } },
      { status: 409 },
    )
  }

  // Check if already pending
  const pending = await prisma.requestedInstitution.findUnique({ where: { cik } })
  if (pending) {
    return NextResponse.json(
      { error: 'CIK already requested', status: pending.status },
      { status: 409 },
    )
  }

  // Create the request
  const req = await prisma.requestedInstitution.create({
    data: {
      cik,
      name,
      notes: notes ?? null,
      status: 'PENDING',
    },
  })

  return NextResponse.json({ request: req }, { status: 201 })
}

// GET /api/institutions/request
// List pending requests (admin only — in production, add role check)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = (await searchParams.get('status')) ?? 'PENDING'

  const requests = await prisma.requestedInstitution.findMany({
    where: { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' },
    orderBy: { requestedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ requests })
}
