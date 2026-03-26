'use client'

// Holdings Dashboard — per institution page
//
// Shows a single institution's current quarter holdings.
// URL: /institutions/[cik]
//
// Features:
// - Institution header with CIK and filing date
// - Concentration summary (total value, position count, top-10 concentration, largest position)
// - Holdings table with change badges and weight %
// - Quarter selector
// - Link to compare view

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { HoldingsTable } from '@/components/HoldingsTable'
import { HoldingsPieChart } from '@/components/HoldingsPieChart'
import type { ChangeType } from '@prisma/client'

interface Holding {
  cusip: string
  companyName: string
  adjustedShares: number
  rawValue: number
  weightPercent?: number | null
  changeType: ChangeType | 'UNCHANGED'
  changePercent: number | null
}

interface PageData {
  institution: { cik: string; name: string }
  filing: {
    quarter: string
    filedAt: string
    filingUrl: string
    holdingsFetchedAt: string | null
  } | null
  holdings: Holding[]
  priorQuarter: string | null
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatValue(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

function ConcentrationSummary({ holdings }: { holdings: Holding[] }) {
  if (holdings.length === 0) return null

  const totalValue = holdings.reduce((sum, h) => sum + h.rawValue, 0)
  if (totalValue === 0) return null

  const top10 = holdings.slice(0, 10)
  const top10Value = top10.reduce((sum, h) => sum + h.rawValue, 0)
  const top10Percent = (top10Value / totalValue) * 100

  return (
    <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <p className="text-xs text-[var(--muted-foreground)]">Portfolio value</p>
        <p className="mt-0.5 text-lg font-semibold">{formatValue(totalValue)}</p>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <p className="text-xs text-[var(--muted-foreground)]">Positions</p>
        <p className="mt-0.5 text-lg font-semibold">{holdings.length}</p>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <p className="text-xs text-[var(--muted-foreground)]">Top 10 concentration</p>
        <p className="mt-0.5 text-lg font-semibold">{top10Percent.toFixed(1)}%</p>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <p className="text-xs text-[var(--muted-foreground)]">Largest position</p>
        <p className="mt-0.5 truncate text-lg font-semibold" title={top10[0]?.companyName}>
          {top10[0]?.companyName ?? '—'}
        </p>
      </div>
    </div>
  )
}

function FilingBanner({ filing, priorQuarter }: { filing: PageData['filing']; priorQuarter: string | null }) {
  if (!filing) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
        <span className="font-medium text-amber-400">No filing loaded.</span>
        <span className="ml-2 text-[var(--muted-foreground)]">
          Run the pipeline to fetch data from SEC EDGAR.
        </span>
      </div>
    )
  }

  const filedDate = new Date(filing.filedAt)
  const now = new Date()
  const daysSince = Math.floor((now.getTime() - filedDate.getTime()) / (1000 * 60 * 60 * 24))

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
      <div className="flex items-center gap-4">
        <div>
          <span className="text-[var(--muted-foreground)]">Filing quarter:</span>{' '}
          <span className="font-medium">{filing.quarter}</span>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">Filed:</span>{' '}
          <span className="font-medium">{formatDate(filing.filedAt)}</span>
        </div>
        {priorQuarter && (
          <div>
            <span className="text-[var(--muted-foreground)]">Prior:</span>{' '}
            <span className="font-medium">{priorQuarter}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <span className="text-xs">
          {daysSince} days ago ·{' '}
          <a
            href={filing.filingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--foreground)]"
          >
            View on SEC EDGAR
          </a>
        </span>
      </div>
    </div>
  )
}

export default function InstitutionPage() {
  const router = useRouter()
  const params = useParams()
  const cik = params.cik as string

  const [data, setData] = useState<PageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null)
  const [quarters, setQuarters] = useState<string[]>([])

  const fetchHoldings = useCallback(
    async (quarter?: string) => {
      setIsLoading(true)
      try {
        const url = quarter
          ? `/api/institutions/${cik}/holdings?quarter=${quarter}`
          : `/api/institutions/${cik}/holdings`
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to fetch')
        const json: PageData = await res.json()
        // Compute weight percent from rawValue (portfolio %)
        const totalValue = (json.holdings ?? []).reduce((sum: number, h: Holding) => sum + h.rawValue, 0)
        if (totalValue > 0) {
          json.holdings = json.holdings.map((h: Holding) => ({
            ...h,
            weightPercent: (h.rawValue / totalValue) * 100,
          }))
        }
        setData(json)
        if (json.filing) {
          setSelectedQuarter(json.filing.quarter)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    },
    [cik],
  )

  useEffect(() => {
    fetchHoldings()
    // Fetch available quarters
    fetch(`/api/institutions/${cik}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.filings) {
          setQuarters([...new Set(d.filings.map((f: { quarter: string }) => f.quarter))].sort().reverse() as string[])
        }
      })
      .catch(() => {})
  }, [cik, fetchHoldings])

  if (!data && !isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center px-4 pt-24">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Institution not found</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">CIK: {cik}</p>
          <Link href="/" className="mt-4 text-[var(--accent)] underline">
            ← Back to search
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ← Search
          </Link>
          <div className="mt-2 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{data?.institution.name ?? 'Loading…'}</h1>
              <p className="mt-1 font-mono text-sm text-[var(--muted-foreground)]">
                CIK: {data?.institution.cik ?? cik}
              </p>
            </div>
            <Link
              href={`/compare?ciks=${cik}`}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--muted)]"
            >
              Compare
            </Link>
            <Link
              href={`/tracker/${cik}`}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent)]/90"
            >
              Track Changes
            </Link>
          </div>
        </div>

        {/* Quarter selector + Filing info banner */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[var(--muted-foreground)]">Quarter</label>
            <select
              value={selectedQuarter ?? ''}
              onChange={(e) => {
                const q = e.target.value
                setSelectedQuarter(q)
                fetchHoldings(q)
              }}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]/20"
            >
              {quarters.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>
          {data && (
            <FilingBanner filing={data.filing} priorQuarter={data.priorQuarter} />
          )}
        </div>

        {/* Holdings table */}
        <div className="mt-6">
          {!isLoading && data && (
            <ConcentrationSummary holdings={data.holdings} />
          )}
          {!isLoading && data && data.holdings.length > 0 && (
            <HoldingsPieChart holdings={data.holdings} />
          )}
          <HoldingsTable
            holdings={data?.holdings ?? []}
            isLoading={isLoading}
          />
        </div>
      </div>
    </main>
  )
}
