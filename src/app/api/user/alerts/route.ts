// GET /api/user/alerts
// Returns fired alerts for the user's tracked institutions.
// Computes holdings changes vs prior quarter for each tracked fund.
// Fires when any holding changes by more than the alert's thresholdPct.
//
// POST /api/user/alerts
// Create or update an alert threshold for a tracked institution.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CreateAlertSchema } from '@/lib/schema'

// ─── GET: Compute and return fired alerts ─────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: (c) => c.forEach(({ name, value }) => request.cookies.set(name, value)) } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get all tracked institutions for this user
  const tracked = await prisma.userTrackedInstitution.findMany({
    where: { userId: user.id },
    include: {
      institution: {
        include: {
          filings: {
            orderBy: { quarter: 'desc' },
            take: 2,
            include: {
              holdings: {
                select: { cusip: true, companyName: true, changeType: true, changePercent: true },
              },
            },
          },
        },
      },
    },
  })

  const firedAlerts: Array<{
    institutionCik: string
    institutionName: string
    quarter: string
    holdings: Array<{ cusip: string; companyName: string; changeType: string; changePercent: number }>
  }> = []

  for (const track of tracked) {
    const inst = track.institution
    const filings = inst.filings

    if (filings.length < 2) continue // Need current + prior quarter

    const [current, prior] = filings

    // Filter to significant changes in current quarter
    const significant = current.holdings.filter((h) => {
      if (h.changeType === 'NEW' || h.changeType === 'EXITED') return true
      const pct = Number(h.changePercent)
      return pct > track.thresholdPct || pct < -track.thresholdPct
    })

    if (significant.length > 0) {
      firedAlerts.push({
        institutionCik: inst.cik,
        institutionName: inst.name,
        quarter: current.quarter,
        holdings: significant.map((h) => ({
          cusip: h.cusip,
          companyName: h.companyName,
          changeType: h.changeType,
          changePercent: Number(h.changePercent),
        })),
      })
    }
  }

  return NextResponse.json({ firedAlerts })
}

// ─── POST: Create or update alert threshold ───────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: (c) => c.forEach(({ name, value }) => request.cookies.set(name, value)) } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = CreateAlertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { institutionCik, thresholdPct } = parsed.data

  // Upsert alert threshold
  const alert = await prisma.userTrackedInstitution.upsert({
    where: { userId_institutionCik: { userId: user.id, institutionCik } },
    update: { thresholdPct },
    create: { userId: user.id, institutionCik, thresholdPct },
  })

  return NextResponse.json({ alert }, { status: 201 })
}
