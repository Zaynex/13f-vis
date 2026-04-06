import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/watchlist'

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    console.log('=== OAuth callback debug ===')
    console.log('code present:', !!code)
    console.log('error:', error ? error.message : 'none')
    console.log('sessionData:', sessionData ? 'session present' : 'null')
    console.log('cookies after exchange:', supabaseResponse.cookies.getAll().map(c => `${c.name}=${c.value.substring(0, 20)}...`))
    if (!error && sessionData?.session) {
      const { session } = sessionData
      // Explicitly set the session cookies on the redirect response.
      // This bypasses any issues with the setAll callback not persisting properly.
      const url = new URL(`${origin}${next}`)
      url.searchParams.set('oauth_complete', '1')
      const redirect = NextResponse.redirect(url.toString(), 302)
      const cookieOptions = {
        maxAge: session.expires_in ?? 3600,
        sameSite: 'lax' as const,
        secure: true,
        path: '/',
        httpOnly: true,
      }
      redirect.cookies.set('sb-access-token', session.access_token, cookieOptions)
      redirect.cookies.set('sb-refresh-token', session.refresh_token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60, // 30 days for refresh token
      })
      console.log('setting explicit cookies on redirect:', 'sb-access-token', 'sb-refresh-token')
      return redirect
    }
  }

  return NextResponse.redirect(`${origin}/auth`, 302)
}
