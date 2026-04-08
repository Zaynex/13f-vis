import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const origin = request.nextUrl.origin

  // Build the JSON response first - we'll add cookies to it
  const jsonResponse = NextResponse.json({ success: true })

  // Capture cookies set via setAll so we can re-apply them after sign-in
  let capturedCookies: Array<{ name: string; value: string; options?: object }> = []

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
            jsonResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session) {
    return NextResponse.json({ error: error?.message ?? 'Login failed' }, { status: 401 })
  }

  // Wait for onAuthStateChange to complete (it's async)
  await supabase.auth.getUser()

  // Build the response with session data and re-apply cookies
  const body = {
    success: true,
    user: data.user,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  }

  const finalResponse = NextResponse.json(body)
  capturedCookies.forEach(({ name, value, options }) =>
    finalResponse.cookies.set(name, value, options)
  )
  return finalResponse
}
