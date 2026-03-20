'use client'

// Comparison Page — Multi-fund overlap analysis
//
// URL: /compare
// Query params: ciks (comma-separated CIKs)
//
// Shows:
// 1. Institution multi-selector
// 2. Overlapping holdings (securities held by ALL selected funds)
// 3. Unique per fund (securities held by only that fund)

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChangeBadge } from '@/components/ChangeBadge'

interface Institution {
  cik: string
  name: string
  holdingCount?: number
}

interface ComparisonData {
  quarter: string
  institutions: Institution[]
  overlapping: Array<{
    cusip: string
    companyName: string
    funds: string[]
    totalValue: number
  }>
  uniqueByFund: Record<string, Array<{ cusip: string; companyName: string; rawValue: number }>>
}

function formatValue(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

function FundChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-sm">
      <span className="font-medium">{name}</span>
      <button
        onClick={onRemove}
        className="ml-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        aria-label={`Remove ${name}`}
      >
        ×
      </button>
    </span>
  )
}

function ComparePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialCiks = (searchParams.get('ciks') ?? '').split(',').filter(Boolean)

  const [allInstitutions, setAllInstitutions] = useState<Institution[]>([])
  const [selectedCiks, setSelectedCiks] = useState<string[]>(initialCiks)
  const [query, setQuery] = useState('')
  const [data, setData] = useState<ComparisonData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overlap' | 'unique'>('overlap')

  // Load all institutions for the selector
  useEffect(() => {
    fetch('/api/institutions')
      .then((r) => r.json())
      .then((d) => setAllInstitutions(d.institutions ?? []))
      .catch(() => {})
  }, [])

  // Fetch comparison data when selected funds change
  const fetchComparison = useCallback(async (ciks: string[]) => {
    if (ciks.length < 2) {
      setData(null)
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch(`/api/compare?ciks=${ciks.join(',')}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json: ComparisonData = await res.json()
      setData(json)

      // Update URL
      const params = new URLSearchParams()
      params.set('ciks', ciks.join(','))
      router.replace(`/compare?${params.toString()}`, { scroll: false })
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (selectedCiks.length >= 2) {
      fetchComparison(selectedCiks)
    } else {
      setData(null)
    }
  }, [selectedCiks, fetchComparison])

  const addFund = useCallback(
    (cik: string) => {
      if (selectedCiks.length >= 5) return
      if (selectedCiks.includes(cik)) return
      setSelectedCiks((prev) => [...prev, cik])
    },
    [selectedCiks],
  )

  const removeFund = useCallback((cik: string) => {
    setSelectedCiks((prev) => prev.filter((c) => c !== cik))
  }, [])

  const selectedNames = selectedCiks
    .map((cik) => allInstitutions.find((i) => i.cik === cik)?.name ?? cik)
    .filter(Boolean)

  const filteredInstitutions = allInstitutions.filter(
    (i) =>
      !selectedCiks.includes(i.cik) &&
      (i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.cik.includes(query)),
  )

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ← Search
          </Link>
          <h1 className="text-2xl font-bold">Compare Funds</h1>
          <p className="mt-1 text-[var(--muted-foreground)]">
            See overlapping and unique holdings across multiple institutional investors.
          </p>
        </div>

        {/* Selected funds */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {selectedNames.map((name) => {
            const cik = selectedCiks[selectedNames.indexOf(name)]
            return (
              <FundChip
                key={cik}
                name={name}
                onRemove={() => removeFund(cik)}
              />
            )
          })}
          {selectedCiks.length < 5 && (
            <span className="text-xs text-[var(--muted-foreground)]">
              {selectedCiks.length}/5 selected
            </span>
          )}
        </div>

        {/* Institution search */}
        {selectedCiks.length < 5 && (
          <div className="mb-6">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add a fund…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]/20"
            />
            {query && filteredInstitutions.length > 0 && (
              <ul className="mt-1 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]">
                {filteredInstitutions.slice(0, 8).map((inst) => (
                  <li key={inst.cik}>
                    <button
                      onClick={() => {
                        addFund(inst.cik)
                        setQuery('')
                      }}
                      className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    >
                      <span>{inst.name}</span>
                      <span className="font-mono text-xs text-[var(--muted-foreground)]">{inst.cik}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Results */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          </div>
        )}

        {!isLoading && selectedCiks.length < 2 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] py-20 text-center">
            <div className="text-4xl mb-3">⚖️</div>
            <p className="text-[var(--muted-foreground)]">
              Select 2 or more funds above to see overlapping holdings.
            </p>
          </div>
        )}

        {!isLoading && data && selectedCiks.length >= 2 && (
          <>
            {/* Quarter badge */}
            <div className="mb-4 text-sm text-[var(--muted-foreground)]">
              Comparing for <span className="font-medium text-[var(--foreground)]">{data.quarter}</span>
            </div>

            {/* Tab switcher */}
            <div className="mb-4 flex border-b border-[var(--border)]">
              <button
                onClick={() => setActiveTab('overlap')}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'overlap'
                    ? 'border-b-2 border-[var(--accent)] text-[var(--foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Overlapping ({data.overlapping.length})
              </button>
              <button
                onClick={() => setActiveTab('unique')}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'unique'
                    ? 'border-b-2 border-[var(--accent)] text-[var(--foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                Unique per fund
              </button>
            </div>

            {/* Overlap table */}
            {activeTab === 'overlap' && (
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                {data.overlapping.length === 0 ? (
                  <div className="py-12 text-center text-[var(--muted-foreground)]">
                    No overlapping holdings found.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                        <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Company</th>
                        <th className="px-3 py-3 text-left font-medium text-[var(--muted-foreground)]">CUSIP</th>
                        <th className="px-3 py-3 text-left font-medium text-[var(--muted-foreground)]">Held by</th>
                        <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">Total value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {data.overlapping.map((h) => (
                        <tr key={h.cusip} className="hover:bg-[var(--muted)]/50">
                          <td className="px-4 py-3 font-medium">{h.companyName}</td>
                          <td className="px-3 py-3 font-mono text-xs text-[var(--muted-foreground)]">{h.cusip}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {h.funds.map((f) => {
                                const name = data.institutions.find((i) => i.cik === f)?.name ?? f
                                return (
                                  <span
                                    key={f}
                                    className="inline-flex items-center rounded bg-[var(--accent)]/20 px-1.5 py-0.5 text-xs text-[var(--accent)]"
                                    title={name}
                                  >
                                    {name.slice(0, 12)}
                                  </span>
                                )
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums font-medium">
                            {formatValue(h.totalValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Unique per fund */}
            {activeTab === 'unique' && (
              <div className="space-y-6">
                {data.institutions.map((inst) => {
                  const unique = data.uniqueByFund[inst.cik] ?? []
                  return (
                    <div key={inst.cik}>
                      <h3 className="mb-2 text-sm font-medium">
                        {inst.name}{' '}
                        <span className="font-normal text-[var(--muted-foreground)]">
                          ({unique.length} unique positions)
                        </span>
                      </h3>
                      {unique.length === 0 ? (
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] py-6 text-center text-sm text-[var(--muted-foreground)]">
                          No unique positions
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-[var(--border)]">
                              {unique.slice(0, 10).map((h) => (
                                <tr key={h.cusip} className="hover:bg-[var(--muted)]/50">
                                  <td className="px-4 py-2.5 font-medium">{h.companyName}</td>
                                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--muted-foreground)]">{h.cusip}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                                    {formatValue(h.rawValue)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {unique.length > 10 && (
                            <div className="border-t border-[var(--border)] bg-[var(--muted)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
                              +{unique.length - 10} more
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function ComparePageFallback() {
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Compare Funds</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
        </div>
      </div>
    </main>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<ComparePageFallback />}>
      <ComparePageContent />
    </Suspense>
  )
}
