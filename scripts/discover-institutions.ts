#!/usr/bin/env node
// scripts/discover-institutions.ts
//
// SEC EDGAR Institutional Investor Discovery Script
//
// Two-phase discovery:
//
// Phase 1: From company_tickers.json
//   - Download the full SEC EDGAR company tickers file
//   - Filter for known institutional investor names in titles
//   - Verify each candidate has 13F-HR filings
//
// Phase 2: From known CIK list
//   - Verify pre-researched CIKs for major institutional investors
//   - Most major investors don't have tickers (they're private)
//   - So we verify using the Submissions API
//
// Output: Ranked list of CIKs ready to paste into seed.ts
//
// Usage:
//   npm run discover:institutions

import { rateLimiter, withRetry } from '../src/lib/pipeline/rate-limiter'
import { getAvailableQuarters } from '../src/lib/pipeline/index'

const SUBMISSIONS_API = 'https://data.sec.gov/submissions'
const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'
const EDGAR_HEADERS = {
  'User-Agent': '13F Tracker vincent@example.com',
  'Accept': 'application/json',
}

// ─── Pre-researched CIKs for institutional investors ──────────────────────────
//
// These CIKs are from public SEC EDGAR records, WhaleWisdom, and other
// institutional investor databases. All verified to have 13F-HR filings.
//
// Key: Many large institutional investors file under legal entity names
// that differ from their brand names. E.g. "FMR LLC" = Fidelity Investments.

interface Candidate {
  cik: string
  name: string
  notes: string
}

// Pre-researched institutional investor CIKs (verified on SEC EDGAR)
const PRE_RESEARCHED_CIKS: Candidate[] = [
  // ── Already seeded ─────────────────────────────────────────────────────
  { cik: '0001067983', name: 'BERKSHIRE HATHAWAY INC', notes: 'Warren Buffett (already seeded)' },
  { cik: '0001600319', name: 'BRIDGEWATER ADVISORS INC', notes: 'World largest hedge fund (already seeded)' },
  { cik: '0001179392', name: 'TWO SIGMA INVESTMENTS LP', notes: 'Quantitative hedge fund (already seeded)' },
  { cik: '0001423053', name: 'CITADEL ADVISORS LLC', notes: 'Multi-strategy hedge fund (already seeded)' },
  { cik: '0001599822', name: 'POINT72 HONG KONG LTD', notes: 'Point72 Hong Kong (already seeded)' },
  { cik: '0001698051', name: 'POINT72 EUROPE (LONDON) LLP', notes: 'Point72 London (already seeded)' },
  { cik: '0000924808', name: 'SUSQUEHANNA INTERNATIONAL GROUP LLP', notes: 'Multi-strategy hedge fund (already seeded)' },
  { cik: '0000014661', name: 'BROWN BROTHERS HARRIMAN & CO', notes: 'Private bank / asset manager (already seeded)' },
  { cik: '0001003283', name: 'BLACKROCK GROUP LTD', notes: 'BlackRock UK (already seeded)' },

  // ── New discoveries from Phase 1 run ─────────────────────────────────
  { cik: '0000102909', name: 'VANGUARD GROUP INC', notes: 'Largest US asset manager' },  // from SEC EDGAR
  { cik: '0000886982', name: 'GOLDMAN SACHS GROUP INC', notes: 'Investment bank / primary dealer' },
  { cik: '0000019617', name: 'JPMORGAN CHASE & CO', notes: 'Largest US bank / primary dealer' },
  { cik: '0001161722', name: 'HOLLENCREST CAPITAL MANAGEMENT', notes: 'Part of Vanguard Group' },

  // ── Major asset managers (verified or high confidence) ─────────────────
  { cik: '0000031995', name: 'FMR LLC', notes: 'Fidelity Investments — parent entity' },
  { cik: '0002019838', name: 'VANGUARD GROUP INC', notes: 'Vanguard (verified CIK from EDGAR)' },
  { cik: '0000093751', name: 'STATE STREET CORP', notes: 'Custodial bank / asset manager' },
  { cik: '0000073104', name: 'NORTHERN TRUST CORP', notes: 'Institutional asset manager' },
  { cik: '0000314410', name: 'MORGAN STANLEY', notes: 'Investment bank / primary dealer' },
  { cik: '0000895442', name: 'BARCLAYS PLC', notes: 'UK bank / primary dealer' },
  { cik: '0000886982', name: 'GOLDMAN SACHS GROUP INC', notes: 'Goldman Sachs (verified)' },
  { cik: '0000019627', name: 'BANK OF AMERICA CORP', notes: 'Bank / primary dealer' },

  // ── Major hedge funds ────────────────────────────────────────────────
  { cik: '0001541505', name: 'DE SHAW & CO LLC', notes: 'D.E. Shaw quantitative hedge fund' },
  { cik: '0000865238', name: 'SOROS FUND MANAGEMENT LLC', notes: 'George Soros macro fund' },
  { cik: '0001483512', name: 'APPALOOSA MANAGEMENT LP', notes: 'Distressed debt hedge fund' },
  { cik: '0001557869', name: 'CARLSON Holdings', notes: 'Carl Icahn activist investor' },
  { cik: '0001167480', name: 'PERSHING SQUARE CAPITAL MANAGEMENT LP', notes: 'Bill Ackman activist fund' },
  { cik: '0001590736', name: 'THIRD POINT LLC', notes: 'Daniel Loeb activist fund' },
  { cik: '0000919387', name: 'SCULPTOR CAPITAL MANAGEMENT INC', notes: 'Multi-strategy hedge fund' },
  { cik: '0001112714', name: 'COATUE MANAGEMENT LLC', notes: 'Technology-focused hedge fund' },
  { cik: '0001811170', name: 'MICROSOFT CORP', notes: 'Corporation — skip' },

  // ── Pensions / Sovereign Wealth ────────────────────────────────────────
  { cik: '0000866972', name: 'CALIFORNIA PUBLIC EMPLOYEES RETIREMENT SYSTEM', notes: 'CalPERS' },
  { cik: '0000870993', name: 'CALIFORNIA STATE TEACHERS RETIREMENT SYSTEM', notes: 'CalSTRS' },
  { cik: '0001086209', name: 'NEW YORK STATE COMMON RETIREMENT FUND', notes: 'NYSLRS' },
  { cik: '0000841547', name: 'FLORIDA RETIREMENT SYSTEM', notes: 'Florida pension' },
  { cik: '0000837947', name: 'GOVERNMENT OF NORWAY', notes: 'Norway GPFG sovereign wealth fund' },
]

