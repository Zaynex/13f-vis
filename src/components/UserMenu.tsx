'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface User {
  email?: string
  avatar_url?: string
  user_metadata?: {
    avatar_url?: string
    email?: string
    name?: string
  }
}

export function UserMenu() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [showInitials, setShowInitials] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Get initial user
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setOpen(false)
    router.push('/')
    router.refresh()
  }

  // Loading: neutral gray circle placeholder
  if (loading) {
    return (
      <div className="hidden md:inline-flex items-center">
        <div className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--muted)]" />
      </div>
    )
  }

  // Unauthenticated: render nothing
  if (!user) {
    return null
  }

  const avatarUrl = user.user_metadata?.avatar_url ?? user.avatar_url
  const email = user.user_metadata?.email ?? user.email ?? ''
  const initials = email.split('@')[0].slice(0, 2).toUpperCase()

  return (
    <div className="hidden md:inline-flex items-center relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full border border-[var(--border)] overflow-hidden bg-[var(--muted)] hover:border-[var(--accent)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/50"
        title={email}
        aria-label="User menu"
        aria-expanded={open}
      >
        {avatarUrl && !showInitials ? (
          <img
            src={avatarUrl}
            alt={email}
            className="w-full h-full object-cover"
            onError={() => setShowInitials(true)}
          />
        ) : (
          <span className="flex items-center justify-center w-full h-full text-xs font-medium text-[var(--foreground)]">
            {initials}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <p className="text-xs text-[var(--muted-foreground)] truncate" title={email}>
              {email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
