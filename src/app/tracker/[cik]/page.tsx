'use client'

// Tracker Page — Quarter-over-quarter holdings comparison
//
// URL: /tracker/[cik]?from=2025-Q3&to=2025-Q4
//
// Shows:
// 1. Institution header
// 2. Quarter selectors ("from" and "to")
// 3. Summary stats (total value change, position counts)
// 4. Holdings diff grouped by change type (NEW/EXITED/INCREASED/DECREASED/UNCHANGED)

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChangeBadge } from '@/components/ChangeBadge'

interface DiffEntry {
  cusip: string
  companyName: string
  fromShares: number | null
  toShares: number | null
  fromValue: number | null
  toValue: number | null
  deltaShares: number | null
  deltaPercent: number | null
  changeType: 'NEW' | 'EXITED' | 'INCREASED' | 'DECREASED' | 'UNCHANGED'
}

interface TrackerData {
  institution: { cik: string; name: string }
  from: { quarter: string; totalValue: number; holdings: Array<{ cusip: string; companyName: string; adjustedShares: number; rawValue: number }> }
  to: { quarter: string; totalValue: number; holdings: Array<{ cusip: string; companyName: string; adjustedShares: number; rawValue: number }> }
  diff: {
    new: DiffEntry[]
    exited: DiffEntry[]
    increased: DiffEntry[]
    decreased: DiffEntry[]
    unchanged: DiffEntry[]
  }
  summary: {
    fromTotalValue: number
    toTotalValue: number
    valueDelta: number
    valueDeltaPercent: number | null
    newCount: number
    exitedCount: number
    increasedCount: number
    decreasedCount: number
    unchangedCount: number
  }
}

