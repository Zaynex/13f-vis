'use client'

// Holdings Dashboard — per institution page
//
// Shows a single institution's current quarter holdings.
// URL: /institutions/[cik]
//
// Features:
// - Institution header with CIK and filing date
// - Holdings table with change badges
// - Quarter selector
// - Link to compare view

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { HoldingsTable } from '@/components/HoldingsTable'

interface Holding {
  cusip: string
  companyName: string
  adjustedShares: number
  rawValue: number
  changeType: string
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
          setQuarters([...new Set(d.filings.map((f: { quarter: string }) => f.quarter))].sort().reverse())
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
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent)]/90"
            >
              Compare
            </Link>
          </div>
        </div>

        {/* Filing info banner */}
        {data && (
          <FilingBanner filing={data.filing} priorQuarter={data.priorQuarter} />
        )}

        {/* Holdings table */}
        <div className="mt-6">
          <HoldingsTable
            holdings={data?.holdings ?? []}
            isLoading={isLoading}
          />
        </div>
      </div>
    </main>
  )
}
