import { describe, expect, it } from 'vitest'
import { getSafeOAuthNextPath } from '@/app/auth/callback/route'

describe('OAuth callback next path handling', () => {
  it('defaults to the watchlist when next is missing', () => {
    expect(getSafeOAuthNextPath(null)).toBe('/watchlist')
    expect(getSafeOAuthNextPath('')).toBe('/watchlist')
  })

  it('keeps relative in-app next paths', () => {
    expect(getSafeOAuthNextPath('/institutions/0001067983')).toBe('/institutions/0001067983')
    expect(getSafeOAuthNextPath('/watchlist?tab=alerts')).toBe('/watchlist?tab=alerts')
  })

  it('rejects external or malformed next paths', () => {
    expect(getSafeOAuthNextPath('https://evil.example/phish')).toBe('/watchlist')
    expect(getSafeOAuthNextPath('//evil.example/phish')).toBe('/watchlist')
    expect(getSafeOAuthNextPath('\\evil.example\\phish')).toBe('/watchlist')
  })
})
