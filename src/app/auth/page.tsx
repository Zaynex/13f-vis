'use client'

import { useState, Suspense, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/watchlist'

  // Handle OAuth callback: set session from tokens in URL.
  useEffect(() => {
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')
    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(() => {
        router.push(next)
        router.refresh()
      })
    }
  }, [])
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else {
        setMessage({ type: 'success', text: 'Check your email for a confirmation link.' })
      }
    } else {
      // Use the server-side sign-in API to set HTTP-only session cookies.
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await res.json()
      if (res.ok && result.success) {
        // Set session in browser Supabase client so UI updates immediately
        if (result.session) {
          await supabase.auth.setSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token,
          })
        }
        router.push(next)
        router.refresh()
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Login failed' })
      }
    }

    setLoading(false)
  }

  async function handleGoogleOAuth() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
    })
    if (error) setMessage({ type: 'error', text: error.message })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {mode === 'login'
              ? 'Welcome back — sign in to track funds'
              : 'Start tracking institutional holdings'}
          </p>
        </div>

        <div className="flex gap-2 p-1 bg-zinc-900 rounded-lg">
          <button
            type="button"
            onClick={() => { setMode('login'); setMessage(null) }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'login'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setMessage(null) }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'signup'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Sign up
          </button>
        </div>

        <button
          type="button"
          onClick={handleGoogleOAuth}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-zinc-900 font-medium rounded-lg hover:bg-zinc-200 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-zinc-950 px-2 text-zinc-600">or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700"
              placeholder="••••••••"
            />
          </div>

          {message && (
            <div className={`text-sm px-3 py-2 rounded-lg ${
              message.type === 'error'
                ? 'bg-red-950 text-red-400 border border-red-900'
                : 'bg-emerald-950 text-emerald-400 border border-emerald-900'
            }`}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-zinc-100 text-zinc-900 font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500">
          <Link href="/" className="hover:text-zinc-300 transition-colors">
            ← Back to public dashboard
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <AuthForm />
    </Suspense>
  )
}
