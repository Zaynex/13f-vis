import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const [code, next] = await Promise.all([
    searchParams.get('code'),
    searchParams.get('next'),
  ])

  if (!code) {
    return NextResponse.redirect(`${origin}/auth`, 302)
  }

  const url = new URL(`${origin}${next}`)
  url.searchParams.set('oauth_complete', '1')

  // Build a basic redirect response — we'll add cookies after exchangeCodeForSession.
  const redirectResponse = NextResponse.redirect(url.toString(), 302)

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
            redirectResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !sessionData?.session) {
    return NextResponse.redirect(`${origin}/auth`, 302)
  }

  return redirectResponse
}
