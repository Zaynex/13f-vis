// MSW handlers - mock API responses using fixture data
import { http, HttpResponse } from 'msw'
import * as fs from 'fs'
import * as path from 'path'

const fixturesDir = path.join(__dirname, '../fixtures')

function loadFixture(name: string) {
  const data = fs.readFileSync(path.join(fixturesDir, `${name}.json`), 'utf-8')
  return JSON.parse(data)
}

export const handlers = [
  // GET /api/institutions/:cik
  http.get('http://localhost:3000/api/institutions/:cik', ({ params }) => {
    const { cik } = params
    try {
      const data = loadFixture(`institution-${cik}`)
      return HttpResponse.json(data)
    } catch {
      return HttpResponse.json({ error: 'Institution not found' }, { status: 404 })
    }
  }),

  // GET /api/institutions/:cik/holdings
  http.get('http://localhost:3000/api/institutions/:cik/holdings', ({ params }) => {
    const { cik } = params
    try {
      const data = loadFixture(`institution-${cik}-holdings`)
      return HttpResponse.json(data)
    } catch {
      return HttpResponse.json({ error: 'Holdings not found' }, { status: 404 })
    }
  }),

  // GET /api/tracker/:cik?from=...&to=... or &quarters=...
  http.get('http://localhost:3000/api/tracker/:cik', ({ params, request }) => {
    const url = new URL(request.url)
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
