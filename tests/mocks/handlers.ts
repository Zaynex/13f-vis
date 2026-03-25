// MSW handlers - mock API responses using fixture data
import { http, HttpResponse } from 'msw'
import * as fs from 'fs'
import * as path from 'path'

const fixturesDir = path.join(__dirname, '../fixtures')
const QUARTER_REGEX = /^\d{4}-Q[1-4]$/

function isValidQuarter(q: string): boolean {
  return QUARTER_REGEX.test(q)
}

function loadFixture(name: string) {
  const data = fs.readFileSync(path.join(fixturesDir, `${name}.json`), 'utf-8')
  return JSON.parse(data)
}

function fixtureExists(name: string): boolean {
  return fs.existsSync(path.join(fixturesDir, `${name}.json`))
}

export const handlers = [
  // GET /api/institutions/:cik
  http.get('http://localhost:3000/api/institutions/:cik', ({ params }) => {
    const { cik } = params
    // Only intercept for CIKs with fixture data
    if (!fixtureExists(`institution-${cik}`)) {
      return undefined // bypass to real server
    }
    try {
      const data = loadFixture(`institution-${cik}`)
      return HttpResponse.json(data)
    } catch {
      return HttpResponse.json({ error: 'Institution not found' }, { status: 404 })
    }
  }),

  // GET /api/institutions/:cik/holdings
  http.get('http://localhost:3000/api/institutions/:cik/holdings', ({ params, request }) => {
    const { cik } = params
    const url = new URL(request.url)
    const quarter = url.searchParams.get('quarter')

    // Validate quarter format — fast-fail before fixture lookup
    if (quarter && !isValidQuarter(quarter)) {
      return HttpResponse.json(
        { error: `Invalid quarter format: '${quarter}'. Expected YYYY-QN (e.g. 2025-Q4)` },
        { status: 400 },
      )
    }

    // Only intercept for CIKs with fixture data — let other CIKs pass through to real API
    if (!fixtureExists(`institution-${cik}-holdings`)) {
      return undefined // bypass to real server
    }

    try {
      const data = loadFixture(`institution-${cik}-holdings`)
      return HttpResponse.json(data)
    } catch {
      return HttpResponse.json({ error: 'Holdings not found' }, { status: 404 })
    }
  }),

  // GET /api/tracker/:cik?from=...&to=... or &quarters=...
  http.get('http://localhost:3000/api/tracker/:cik', ({ params, request }) => {
    const { cik } = params
    const url = new URL(request.url)
    const quartersParam = url.searchParams.get('quarters')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const fetchIfMissing = url.searchParams.get('fetchIfMissing') !== 'false'

    // Validate quarter format for single-quarter params
    if (from && !isValidQuarter(from)) {
      return HttpResponse.json(
        { error: 'Invalid parameters', details: { from: { _errors: ['Quarter must be YYYY-QN format'] } } },
        { status: 400 },
      )
    }
    if (to && !isValidQuarter(to)) {
      return HttpResponse.json(
        { error: 'Invalid parameters', details: { to: { _errors: ['Quarter must be YYYY-QN format'] } } },
        { status: 400 },
      )
    }

    // Validate quarters array param
    if (quartersParam) {
      const quarters = quartersParam.split(',')
      if (quarters.length < 2) {
        return HttpResponse.json(
          { error: 'At least 2 quarters required for multi-quarter comparison' },
          { status: 400 },
        )
      }
      for (const q of quarters) {
        if (!isValidQuarter(q.trim())) {
          return HttpResponse.json(
            { error: 'Invalid parameters', details: { quarters: { _errors: [`Invalid quarter: '${q.trim()}'`] } } },
            { status: 400 },
          )
        }
      }
    }

    // We only have fixture data for Bridgewater (0001600319)
    // Return undefined to bypass for other CIKs so real API handles them
    if (cik !== '0001600319') {
      return undefined // bypass to real server
    }

    if (url.searchParams.has('quarters')) {
      // Multi-quarter mode
      try {
        const data = loadFixture('tracker-0001600319-quarterly')
        return HttpResponse.json(data)
      } catch {
        return HttpResponse.json({ error: 'Tracker data not found' }, { status: 404 })
      }
    } else {
      // Two-quarter comparison mode
      try {
        const data = loadFixture('tracker-0001600319-two-quarter')
        return HttpResponse.json(data)
      } catch {
        return HttpResponse.json({ error: 'Tracker data not found' }, { status: 404 })
      }
    }
  }),

  // GET /api/compare?ciks=...
  http.get('http://localhost:3000/api/compare', ({ request }) => {
    const url = new URL(request.url)
    // Mock returns the compare data
    try {
      const data = loadFixture('compare-bridgewater-berkshire')
      return HttpResponse.json(data)
    } catch {
      return HttpResponse.json({ error: 'Compare data not found' }, { status: 404 })
    }
  }),
]
