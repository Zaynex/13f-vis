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
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    console.log('=== OAuth callback debug ===')
    console.log('code present:', !!code)
    console.log('error:', error ? error.message : 'none')
    console.log('supabaseResponse type:', supabaseResponse.constructor.name)
    console.log('cookies after exchange:', supabaseResponse.cookies.getAll().map(c => `${c.name}=${c.value.substring(0, 20)}...`))
    if (!error) {
      // Build redirect first so we can attach cookies to it.
      const url = new URL(`${origin}${next}`)
      url.searchParams.set('oauth_complete', '1')
      const redirect = NextResponse.redirect(url.toString(), 302)
      // Copy session cookies (set on supabaseResponse by exchangeCodeForSession) onto the redirect.
      const cookies = supabaseResponse.cookies.getAll()
      console.log('setting cookies on redirect:', cookies.map(c => c.name))
      console.log('cookie values:', cookies.map(c => `${c.name}=${c.value.substring(0, 30)}...`))
      cookies.forEach((c) => {
        redirect.cookies.set(c.name, c.value, c)
      })
      return redirect
    }
  }

  return NextResponse.redirect(`${origin}/auth`, 302)
}
