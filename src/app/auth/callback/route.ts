import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const DEFAULT_OAUTH_NEXT_PATH = '/watchlist'

export function getSafeOAuthNextPath(next: string | null): string {
  if (!next) return DEFAULT_OAUTH_NEXT_PATH
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return DEFAULT_OAUTH_NEXT_PATH
  }
  return next
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const [code, next] = await Promise.all([
    searchParams.get('code'),
    searchParams.get('next'),
  ])
  const safeNext = getSafeOAuthNextPath(next)

  if (!code) {
    return NextResponse.redirect(`${origin}/auth`, 302)
  }

  const url = new URL(`${origin}${safeNext}`)

  // Capture cookies set by Supabase so we can re-apply them to the final response.
  let capturedCookies: Array<{ name: string; value: string; options?: object }> = []

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
          capturedCookies = cookiesToSet
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

  // Encode session tokens in the URL so the destination page can set localStorage.
  // This is needed because OAuth only sets HTTP-only cookies server-side;
  // the browser Supabase client still needs the session to show logged-in UI.
  // Redirect to /auth with session tokens so the browser can set localStorage.
  // The auth page will read the tokens, call setSession, then redirect to `next`.
  const callbackUrl = new URL(`${origin}/auth`)
  callbackUrl.searchParams.set('access_token', sessionData.session.access_token)
  callbackUrl.searchParams.set('refresh_token', sessionData.session.refresh_token)
  callbackUrl.searchParams.set('next', safeNext)

  if (capturedCookies.length > 0) {
    const finalResponse = NextResponse.redirect(callbackUrl.toString(), 302)
    capturedCookies.forEach(({ name, value, options }) =>
      finalResponse.cookies.set(name, value, options)
    )
    return finalResponse
  }

  return NextResponse.redirect(callbackUrl.toString(), 302)
}
