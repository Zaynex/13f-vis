import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function createServerSupabaseClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
}

// ─── GET: Return tracked institutions with enriched institution + latest filing data ─────

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient(request)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use Prisma to join tracked institutions with their latest filing.
  // Compute totalValue from holdings to eliminate the N parallel /api/tracker calls.
  const tracked = await prisma.userTrackedInstitution.findMany({
    where: { userId: user.id },
    include: {
      institution: {
        include: {
          filings: {
            orderBy: { quarter: 'desc' },
            take: 1,
            include: {
              holdings: { select: { rawValue: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const result = tracked.map((t) => {
    const latestFiling = t.institution.filings[0]
    const totalValue = latestFiling?.holdings.reduce((sum, h) => {
      // rawValue is Decimal in Prisma, convert to number
      return sum + Number(h.rawValue)
    }, 0) ?? 0
    return {
      institutionCik: t.institutionCik,
      createdAt: t.createdAt,
      thresholdPct: t.thresholdPct,
      institutionName: t.institution.name,
      quarter: latestFiling?.quarter ?? null,
      totalValue,
      holdingsCount: latestFiling?.holdings.length ?? 0,
    }
  })

  return NextResponse.json({ tracked: result })
}

// ─── POST: Track (or update threshold for) an institution ─────────────────────
// Uses Prisma to unify with the alerts route — both write to the same table.

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient(request)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { cik, thresholdPct } = await request.json()

  // Validate CIK format: exactly 10 digits
  if (!cik || !/^\d{10}$/.test(cik)) {
    return NextResponse.json({ error: 'Invalid CIK: must be exactly 10 digits' }, { status: 400 })
  }

  // Upsert: create or update threshold. Default thresholdPct to 25 if not provided.
  try {
    const tracked = await prisma.userTrackedInstitution.upsert({
      where: {
        userId_institutionCik: { userId: user.id, institutionCik: cik },
      },
      update: {
        // Only update thresholdPct if explicitly provided
        ...(thresholdPct !== undefined && { thresholdPct }),
      },
      create: {
        userId: user.id,
        institutionCik: cik,
        thresholdPct: thresholdPct ?? 25,
      },
    })
    return NextResponse.json({ tracked }, { status: 201 })
  } catch (err) {
    // Prisma P2002 = unique constraint violation (shouldn't happen with upsert, but guard)
    return NextResponse.json({ error: 'Failed to track institution' }, { status: 500 })
  }
}

// ─── DELETE: Untrack an institution ──────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient(request)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cik = request.nextUrl?.searchParams.get('cik') ?? ''

  if (!cik || !/^\d{10}$/.test(cik)) {
    return NextResponse.json({ error: 'Invalid CIK: must be exactly 10 digits' }, { status: 400 })
  }

  try {
    await prisma.userTrackedInstitution.deleteMany({
      where: { userId: user.id, institutionCik: cik },
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to untrack institution' }, { status: 500 })
  }
}
