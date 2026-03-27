'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface TrackedInstitution {
  institution_cik: string
  created_at: string
}

interface InstitutionSummary {
  cik: string
  name: string
  quarter: string
  totalValue: number
  holdingsCount: number
}

export default function WatchlistPage() {
  const [tracked, setTracked] = useState<TrackedInstitution[]>([])
  const [summaries, setSummaries] = useState<Map<string, InstitutionSummary>>(new Map())
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
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
  }, [])

  async function fetchWatchlist(userId: string) {
    setLoading(true)
    const res = await fetch('/api/user/track')
    const { tracked } = await res.json()
    setTracked(tracked ?? [])

    // Fetch institution summaries in parallel
    const summaries = new Map<string, InstitutionSummary>()
    await Promise.all(
      (tracked as TrackedInstitution[]).map(async (t: TrackedInstitution) => {
        try {
          const r = await fetch(`/api/tracker/${t.institution_cik}`)
          if (r.ok) {
            const data = await r.json()
            summaries.set(t.institution_cik, {
              cik: t.institution_cik,
              name: data.institution?.name ?? 'Unknown',
              quarter: data.to?.quarter ?? 'N/A',
              totalValue: data.to?.totalValue ?? 0,
              holdingsCount: data.to?.holdings?.length ?? 0,
            })
          }
        } catch {
          // skip failed fetches
        }
      })
    )
    setSummaries(summaries)
    setLoading(false)
  }

  async function handleUntrack(cik: string) {
    await fetch(`/api/user/track?cik=${cik}`, { method: 'DELETE' })
    setTracked(prev => prev.filter(t => t.institution_cik !== cik))
    setSummaries(prev => {
      const next = new Map(prev)
      next.delete(cik)
      return next
    })
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
              Visit an institution page and click &ldquo;Track this fund&rdquo; to add it to your watchlist.
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
              const s = summaries.get(t.institution_cik)
              return (
                <div
                  key={t.institution_cik}
                  className="flex items-center justify-between px-5 py-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/tracker/${t.institution_cik}`}
                        className="font-medium text-zinc-100 hover:text-white transition-colors truncate"
                      >
                        {s?.name ?? t.institution_cik}
                      </Link>
                      <span className="text-xs text-zinc-600 font-mono">{t.institution_cik}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500">
                      {s ? (
                        <>
                          <span>{s.quarter}</span>
                          <span>{s.holdingsCount} holdings</span>
                          <span>{formatValue(s.totalValue)}</span>
                        </>
                      ) : (
                        <span className="animate-pulse">Loading…</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <Link
                      href={`/tracker/${t.institution_cik}`}
                      className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      Compare →
                    </Link>
                    <button
                      onClick={() => handleUntrack(t.institution_cik)}
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
