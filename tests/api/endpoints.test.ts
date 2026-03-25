// API endpoint tests - run against the running Next.js dev server
// These tests verify data accuracy and API contract compliance

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'

interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  ok: boolean
}

async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`)
    const data = await res.json()
    return { data, ok: res.ok, error: res.ok ? undefined : data.error }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

describe('API Endpoints - Data Accuracy Tests', () => {
  describe('GET /api/institutions/[cik]', () => {
    it('returns valid institution data for Bridgewater', async () => {
      const { data, ok, error } = await apiGet('/api/institutions/0001600319')
      expect(ok, error).toBe(true)
      expect(data).toMatchObject({
        institution: {
          cik: '0001600319',
          name: expect.stringContaining('BRIDGEWATER'),
        },
        filings: expect.any(Array),
      })
      expect(data.filings.length).toBeGreaterThan(0)
    })

    it('returns 404 for non-existent institution', async () => {
      const res = await fetch(`${BASE_URL}/api/institutions/9999999999`)
      expect(res.ok).toBe(false)
    })
  })

  describe('GET /api/institutions/[cik]/holdings', () => {
    it('returns holdings array with required fields', async () => {
      const { data, ok, error } = await apiGet('/api/institutions/0001600319/holdings')
      expect(ok, error).toBe(true)
      expect(data).toMatchObject({
        holdings: expect.any(Array),
      })

      if (data.holdings.length > 0) {
        const holding = data.holdings[0]
        expect(holding).toMatchObject({
          cusip: expect.stringMatching(/^[A-Z0-9]{9}$/),
          companyName: expect.any(String),
          adjustedShares: expect.any(Number),
          rawValue: expect.any(Number),
        })
      }
    })
  })

  describe('GET /api/tracker/[cik]', () => {
    it('returns two-quarter comparison data', async () => {
      const { data, ok, error } = await apiGet('/api/tracker/0001600319?from=2025-Q3&to=2025-Q4')
      expect(ok, error).toBe(true)
      expect(data).toMatchObject({
        institution: { cik: '0001600319' },
        from: expect.objectContaining({ quarter: '2025-Q3' }),
        to: expect.objectContaining({ quarter: '2025-Q4' }),
        diff: expect.objectContaining({
          new: expect.any(Array),
          exited: expect.any(Array),
          increased: expect.any(Array),
          decreased: expect.any(Array),
          unchanged: expect.any(Array),
        }),
        summary: expect.objectContaining({
          newCount: expect.any(Number),
          exitedCount: expect.any(Number),
          increasedCount: expect.any(Number),
          decreasedCount: expect.any(Number),
        }),
      })
    })

    it('returns multi-quarter data when quarters param provided', async () => {
      const { data, ok, error } = await apiGet(
        '/api/tracker/0001600319?quarters=2025-Q4,2025-Q3,2025-Q2,2025-Q1'
      )
      expect(ok, error).toBe(true)
      expect(data).toMatchObject({
        quarters: ['2025-Q4', '2025-Q3', '2025-Q2', '2025-Q1'],
        holdings: expect.any(Array),
      })
    })

    it('data accuracy: NEW positions should have no prior quarter data', async () => {
      const { data } = await apiGet('/api/tracker/0001600319?from=2025-Q3&to=2025-Q4')
      for (const entry of data.diff.new) {
        expect(entry.fromShares).toBeNull()
        expect(entry.toShares).toBeGreaterThan(0)
      }
    })

    it('data accuracy: EXITED positions should have no current quarter data', async () => {
      const { data } = await apiGet('/api/tracker/0001600319?from=2025-Q3&to=2025-Q4')
      for (const entry of data.diff.exited) {
        expect(entry.toShares).toBeNull()
        expect(entry.fromShares).toBeGreaterThan(0)
      }
    })

    it('data accuracy: INCREASED positions should show positive delta', async () => {
      const { data } = await apiGet('/api/tracker/0001600319?from=2025-Q3&to=2025-Q4')
      for (const entry of data.diff.increased) {
        expect(entry.deltaShares).toBeGreaterThan(0)
        expect(entry.deltaPercent).toBeGreaterThan(0)
      }
    })

    it('data accuracy: DECREASED positions should show negative delta', async () => {
      const { data } = await apiGet('/api/tracker/0001600319?from=2025-Q3&to=2025-Q4')
      for (const entry of data.diff.decreased) {
        expect(entry.deltaShares).toBeLessThan(0)
        expect(entry.deltaPercent).toBeLessThan(0)
      }
    })

    it('data accuracy: changeType should match delta direction', async () => {
      const { data } = await apiGet('/api/tracker/0001600319?from=2025-Q3&to=2025-Q4')

      const allEntries = [
        ...data.diff.new.map((e: typeof data.diff.new[0]) => ({ ...e, type: 'NEW' })),
        ...data.diff.exited.map((e: typeof data.diff.exited[0]) => ({ ...e, type: 'EXITED' })),
        ...data.diff.increased.map((e: typeof data.diff.increased[0]) => ({ ...e, type: 'INCREASED' })),
        ...data.diff.decreased.map((e: typeof data.diff.decreased[0]) => ({ ...e, type: 'DECREASED' })),
        ...data.diff.unchanged.map((e: typeof data.diff.unchanged[0]) => ({ ...e, type: 'UNCHANGED' })),
      ]

      for (const entry of allEntries) {
        // Verify changeType is consistent with deltaShares
        if (entry.changeType === 'INCREASED') {
          expect(entry.deltaShares).toBeGreaterThan(0)
        }
        if (entry.changeType === 'DECREASED') {
          expect(entry.deltaShares).toBeLessThan(0)
        }
      }
    })
  })

  describe('GET /api/compare', () => {
    it('returns comparison data for multiple institutions', async () => {
      const { data, ok, error } = await apiGet(
        '/api/compare?ciks=0001600319,0001067983&quarter=2025-Q4'
      )
      expect(ok, error).toBe(true)
      expect(data).toMatchObject({
        quarter: '2025-Q4',
        institutions: expect.any(Array),
      })
    })

    it('returns holdings for each institution', async () => {
      const { data } = await apiGet(
        '/api/compare?ciks=0001600319,0001067983&quarter=2025-Q4'
      )
      expect(data.institutions.length).toBe(2)
      // Each institution should have holdingCount
      for (const inst of data.institutions) {
        expect(inst.holdingCount).toBeGreaterThan(0)
      }
      // uniqueByFund should have holdings for each cik
      expect(data.uniqueByFund).toBeDefined()
      expect(Object.keys(data.uniqueByFund).length).toBe(2)
    })
  })

  describe('Dynamic Query Mode - /api/institutions/[cik]/holdings', () => {
    // Format validation — fast-fail before any SEC EDGAR call
    it('returns 400 for invalid quarter format', async () => {
      const res = await fetch(`${BASE_URL}/api/institutions/0001067983/holdings?quarter=2025-Q9`)
      expect(res.ok).toBe(false)
      const data = await res.json()
      expect(res.status).toBe(400)
      expect(data.error).toMatch(/Invalid quarter format/)
    })

    it('returns 400 for non-quarter string', async () => {
      const res = await fetch(`${BASE_URL}/api/institutions/0001067983/holdings?quarter=junk`)
      expect(res.ok).toBe(false)
      expect(res.status).toBe(400)
    })

    it('returns 400 for malformed quarter (missing Q)', async () => {
      const res = await fetch(`${BASE_URL}/api/institutions/0001067983/holdings?quarter=2025-4`)
      expect(res.ok).toBe(false)
      expect(res.status).toBe(400)
    })

    // fetchIfMissing=false — returns 200 with empty holdings when quarter not in DB
    it('returns 200 with filing:null when quarter not in DB and fetchIfMissing=false', async () => {
      const res = await fetch(
        `${BASE_URL}/api/institutions/0001067983/holdings?quarter=2099-Q1&fetchIfMissing=false`
      )
      expect(res.ok).toBe(true)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.institution).toBeDefined()
      expect(data.filing).toBeNull()
      expect(data.holdings).toEqual([])
      expect(data.message).toMatch(/No filing found/)
    })

    // Institution not found — 404 before attempting fetch
    it('returns 404 for non-existent institution', async () => {
      const res = await fetch(`${BASE_URL}/api/institutions/9999999999/holdings`)
      expect(res.ok).toBe(false)
      expect(res.status).toBe(404)
    })

  })

  describe('Dynamic Query Mode - /api/tracker/[cik]', () => {
    // Format validation — fast-fail before any SEC EDGAR call
    it('returns 400 for invalid quarter in from/to params', async () => {
      const res = await fetch(
        `${BASE_URL}/api/tracker/0001067983?from=2025-Q9&to=2025-Q4`
      )
      expect(res.ok).toBe(false)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toMatch(/Invalid parameters/)
    })

    it('returns 400 for invalid quarter in quarters param', async () => {
      const res = await fetch(
        `${BASE_URL}/api/tracker/0001067983?quarters=2025-Q1,invalid-quarter`
      )
      expect(res.ok).toBe(false)
      expect(res.status).toBe(400)
    })

    it('returns 400 when only one quarter provided in multi-quarter mode', async () => {
      const res = await fetch(
        `${BASE_URL}/api/tracker/0001067983?quarters=2025-Q1`
      )
      expect(res.ok).toBe(false)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toMatch(/[Aa]t least 2 quarters/)
    })

    // fetchIfMissing=false + missing quarter → 404 with availableQuarters
    it('returns 404 when from quarter missing and fetchIfMissing=false', async () => {
      const res = await fetch(
        `${BASE_URL}/api/tracker/0001067983?from=2099-Q1&to=2025-Q4&fetchIfMissing=false`
      )
      expect(res.ok).toBe(false)
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.availableQuarters).toBeDefined()
    })

    it('returns 404 when to quarter missing and fetchIfMissing=false', async () => {
      const res = await fetch(
        `${BASE_URL}/api/tracker/0001067983?from=2025-Q4&to=2099-Q1&fetchIfMissing=false`
      )
      expect(res.ok).toBe(false)
      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.availableQuarters).toBeDefined()
    })
  })
})