function formatValue(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

function formatShares(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString()
}

function DeltaCell({ entry }: { entry: DiffEntry }) {
  if (entry.changeType === 'NEW') {
    return (
      <span className="text-green-500 font-medium">
        +{formatShares(entry.toShares)} ({formatValue(entry.toValue ?? 0)})
      </span>
    )
  }
  if (entry.changeType === 'EXITED') {
    return (
      <span className="text-red-500 font-medium">
        {formatShares(entry.fromShares)} ({formatValue(entry.fromValue ?? 0)})
      </span>
    )
  }
  if (entry.deltaShares === null) return <span>—</span>
  const sign = entry.deltaShares > 0 ? '+' : ''
  const color = entry.deltaShares > 0 ? 'text-green-500' : entry.deltaShares < 0 ? 'text-red-500' : 'text-[var(--muted-foreground)]'
  return (
    <span className={`font-medium tabular-nums ${color}`}>
      {sign}{formatShares(entry.deltaShares)}
      {entry.deltaPercent !== null && (
        <span className="ml-1 text-xs">({sign}{entry.deltaPercent.toFixed(1)}%)</span>
      )}
    </span>
  )
}

function DiffTable({ entries, title, empty }: { entries: DiffEntry[]; title: string; empty: string }) {
  if (entries.length === 0) return null
  return (
    <section>
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        {title}
        <span className="text-xs font-normal text-[var(--muted-foreground)] bg-[var(--muted)] px-1.5 py-0.5 rounded">
          {entries.length}
        </span>
      </h3>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Company</th>
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">CUSIP</th>
              <th className="px-3 py-2 text-right font-medium text-[var(--muted-foreground)]">From</th>
              <th className="px-3 py-2 text-right font-medium text-[var(--muted-foreground)]">To</th>
              <th className="pl-3 pr-4 py-2 text-right font-medium text-[var(--muted-foreground)]">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {entries.map((e) => (
              <tr key={e.cusip} className="hover:bg-[var(--muted)]/50">
                <td className="px-4 py-2.5 font-medium">{e.companyName}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-[var(--muted-foreground)]">{e.cusip}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--muted-foreground)]">
                  {e.changeType === 'NEW' ? '—' : formatShares(e.fromShares)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--muted-foreground)]">
                  {e.changeType === 'EXITED' ? '—' : formatShares(e.toShares)}
                </td>
                <td className="pl-3 pr-4 py-2.5 text-right">
                  <DeltaCell entry={e} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SummaryBar({ data, from, to }: { data: TrackerData['summary']; from: string; to: string }) {
  const deltaSign = data.valueDelta >= 0 ? '+' : ''
  const deltaColor = data.valueDelta >= 0 ? 'text-green-500' : 'text-red-500'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="text-xs text-[var(--muted-foreground)] mb-1">{from}</div>
        <div className="text-lg font-semibold tabular-nums">{formatValue(data.fromTotalValue)}</div>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="text-xs text-[var(--muted-foreground)] mb-1">{to}</div>
        <div className="text-lg font-semibold tabular-nums">{formatValue(data.toTotalValue)}</div>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="text-xs text-[var(--muted-foreground)] mb-1">Change</div>
        <div className={`text-lg font-semibold tabular-nums ${deltaColor}`}>
          {deltaSign}{formatValue(data.valueDelta)}
          {data.valueDeltaPercent !== null && (
            <span className="text-xs ml-1">({deltaSign}{data.valueDeltaPercent}%)</span>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="text-xs text-[var(--muted-foreground)] mb-1">Positions</div>
        <div className="text-xs mt-1 space-y-0.5">
          {data.newCount > 0 && <div className="text-green-500">+{data.newCount} new</div>}
          {data.exitedCount > 0 && <div className="text-red-500">-{data.exitedCount} exited</div>}
          {data.increasedCount > 0 && <div className="text-green-500/80">▲ {data.increasedCount}</div>}
          {data.decreasedCount > 0 && <div className="text-red-500/80">▼ {data.decreasedCount}</div>}
        </div>
      </div>
    </div>
  )
}

export default function TrackerPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-8">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
            </div>
          </div>
        </main>
      }
    >
      <TrackerPageContent />
    </Suspense>
  )
}

function TrackerPageContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const cik = params.cik as string

  const [availableQuarters, setAvailableQuarters] = useState<string[]>([])
  const [from, setFrom] = useState(searchParams.get('from') ?? '')
  const [to, setTo] = useState(searchParams.get('to') ?? '')
  const [data, setData] = useState<TrackerData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load available quarters from institution API
  useEffect(() => {
    fetch(`/api/institutions/${cik}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.filings) {
          const quarters = [...new Set(d.filings.map((f: { quarter: string }) => f.quarter))].sort().reverse() as string[]
          setAvailableQuarters(quarters)
          // Default: to = most recent, from = second most recent
          if (!to && quarters.length >= 1) {
            setTo(quarters[0])
          }
          if (!from && quarters.length >= 2) {
            setFrom(quarters[1])
          } else if (!from && quarters.length === 1) {
            setFrom(quarters[0])
          }
        }
      })
      .catch(() => {})
  }, [cik])

  const fetchComparison = useCallback(async (fromQ: string, toQ: string) => {
    if (!fromQ || !toQ) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tracker/${cik}?from=${fromQ}&to=${toQ}`)
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Failed to fetch')
      }
      const json: TrackerData = await res.json()
      setData(json)
      const params = new URLSearchParams()
      params.set('from', fromQ)
      params.set('to', toQ)
      router.replace(`/tracker/${cik}?${params.toString()}`, { scroll: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [cik, router])

  // Fetch when quarters change
  useEffect(() => {
    if (from && to) {
      fetchComparison(from, to)
    }
  }, [from, to, fetchComparison])

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <Link href={`/institutions/${cik}`} className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ← {data?.institution.name ?? 'Institution'}
          </Link>
          <h1 className="text-2xl font-bold mt-2">Holdings Tracker</h1>
          {data && (
            <p className="mt-1 text-[var(--muted-foreground)]">
              Comparing {from} → {to}
            </p>
          )}
        </div>

        {/* Quarter selectors */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">From quarter</label>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]/20"
            >
              {availableQuarters.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1">To quarter</label>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]/20"
            >
              {availableQuarters.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Link
              href={`/institutions/${cik}`}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Single quarter →
            </Link>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 mb-6">
            {error}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          </div>
        )}

        {/* Data */}
        {!isLoading && data && (
          <>
            <SummaryBar data={data.summary} from={from} to={to} />

            <div className="space-y-8">
              <DiffTable
                entries={data.diff.new}
                title="🟢 New Positions"
                empty="No new positions"
              />
              <DiffTable
                entries={data.diff.exited}
                title="🔴 Exited Positions"
                empty="No exited positions"
              />
              <DiffTable
                entries={data.diff.increased}
                title="📈 Increased"
                empty="No increased positions"
              />
              <DiffTable
                entries={data.diff.decreased}
                title="📉 Decreased"
                empty="No decreased positions"
              />
              <DiffTable
                entries={data.diff.unchanged}
                title="➖ Unchanged"
                empty="No unchanged positions"
              />
            </div>

            {data.diff.new.length === 0 &&
              data.diff.exited.length === 0 &&
              data.diff.increased.length === 0 &&
              data.diff.decreased.length === 0 &&
              data.diff.unchanged.length === 0 && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] py-12 text-center text-[var(--muted-foreground)]">
                  No holdings data available for this comparison.
                </div>
              )}
          </>
        )}
      </div>
    </main>
  )
}
