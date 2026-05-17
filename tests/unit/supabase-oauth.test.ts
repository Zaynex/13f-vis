import { describe, expect, it, vi } from 'vitest'

describe('Supabase OAuth client', () => {
  it('uses PKCE so the server callback can exchange Google OAuth codes into cookies', async () => {
    vi.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example-ref.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    vi.stubGlobal('window', { document: {} })
    vi.stubGlobal('document', { cookie: '' })

    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/auth/callback?next=/watchlist',
        skipBrowserRedirect: true,
      },
    })

    expect(error).toBeNull()
    expect(data.url).toBeTruthy()
    const authUrl = new URL(data.url!)
    expect(authUrl.searchParams.has('code_challenge')).toBe(true)
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('s256')
  })
})
