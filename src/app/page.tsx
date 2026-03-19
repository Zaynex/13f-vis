'use client'

// Home Page — Institution Selector
//
// Entry point to the app. Shows a prominent search/select box for
// institutions, and a link to the comparison tool.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Institution {
  cik: string
  name: string
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function HomePage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const debouncedQuery = useDebounce(query, 250)

  useEffect(() => {
    if (!debouncedQuery) {
      // Load popular institutions on empty query
      fetch('/api/institutions')
        .then((r) => r.json())
        .then((d) => setInstitutions(d.institutions ?? []))
        .catch(() => {})
      return
    }

    setIsLoading(true)
    fetch(`/api/institutions?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((d) => setInstitutions(d.institutions ?? []))
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [debouncedQuery])

  const handleSelect = useCallback(
    (cik: string) => {
      router.push(`/institutions/${cik}`)
    },
    [router],
  )

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-24">
      {/* Hero */}
      <div className="w-full max-w-xl text-center">
        <div className="mb-3 text-5xl">📊</div>
        <h1 className="text-3xl font-bold tracking-tight">13F Tracker</h1>
        <p className="mt-3 text-[var(--muted-foreground)]">
          See what the smart money is doing. Track institutional investors&apos;{' '}
          <span className="text-[var(--foreground)]">13F filings</span> every quarter.
        </p>
      </div>

      {/* Search */}
      <div className="mt-10 w-full max-w-lg">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search funds… e.g. Berkshire, Bridgewater, Citadel"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 pr-12 text-[var(--foreground)] placeholder-[var(--muted-foreground)] shadow-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]/20"
            autoFocus
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
            {isLoading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            )}
          </span>
        </div>

        {/* Results */}
        {institutions.length > 0 && (
          <ul className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            {institutions.map((inst) => (
              <li key={inst.cik}>
                <button
                  onClick={() => handleSelect(inst.cik)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[var(--muted)] transition-colors"
                >
                  <span className="font-medium">{inst.name}</span>
                  <span className="font-mono text-xs text-[var(--muted-foreground)]">{inst.cik}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {query && !isLoading && institutions.length === 0 && (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center">
            <p className="text-[var(--muted-foreground)]">No institutions found for &ldquo;{query}&rdquo;</p>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-12 flex gap-6 text-sm">
        <a
          href="/compare"
          className="flex items-center gap-2 text-[var(--accent)] hover:underline"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Compare funds
        </a>
      </div>

      {/* Footer note */}
      <div className="mt-20 mb-8 text-center text-xs text-[var(--muted-foreground)]">
        <p>
          Data sourced from{' '}
          <a href="https://www.sec.gov/edgar" target="_blank" rel="noopener noreferrer" className="underline">
            SEC EDGAR
          </a>
          . 13F filings are submitted 45 days after quarter end — data is always historical.
        </p>
      </div>
    </main>
  )
}
