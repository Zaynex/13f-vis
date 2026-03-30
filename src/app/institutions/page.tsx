'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface Institution {
  cik: string
  name: string
}

export default function InstitutionsPage() {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [requestCik, setRequestCik] = useState('')
  const [requestName, setRequestName] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [requestStatus, setRequestStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [requestError, setRequestError] = useState('')
  const [showRequestModal, setShowRequestModal] = useState(false)

  const fetchInstitutions = useCallback(async (q: string) => {
    setLoading(true)
    const url = q ? `/api/institutions?q=${encodeURIComponent(q)}` : '/api/institutions'
    const res = await fetch(url)
    const data = await res.json()
    setInstitutions(data.institutions ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchInstitutions(search)
  }, [search, fetchInstitutions])

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!requestCik || !requestName) return

    setRequestStatus('submitting')
    setRequestError('')

    try {
      const res = await fetch('/api/institutions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cik: requestCik,
          name: requestName,
          notes: requestNotes || undefined,
        }),
      })

      if (res.ok) {
        setRequestStatus('success')
        setRequestCik('')
        setRequestName('')
        setRequestNotes('')
        setTimeout(() => {
          setShowRequestModal(false)
          setRequestStatus('idle')
        }, 1500)
      } else {
        const data = await res.json()
        setRequestError(data.error ?? 'Failed to submit request')
        setRequestStatus('error')
      }
    } catch {
      setRequestError('Network error. Please try again.')
      setRequestStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Institution Directory</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse and track institutional investor holdings
              </p>
            </div>
            <button
              onClick={() => setShowRequestModal(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Request CIK
            </button>
          </div>

          {/* Search */}
          <div className="mt-6">
            <input
              type="text"
              placeholder="Search by name or CIK..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Institution Grid */}
      <div className="mx-auto max-w-5xl px-6 py-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-border bg-card p-4">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : institutions.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">No institutions found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search ? `No results for "${search}"` : 'No institutions tracked yet'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {institutions.map((inst) => (
              <Link
                key={inst.cik}
                href={`/institutions/${inst.cik}`}
                className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-ring hover:bg-card/80"
              >
                <div className="font-medium text-foreground group-hover:text-primary">
                  {inst.name}
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">CIK: {inst.cik}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Request CIK Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-foreground">Request Institution Tracking</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit a CIK to be added to the directory
            </p>

            <form onSubmit={handleRequest} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">CIK</label>
                <input
                  type="text"
                  value={requestCik}
                  onChange={(e) => setRequestCik(e.target.value)}
                  placeholder="e.g. 0001067983"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Institution Name</label>
                <input
                  type="text"
                  value={requestName}
                  onChange={(e) => setRequestName(e.target.value)}
                  placeholder="e.g. Berkshire Hathaway Inc"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Notes (optional)</label>
                <textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="Any additional context..."
                  rows={2}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {requestError && (
                <p className="text-sm text-destructive">{requestError}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowRequestModal(false); setRequestStatus('idle') }}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requestStatus === 'submitting' || requestStatus === 'success'}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {requestStatus === 'submitting' ? 'Submitting...' : requestStatus === 'success' ? 'Submitted!' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
