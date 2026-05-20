import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('split adjuster source order', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('uses Yahoo CUSIP lookup before Polygon by default, even when a Polygon key exists', async () => {
    vi.stubEnv('POLYGON_API_KEY', 'test-polygon-key')
    vi.stubEnv('YAHOO_FINANCE_BASE_URL', 'https://query1.finance.yahoo.com')

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url.startsWith('https://api.polygon.io')) {
        throw new Error(`Polygon should not be called before Yahoo: ${url}`)
      }

      return new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                symbol: '037833100',
                events: {
                  splits: {
                    '1698796800': {
                      date: 1698796800,
                      numerator: 4,
                      denominator: 1,
                    },
                  },
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const { getSplitAdjustedShares } = await import('../../src/lib/pipeline/split-adjuster')

    const result = await getSplitAdjustedShares('037833100', 400, new Date('2026-03-31'))

    expect(result).toEqual({ adjustedShares: 100, cumulativeFactor: 4 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('query1.finance.yahoo.com')
  })
})
