import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const origin = request.nextUrl.origin

  // Build the final JSON response first - we'll add cookies to this
  const jsonResponse = NextResponse.json({ success: true })

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
            jsonResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Sign in using the server client - triggers onAuthStateChange → setAll
  console.log('[signin] Attempting sign in for:', email)
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  console.log('[signin] Result:', { error, hasSession: !!data?.session, user: data?.user?.id })

  if (error || !data.session) {
    return NextResponse.json({ error: error?.message ?? 'Login failed' }, { status: 401 })
  }

  // Wait for onAuthStateChange to complete (it's async)
  await supabase.auth.getUser()

  // Return session data so the browser client can persist it in localStorage
  return NextResponse.json({
    success: true,
    user: data.user,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  })
}
