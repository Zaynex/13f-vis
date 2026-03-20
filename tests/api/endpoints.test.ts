// API endpoint tests - run against the running Next.js dev server
// These tests verify data accuracy and API contract compliance

import { describe, it, expect, beforeAll } from 'vitest'

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
})
