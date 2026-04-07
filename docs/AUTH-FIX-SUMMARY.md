# Auth Fix Summary (2026-04-08)

## Problem

After signing in with email/password, users could not track/untrack funds. The DELETE `/api/user/track` returned 405 (Method Not Allowed), and the middleware was redirecting API requests to an HTML login page.

## Root Cause

Supabase SSR cookie-setting flow: `exchangeCodeForSession` → `onAuthStateChange(SIGNED_IN)` → `setAll()` → HTTP-only cookies.

- **OAuth login** goes through `/auth/callback`, which triggers this flow.
- **Email/password login** was a pure client-side operation (`supabase.auth.signInWithPassword`), which only stores the session in browser localStorage. The server-side middleware could never read it, so it always returned 401/unauthorized for API requests.

Previous fixes all targeted the OAuth callback but never addressed the email/password flow — hence the repeated failures.

## Changes

### `src/app/api/auth/signin/route.ts` (new)

Server-side sign-in endpoint. Calls `supabase.auth.signInWithPassword()` on the server, which triggers `onAuthStateChange` → `setAll()` → HTTP-only cookies are written to the response. Also returns the session data so the browser client can persist it in localStorage.

### `src/app/auth/page.tsx`

Changed to call `/api/auth/signin` via fetch instead of client-side `signInWithPassword`. On success, calls `supabase.auth.setSession()` so the browser-side UI (avatar, etc.) reflects the logged-in state immediately.

### `src/middleware.ts`

API routes (`/api/user/*`) now return `401 JSON` instead of `302 redirect` when unauthenticated. Prevents 405 errors on DELETE/POST from auth redirects to HTML pages.

### `src/app/auth/callback/route.ts`

Fixed OAuth callback cookie loss: replaced `NextResponse.next({ request })` with `NextResponse.redirect()` to ensure cookies set via `setAll` are included in the redirect response.

### `src/app/institutions/[cik]/page.tsx`

Added `isCheckingTracked` state to prevent flash of "Track Fund" before the API returns the tracked status.

## Key Lesson

With Supabase SSR, **session cookies must be set server-side**. Browser-only `signInWithPassword` stores in localStorage only — it cannot authenticate subsequent API requests from the server/middleware. Always use a Server Route to perform the actual authentication when you need HTTP-only session cookies.
