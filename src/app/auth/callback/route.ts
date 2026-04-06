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
    if (!error) {
      // Build redirect first so we can attach cookies to it.
      const url = new URL(`${origin}${next}`)
      url.searchParams.set('oauth_complete', '1')
      const redirect = NextResponse.redirect(url.toString(), 302)
      // Copy session cookies (set on supabaseResponse by exchangeCodeForSession) onto the redirect.
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirect.cookies.set(c.name, c.value, c)
      })
      return redirect
    }
  }

  return NextResponse.redirect(`${origin}/auth`, 302)
}