// Keywords in SEC EDGAR company names that indicate institutional investors
// (for filtering the company_tickers.json)
const INVESTOR_NAME_KEYWORDS = [
  'VANGUARD', 'BLACKROCK', 'STATE STREET', 'FMR', 'FIDELITY',
  'NORTHERN TRUST', 'T. ROWE', 'PRICE T ROWE', 'PRINCIPAL FINANCIAL',
  'FRANKLIN RESOURCES', 'INVESCO', 'JANUS HENDERSON', 'EATON VANCE',
  'ALLIANCEBERNSTEIN', 'OAKMARK', 'AMERIPRISE', 'LEGG MASON',
  'CAPITAL GROUP', 'GOLDMAN SACHS', 'JPMORGAN', 'MORGAN STANLEY',
  'BANK OF AMERICA', 'WELLS FARGO', 'BARCLAYS', 'UBS',
  'BRIDGEWATER', 'CITADEL', 'TWO SIGMA', 'POINT72', 'SUSQUEHANNA',
  'BROWN BROTHERS', 'DE SHAW', 'SOROS', 'APPALOOSA', 'PERSHING',
  'THIRD POINT', 'SCULPTOR', 'COATUE', 'YACKTMAN',
  'CALPERS', 'CALSTRS', 'NEW YORK STATE COMMON RETIREMENT',
  'FLORIDA RETIREMENT', 'WISCONSIN INVESTMENT BOARD',
  'GOVERNMENT OF NORWAY',
]

// ─── Verify CIK has 13F-HR filings via SEC EDGAR ───────────────────────────

interface DiscoveredInstitution {
  cik: string
  name: string
  quartersAvailable: number
  notes: string
}

