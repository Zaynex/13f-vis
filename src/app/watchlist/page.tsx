'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface TrackedInstitution {
  institutionCik: string
  institutionName: string
  createdAt: string
  thresholdPct: number
  quarter: string | null
  totalValue: number
  holdingsCount: number
}

interface FiredAlert {
  institutionCik: string
  institutionName: string
  quarter: string
  holdings: Array<{ cusip: string; companyName: string; changeType: string; changePercent: number }>
}

export default function WatchlistPage() {
  const [tracked, setTracked] = useState<TrackedInstitution[]>([])
  const [firedAlerts, setFiredAlerts] = useState<FiredAlert[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [untrackError, setUntrackError] = useState<string | null>(null)
  const [thresholdErrors, setThresholdErrors] = useState<Map<string, string>>(new Map())
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/auth?next=/watchlist')
      } else {
        setUser(data.user)
        fetchWatchlist(data.user.id)
      }
    })
  }, [router])

  async function fetchWatchlist(userId: string) {
    setLoading(true)
    setUntrackError(null)
    try {
      const [trackRes, alertsRes] = await Promise.all([
        fetch('/api/user/track'),
        fetch('/api/user/alerts'),
      ])
      if (trackRes.ok) {
        const { tracked } = await trackRes.json()
        setTracked(tracked ?? [])
      }
      if (alertsRes.ok) {
        const { firedAlerts } = await alertsRes.json()
        setFiredAlerts(firedAlerts ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleUntrack(cik: string) {
    setUntrackError(null)
    const res = await fetch(`/api/user/track?cik=${cik}`, { method: 'DELETE' })
    if (!res.ok) {
      setUntrackError('Failed to remove. Please try again.')
      return
    }
    setTracked(prev => prev.filter(t => t.institutionCik !== cik))
    setFiredAlerts(prev => prev.filter(a => a.institutionCik !== cik))
  }

  async function handleThresholdChange(cik: string, value: number) {
    // Validate bounds before sending
    if (value < 5 || value > 100) {
      setThresholdErrors(prev => new Map(prev).set(cik, 'Threshold must be between 5 and 100'))
      return
    }
    setThresholdErrors(prev => {
      const next = new Map(prev)
      next.delete(cik)
      return next
    })
    // Optimistic update
    setTracked(prev => prev.map(t => t.institutionCik === cik ? { ...t, thresholdPct: value } : t))
    const res = await fetch('/api/user/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institutionCik: cik, thresholdPct: value }),
    })
    if (!res.ok) {
      setThresholdErrors(prev => new Map(prev).set(cik, 'Failed to save threshold'))
      // Revoke optimistic update by refetching
      fetchWatchlist(user!.id)
    }
  }

  function dismissAlert(cik: string) {
    setDismissed(prev => new Set(prev).add(cik))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const formatValue = (n: number) =>
    n >= 1_000_000_000
      ? `$${(n / 1_000_000_000).toFixed(1)}B`
      : n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : `$${n.toLocaleString()}`

  const visibleAlerts = firedAlerts.filter(a => !dismissed.has(a.institutionCik))

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">My Watchlist</h1>
          <p className="text-sm text-zinc-500">{user?.email}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            ← Public Dashboard
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Dismissed banner */}
        {visibleAlerts.length > 0 && (
          <div className="mb-6 p-4 bg-red-950 border border-red-900 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-red-300">
                  {visibleAlerts.length} fund{visibleAlerts.length > 1 ? 's' : ''} with significant changes this quarter
                </p>
                <ul className="mt-1 space-y-0.5">
                  {visibleAlerts.slice(0, 3).map(a => (
                    <li key={a.institutionCik} className="text-xs text-red-400">
                      <span className="font-medium text-red-200">{a.institutionName}</span>
                      {' — '}
                      {a.holdings.length} holding{a.holdings.length !== 1 ? 's' : ''} changed in {a.quarter}
                    </li>
                  ))}
                  {visibleAlerts.length > 3 && (
                    <li className="text-xs text-red-400">
                      +{visibleAlerts.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
              <button
                onClick={() => visibleAlerts.forEach(a => dismissAlert(a.institutionCik))}
                className="text-xs text-red-400 hover:text-red-200 transition-colors shrink-0"
              >
                Dismiss all
              </button>
            </div>
          </div>
        )}

        {/* Inline untrack error */}
        {untrackError && (
          <div className="mb-4 px-4 py-3 bg-red-950 border border-red-900 rounded-lg text-sm text-red-300">
            {untrackError}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-zinc-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : tracked.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 mb-4">You are not tracking any institutions yet.</p>
            <p className="text-sm text-zinc-600">
              Visit an institution page and click &ldquo;+ Track Fund&rdquo; to add it to your watchlist.
            </p>
            <Link
              href="/"
              className="inline-block mt-6 px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
            >
              Browse institutions
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {tracked.map(t => {
              const thresholdErr = thresholdErrors.get(t.institutionCik)
              const hasAlert = firedAlerts.some(a => a.institutionCik === t.institutionCik && !dismissed.has(a.institutionCik))
              return (
                <div
                  key={t.institutionCik}
                  className="flex items-center justify-between px-5 py-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      {hasAlert && (
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Significant changes detected" />
                      )}
                      <Link
                        href={`/institutions/${t.institutionCik}`}
                        className="font-medium text-zinc-100 hover:text-white transition-colors truncate"
                      >
                        {t.institutionName || t.institutionCik}
                      </Link>
                      <span className="text-xs text-zinc-600 font-mono">{t.institutionCik}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                      {t.quarter ? (
                        <>
                          <span>{t.quarter}</span>
                          <span>{t.holdingsCount} holdings</span>
                          <span>{formatValue(t.totalValue)}</span>
                        </>
                      ) : (
                        <span className="animate-pulse">Loading…</span>
                      )}
                    </div>
                    {/* Threshold input */}
                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-xs text-zinc-500">Alert threshold:</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={5}
                          max={100}
                          value={t.thresholdPct}
                          onChange={e => handleThresholdChange(t.institutionCik, Number(e.target.value))}
                          className="w-14 px-2 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-zinc-500"
                        />
                        <span className="text-xs text-zinc-500">%</span>
                      </div>
                      {thresholdErr && (
                        <span className="text-xs text-red-400">{thresholdErr}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <Link
                      href={`/compare?ciks=${t.institutionCik}`}
                      className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      Compare →
                    </Link>
                    <button
                      onClick={() => handleUntrack(t.institutionCik)}
                      className="text-sm text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
