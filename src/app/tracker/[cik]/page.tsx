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
import { InfoTooltip } from '@/components/InfoTooltip'
import { HoldingsTable } from '@/components/HoldingsTable'
import type { HoldingRow } from '@/components/HoldingsTable'

const GLOSSARY = {
  cusip: 'CUSIP (Committee on Uniform Security Identification Procedures) — A 9-character unique identifier for each security.',
  from: 'Prior quarter (the starting point of comparison).',
  to: 'Current quarter (the end point of comparison).',
  change: 'Quarter-over-quarter change: ▲ = increased >1%, ▼ = decreased >1%, ★ = new, ✕ = exited.',
}

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

interface MultiTrackerData {
  institution: { cik: string; name: string }
  quarters: string[]
  holdings: Array<{
    cusip: string
    companyName: string
    values: Array<{ quarter: string; adjustedShares: number | null; rawValue: number | null }>
  }>
}

interface SingleHoldingsData {
  institution: { cik: string; name: string }
  filing: { quarter: string; filedAt: string; filingUrl: string | null; holdingsFetchedAt: string | null } | null
  holdings: HoldingRow[]
  priorQuarter: string | null
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
              <th className="px-3 py-2 text-left font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.cusip}>CUSIP</InfoTooltip>
              </th>
              <th className="px-3 py-2 text-right font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.from}>From</InfoTooltip>
              </th>
              <th className="px-3 py-2 text-right font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.to}>To</InfoTooltip>
              </th>
              <th className="pl-3 pr-4 py-2 text-right font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.change}>Change</InfoTooltip>
              </th>
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

function MultiTrendTable({ data }: { data: MultiTrackerData }) {
  const { quarters, holdings } = data
  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] py-12 text-center text-[var(--muted-foreground)]">
        No holdings data available.
      </div>
    )
  }

  // Determine column count — cap visible quarters at 6 for readability
  const visibleQuarters = quarters.slice(0, 6)

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
            <th className="px-4 py-2.5 text-left font-medium text-[var(--muted-foreground)] sticky left-0 bg-[var(--muted)] z-10">Company</th>
            <th className="px-3 py-2.5 text-left font-medium text-[var(--muted-foreground)]">
              <InfoTooltip term={GLOSSARY.cusip}>CUSIP</InfoTooltip>
            </th>
            {visibleQuarters.map((q) => (
              <th key={q} className="px-3 py-2.5 text-right font-medium text-[var(--muted-foreground)]">{q}</th>
            ))}
            {quarters.length > 6 && (
              <th className="px-3 py-2.5 text-right font-medium text-[var(--muted-foreground)]">...</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {holdings.map((h) => {
            // visibleQuarters and h.values are both reverse chronological (newest first).
            const vals = h.values.filter((v) => visibleQuarters.includes(v.quarter))

            // NEW: oldest visible quarter has no data, newest does
            // EXITED: newest has no data, oldest does
            const oldestQ = visibleQuarters[visibleQuarters.length - 1]
            const newestQ = visibleQuarters[0]
            const oldestVal = vals[vals.length - 1]
            const newestVal = vals[0]

            let trend: 'up' | 'down' | 'flat' | 'new' | 'exited' | null = null
            if (oldestVal?.adjustedShares === null && newestVal?.adjustedShares !== null) {
              trend = 'new'
            } else if (oldestVal?.adjustedShares !== null && newestVal?.adjustedShares === null) {
              trend = 'exited'
            } else {
              // Trend: vals is reverse chronological (newest first).
              // recentVal = most recent quarter, prevVal = previous quarter.
              let recentVal: typeof vals[0] | null = null
              let prevVal: typeof vals[0] | null = null

              for (const v of vals) {
                if (v.adjustedShares !== null) {
                  if (!recentVal) {
                    recentVal = v
                  } else if (!prevVal) {
                    prevVal = v
                    break
                  }
                }
              }

              if (!recentVal) {
                trend = null
              } else if (!prevVal) {
                trend = recentVal.adjustedShares !== null ? 'flat' : null
              } else if (recentVal.adjustedShares !== null && prevVal.adjustedShares !== null) {
                const delta = recentVal.adjustedShares - prevVal.adjustedShares
                if (delta > 0) trend = 'up'
                else if (delta < 0) trend = 'down'
                else trend = 'flat'
              }
            }

            const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : trend === 'new' ? 'text-green-500' : trend === 'exited' ? 'text-red-500' : 'text-[var(--muted-foreground)]'
            const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'new' ? '★' : trend === 'exited' ? '✕' : '→'

            return (
              <tr key={h.cusip} className="hover:bg-[var(--muted)]/50">
                <td className="px-4 py-2.5 font-medium sticky left-0 bg-[var(--card)] z-10">
                  <span className="flex items-center gap-1.5">
                    <span className={trendColor}>{trendArrow}</span>
                    {h.companyName}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-[var(--muted-foreground)]">{h.cusip}</td>
                {vals.map((v) => {
                  const isNull = v.adjustedShares === null
                  return (
                    <td key={v.quarter} className="px-3 py-2.5 text-right tabular-nums">
                      {isNull ? (
                        <span className="text-[var(--muted-foreground)] text-xs">—</span>
                      ) : (
                        <div>
                          <div>{formatShares(v.adjustedShares)}</div>
                          <div className="text-xs text-[var(--muted-foreground)]">{formatValue(v.rawValue ?? 0)}</div>
                        </div>
                      )}
                    </td>
                  )
                })}
                {quarters.length > 6 && <td className="px-3 py-2.5 text-right text-[var(--muted-foreground)]">+{quarters.length - 6}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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
  const [multiData, setMultiData] = useState<MultiTrackerData | null>(null)
  const [singleData, setSingleData] = useState<SingleHoldingsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'two-way' | 'multi' | 'single'>(() => {
    if (searchParams.get('quarters')) return 'multi'
    return 'two-way'
  })
  const [singleQuarter, setSingleQuarter] = useState(searchParams.get('quarter') ?? '')
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>(() => {
    const q = searchParams.get('quarters')
    // Always store in reverse chronological order (newest first)
    return q ? q.split(',').filter(Boolean).sort().reverse() : []
  })

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
          // Multi-mode default: most recent 4 quarters
          if (selectedQuarters.length === 0) {
            if (quarters.length >= 4) {
              setSelectedQuarters(quarters.slice(0, 4))
            } else {
              setSelectedQuarters(quarters.slice())
            }
          }
          // Single-mode default: most recent quarter
          if (!singleQuarter && quarters.length >= 1) {
            setSingleQuarter(quarters[0])
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

  const fetchMultiComparison = useCallback(async (quarters: string[]) => {
    if (quarters.length < 2) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tracker/${cik}?quarters=${quarters.join(',')}`)
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Failed to fetch')
      }
      const json: MultiTrackerData = await res.json()
      setMultiData(json)
      const params = new URLSearchParams()
      params.set('quarters', quarters.join(','))
      router.replace(`/tracker/${cik}?${params.toString()}`, { scroll: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      setMultiData(null)
    } finally {
      setIsLoading(false)
    }
  }, [cik, router])

  const fetchSingleHoldings = useCallback(async (quarter: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/institutions/${cik}/holdings?quarter=${quarter}`)
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Failed to fetch')
      }
      const json: SingleHoldingsData = await res.json()
      setSingleData(json)
      const params = new URLSearchParams()
      params.set('quarter', quarter)
      router.replace(`/tracker/${cik}?${params.toString()}`, { scroll: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      setSingleData(null)
    } finally {
      setIsLoading(false)
    }
  }, [cik, router])

  // Fetch when quarters change
  useEffect(() => {
    if (mode === 'two-way' && from && to) {
      fetchComparison(from, to)
    } else if (mode === 'multi' && selectedQuarters.length >= 2) {
      fetchMultiComparison(selectedQuarters)
    } else if (mode === 'single' && singleQuarter) {
      fetchSingleHoldings(singleQuarter)
    }
  }, [mode, from, to, selectedQuarters, singleQuarter, fetchComparison, fetchMultiComparison, fetchSingleHoldings])

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <Link href={`/institutions/${cik}`} className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ← {data?.institution.name ?? multiData?.institution.name ?? singleData?.institution.name ?? 'Institution'}
          </Link>
          <h1 className="text-2xl font-bold mt-2">Holdings Tracker</h1>
          {mode === 'two-way' && data && (
            <p className="mt-1 text-[var(--muted-foreground)]">
              Comparing {from} → {to}
            </p>
          )}
          {mode === 'multi' && multiData && (
            <p className="mt-1 text-[var(--muted-foreground)]">
              Multi-quarter: {multiData.quarters.join(' → ')}
            </p>
          )}
          {mode === 'single' && singleData && (
            <p className="mt-1 text-[var(--muted-foreground)]">
              {singleData.filing?.quarter ?? singleQuarter}
            </p>
          )}
        </div>

        {/* Mode toggle + Quarter selectors */}
        <div className="flex flex-wrap gap-4 mb-6">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--muted)] p-0.5 gap-0.5">
            <button
              onClick={() => setMode('two-way')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'two-way'
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              Two-way
            </button>
            <button
              onClick={() => setMode('multi')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'multi'
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              Multi-quarter
            </button>
            <button
              onClick={() => setMode('single')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'single'
                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              Single
            </button>
          </div>

          {mode === 'two-way' ? (
            <>
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
            </>
          ) : mode === 'multi' ? (
            <>
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Select quarters</label>
                <div className="flex flex-wrap gap-2">
                  {availableQuarters.map((q) => {
                    const isSelected = selectedQuarters.includes(q)
                    return (
                      <button
                        key={q}
                        onClick={() => {
                          if (isSelected) {
                            if (selectedQuarters.length > 2) {
                              setSelectedQuarters(selectedQuarters.filter((sq) => sq !== q))
                            }
                          } else {
                            // Add in reverse chronological order (newest first)
                            const updated = [...selectedQuarters, q].sort().reverse()
                            setSelectedQuarters(updated)
                          }
                        }}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)]'
                        }`}
                      >
                        {q}
                      </button>
                    )
                  })}
                </div>
                {selectedQuarters.length < 2 && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">Select at least 2 quarters</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Quarter</label>
                <select
                  value={singleQuarter}
                  onChange={(e) => setSingleQuarter(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]/20"
                >
                  {availableQuarters.map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>
            </>
          )}

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

        {/* Data — Two-way mode */}
        {!isLoading && mode === 'two-way' && data && (
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

        {/* Data — Multi-quarter mode */}
        {!isLoading && mode === 'multi' && multiData && (
          <>
            <MultiSummaryRow data={multiData} />
            <div className="mt-6">
              <h2 className="text-sm font-semibold mb-3">All Positions by Quarter</h2>
              <MultiTrendTable data={multiData} />
            </div>
          </>
        )}

        {/* Data — Single-quarter mode */}
        {!isLoading && mode === 'single' && singleData && (
          <HoldingsTable holdings={singleData.holdings} />
        )}
      </div>
    </main>
  )
}

function MultiSummaryRow({ data }: { data: MultiTrackerData }) {
  const { quarters, holdings } = data
  // Compute total value per quarter
  const quarterValues = quarters.map((q) => {
    const total = holdings.reduce((sum, h) => {
      const val = h.values.find((v) => v.quarter === q)
      return sum + (val?.rawValue ?? 0)
    }, 0)
    return { quarter: q, total }
  })
  const firstTotal = quarterValues[0]?.total ?? 0
  const lastTotal = quarterValues[quarterValues.length - 1]?.total ?? 0
  const delta = lastTotal - firstTotal
  const deltaPercent = firstTotal > 0 ? (delta / firstTotal) * 100 : null
  const deltaSign = delta >= 0 ? '+' : ''
  const deltaColor = delta >= 0 ? 'text-green-500' : 'text-red-500'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
      {quarterValues.map(({ quarter, total }) => (
        <div key={quarter} className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div className="text-xs text-[var(--muted-foreground)] mb-1">{quarter}</div>
          <div className="text-lg font-semibold tabular-nums">{formatValue(total)}</div>
        </div>
      ))}
      {deltaPercent !== null && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div className="text-xs text-[var(--muted-foreground)] mb-1">Change</div>
          <div className={`text-lg font-semibold tabular-nums ${deltaColor}`}>
            {deltaSign}{formatValue(delta)}
            <span className="text-xs ml-1">({deltaSign}{deltaPercent.toFixed(1)}%)</span>
          </div>
        </div>
      )}
    </div>
  )
}