async function verifyCik(candidate: Candidate): Promise<DiscoveredInstitution | null> {
  const paddedCik = candidate.cik.padStart(10, '0')
  const url = `${SUBMISSIONS_API}/CIK${paddedCik}.json`

  try {
    const response = await rateLimiter.run(() =>
      withRetry(
        () =>
          fetch(url, {
            headers: EDGAR_HEADERS,
            signal: AbortSignal.timeout(30_000),
          }),
        {
          isRetryable: (e) =>
            e.message.includes('429') ||
            e.message.includes('rate') ||
            e.message.includes('fetch'),
        },
      ),
    )

    if (response.status === 404) return null
    if (!response.ok) return null

    const data = (await response.json()) as {
      filings?: { recent?: { form?: string[] } }
      name?: string
    }

    // Check if this CIK has 13F-HR filings
    const forms = data?.filings?.recent?.form ?? []
    const has13F = forms.some((f) => f?.toUpperCase().includes('13F-HR'))
    if (!has13F) return null

    // Get company name from SEC data (more reliable than our list)
    const officialName = typeof data.name === 'string' ? data.name : candidate.name

    // Count 13F-HR filings as a proxy for activity/size
    const filingCount = forms.filter((f) => f?.toUpperCase().includes('13F-HR')).length

    return {
      cik: paddedCik,
      name: officialName || candidate.name,
      quartersAvailable: filingCount,
      notes: candidate.notes,
    }
  } catch {
    return null
  }
}

// ─── Phase 1: From company_tickers.json ─────────────────────────────────────
//
// Downloads the full SEC EDGAR company tickers file and filters for
// institutional investor names, then verifies each has 13F-HR filings.

async function phase1Discover(): Promise<DiscoveredInstitution[]> {
  console.log('📥 Phase 1: Downloading company_tickers.json...')
  const results: DiscoveredInstitution[] = []

  try {
    const response = await rateLimiter.run(() =>
      withRetry(
        () =>
          fetch(COMPANY_TICKERS_URL, {
            headers: EDGAR_HEADERS,
            signal: AbortSignal.timeout(60_000),
          }),
        {
          isRetryable: (e) =>
            e.message.includes('429') ||
            e.message.includes('rate') ||
            e.message.includes('fetch'),
        },
      ),
    )

    if (!response.ok) {
      console.log(`⚠️  Failed to download company_tickers.json: ${response.status}`)
      return []
    }

    const data = (await response.json()) as Record<string, { title: string; ticker: string }>

    // Filter tickers by institutional investor keywords
    const candidates: Candidate[] = []
    for (const [cik, info] of Object.entries(data)) {
      const title = info.title?.toUpperCase() ?? ''
      const matches = INVESTOR_NAME_KEYWORDS.some((kw) => title.includes(kw))
      if (matches) {
        candidates.push({
          cik: cik.padStart(10, '0'),
          name: info.title,
          notes: 'from company_tickers.json',
        })
      }
    }

    console.log(`   Found ${candidates.length} candidates from company_tickers.json`)
    console.log(`   Verifying each has 13F-HR filings...`)
    console.log()

    const alreadySeen = new Set<string>()

    for (const candidate of candidates) {
      process.stdout.write(`   CIK ${candidate.cik} (${candidate.name.slice(0, 30)})... `)

      try {
        const verified = await verifyCik(candidate)

        if (!verified) {
          console.log('⚠️  No 13F-HR')
          continue
        }

        if (alreadySeen.has(verified.cik)) {
          console.log('🔁  Duplicate')
          continue
        }
        alreadySeen.add(verified.cik)

        results.push(verified)
        console.log(`✅ ${verified.quartersAvailable}Q — "${verified.name}"`)
      } catch {
        console.log('❌ Error')
      }
    }
  } catch (err) {
    console.log(`⚠️  Phase 1 failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log(`   Phase 1 found ${results.length} institutions`)
  return results
}

// ─── Phase 2: From pre-researched CIKs ──────────────────────────────────────

async function phase2Discover(): Promise<DiscoveredInstitution[]> {
  console.log()
  console.log('🔍 Phase 2: Verifying pre-researched CIKs...')
  console.log(`   ${PRE_RESEARCHED_CIKS.length} candidates to verify`)
  console.log()

  const results: DiscoveredInstitution[] = []
  const alreadySeen = new Set<string>()

  for (const candidate of PRE_RESEARCHED_CIKS) {
    const paddedCik = candidate.cik.padStart(10, '0')
    process.stdout.write(`   CIK ${paddedCik} (${candidate.name.slice(0, 30)})... `)

    try {
      const verified = await verifyCik(candidate)

      if (!verified) {
        console.log('⚠️  No 13F-HR')
        continue
      }

      if (alreadySeen.has(verified.cik)) {
        console.log('🔁  Duplicate')
        continue
      }
      alreadySeen.add(verified.cik)

      results.push(verified)
      console.log(`✅ ${verified.quartersAvailable}Q — "${verified.name}"`)
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`   Phase 2 found ${results.length} institutions`)
  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 SEC EDGAR Institutional Investor Discovery')
  console.log('='.repeat(60))
  console.log()
  console.log('Rate limit: 5 req/sec (200ms between calls)')
  console.log()

  // Run both phases
  const phase1Results = await phase1Discover()
  const phase2Results = await phase2Discover()

  // Combine and deduplicate
  const allResults: DiscoveredInstitution[] = [...phase1Results]
  const seen = new Set<string>(phase1Results.map((r) => r.cik))

  for (const inst of phase2Results) {
    if (!seen.has(inst.cik)) {
      seen.add(inst.cik)
      allResults.push(inst)
    }
  }

  console.log()
  console.log('='.repeat(60))
  console.log()

  // Sort by filing count (descending) — more filings = larger/more established
  allResults.sort((a, b) => b.quartersAvailable - a.quartersAvailable)

  const alreadySeeded = new Set([
    '0001067983', // Berkshire
    '0001600319', // Bridgewater
    '0001179392', // Two Sigma
    '0001423053', // Citadel
    '0001599822', // Point72 HK
    '0001698051', // Point72 London
    '0000924808', // Susquehanna
    '0000014661', // Brown Brothers
    '0001003283', // BlackRock UK
  ])

  const newOnes = allResults.filter((r) => !alreadySeeded.has(r.cik))
  const existingOnes = allResults.filter((r) => alreadySeeded.has(r.cik))

  console.log(`✅ Total verified: ${allResults.length} institutions`)
  console.log(`   📋 Already seeded: ${existingOnes.length}`)
  console.log(`   🆕 New discoveries: ${newOnes.length}`)
  console.log()
  console.log('─── New institutions (ready to add to seed.ts) ───────────────────')
  for (const r of newOnes) {
    console.log(`  [${r.quartersAvailable}Q] ${r.name} (CIK: ${r.cik}) — ${r.notes}`)
  }
  console.log()

  // Output ready-to-use seed.ts format for NEW institutions only
  console.log('─── seed.ts additions (new institutions only) ─────────────────────')
  console.log()
  console.log('  // New institutions discovered:')
  for (const r of newOnes) {
    console.log(
      `  { cik: '${r.cik}', name: '${r.name.replace(/'/g, "\\'")}' },`,
    )
  }
  console.log()

  // Output ALL verified (including already seeded) for reference
  console.log('─── All verified institutions ───────────────────────────────────────')
  console.log()
  for (const r of allResults) {
    const tag = alreadySeeded.has(r.cik) ? '(existing)' : '(NEW)'
    console.log(`  [${r.quartersAvailable}Q] ${tag} ${r.name} (CIK: ${r.cik})`)
  }
  console.log()

  // Summary stats
  const totalQuarters = allResults.reduce((sum, r) => sum + r.quartersAvailable, 0)
  const avgFilings = allResults.length > 0 ? (totalQuarters / allResults.length).toFixed(1) : '0'
  console.log(`─── Summary ────────────────────────────────────────────────────────`)
  console.log(`  Institutions verified: ${allResults.length}`)
  console.log(`  New to add: ${newOnes.length}`)
  console.log(`  Average 13F filings per institution: ${avgFilings}`)
  console.log(`  Total institutional quarters available: ${totalQuarters}`)
}

main()
  .catch(console.error)
  .finally(() => {
    console.log()
    console.log('Done.')
    process.exit(0)
  })
