// Pipeline CLI — Run the 13F data pipeline
// Usage: npm run pipeline:run -- --cik 0001067983 --quarter 2025-Q4
//
// Fetches a single institution + quarter from SEC EDGAR, parses the 13F filing,
// applies stock split adjustments, and upserts to the database.

import { parseArgs } from 'util'
import { runPipeline, getAvailableQuarters, getMissingQuarters } from './index'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const { values } = parseArgs({
    options: {
      cik: { type: 'string' },
      quarter: { type: 'string' },
      all: { type: 'boolean' },
      backfill: { type: 'boolean' },
      'max-quarters': { type: 'string' },
      'no-split-adjust': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })

  if (values.help) {
    console.log(`
13F Pipeline CLI

Usage:
  npm run pipeline:run -- --cik 0001067983 --quarter 2025-Q4
  npm run pipeline:run -- --all                               # run for all seeded institutions (recent quarter only)
  npm run pipeline:run -- --all --backfill                    # run for all seeded institutions, ALL available quarters
  npm run pipeline:run -- --all --backfill --max-quarters 8  # limit to last 8 quarters
  npm run pipeline:run -- --cik 0001067983 --backfill --no-split-adjust  # skip Yahoo Finance split data

Options:
  --cik              10-digit zero-padded SEC CIK
  --quarter          Quarter in YYYY-QN format (e.g. 2025-Q4)
  --all              Run for all institutions in the database
  --backfill         Fetch ALL available historical quarters (not just recent)
  --max-quarters     Limit how many quarters to backfill (default: unlimited)
  --no-split-adjust Skip Yahoo Finance split adjustment (use raw shares)
`)
    process.exit(0)
  }

  const skipSplitAdjustment = values['no-split-adjust'] ?? false

  if (skipSplitAdjustment) {
    console.log('[pipeline] Note: Skipping Yahoo Finance split adjustment (using raw shares)')
  }

  if (values.all) {
    await runAllInstitutions({
      backfill: values.backfill ?? false,
      maxQuarters: values['max-quarters'] ? parseInt(values['max-quarters'], 10) : undefined,
      skipSplitAdjustment,
    })
    return
  }

  if (!values.cik) {
    console.error('[pipeline] Error: --cik is required')
    process.exit(1)
  }

  // Single CIK mode: with --backfill, fetch all available quarters
  if (values.backfill) {
    await runSingleInstitutionBackfill(values.cik, {
      maxQuarters: values['max-quarters'] ? parseInt(values['max-quarters'], 10) : undefined,
      skipSplitAdjustment,
    })
    return
  }

  if (!values.quarter) {
    console.error('[pipeline] Error: --quarter is required (or use --backfill to fetch all quarters)')
    process.exit(1)
  }

  console.log(`[pipeline] Starting: CIK=${values.cik}, quarter=${values.quarter}`)

  try {
    const result = await runPipeline(values.cik, values.quarter, { skipSplitAdjustment })
    console.log(`[pipeline] ✅ Success! Processed ${result.holdingsProcessed} holdings`)
    console.log(`[pipeline]    Filing: ${result.filingUrl}`)
    console.log(`[pipeline]    Filed:  ${result.filedAt.toISOString()}`)
  } catch (err) {
    console.error(`[pipeline] ❌ Failed:`, err)
    process.exit(1)
  }
}

interface RunAllOptions {
  backfill: boolean
  maxQuarters?: number
  skipSplitAdjustment: boolean
}

async function runAllInstitutions(options: RunAllOptions): Promise<void> {
  const { backfill, maxQuarters, skipSplitAdjustment } = options

  // Get all institutions from DB
  const institutions = await prisma.institution.findMany({
    orderBy: { name: 'asc' },
  })

  console.log(`[pipeline] Found ${institutions.length} institutions in database`)
  console.log(`[pipeline] Mode: ${backfill ? 'FULL BACKFILL (all available quarters)' : 'RECENT QUARTER ONLY'}`)

  if (maxQuarters) {
    console.log(`[pipeline] Max quarters per institution: ${maxQuarters}`)
  }

  let totalProcessed = 0
  let totalFailed = 0
  const failed: Array<{ cik: string; quarter: string; error: string }> = []

  for (const inst of institutions) {
    console.log(`\n[pipeline] Processing ${inst.name} (${inst.cik})...`)

    try {
      if (backfill) {
        // Get all available quarters from SEC EDGAR
        console.log(`[pipeline]   Fetching available quarters from SEC EDGAR...`)
        const available = await getAvailableQuarters(inst.cik)
        console.log(`[pipeline]   Found ${available.length} total quarters on SEC EDGAR`)

        // Filter to max quarters if specified
        const quartersToFetch = maxQuarters ? available.slice(0, maxQuarters) : available
        console.log(`[pipeline]   Will fetch ${quartersToFetch.length} quarters`)

        // Get missing quarters
        const missing = await getMissingQuarters(inst.cik, quartersToFetch)
        console.log(`[pipeline]   Missing in DB: ${missing.length} quarters`)

        if (missing.length === 0) {
          console.log(`[pipeline]   ✅ Already up to date!`)
          continue
        }

        // Fetch missing quarters
        for (const quarter of missing) {
          process.stdout.write(`[pipeline]   Fetching ${quarter}... `)
          try {
            const result = await runPipeline(inst.cik, quarter, { skipSplitAdjustment })
            console.log(`✅ ${result.holdingsProcessed} holdings`)
            totalProcessed++
          } catch (err) {
            console.log(`❌ ${err instanceof Error ? err.message : String(err)}`)
            totalFailed++
            failed.push({ cik: inst.cik, quarter, error: String(err) })
          }
        }
      } else {
        // Just fetch most recent quarter
        const available = await getAvailableQuarters(inst.cik)
        if (available.length === 0) {
          console.log(`[pipeline]   ⚠️ No 13F filings found on SEC EDGAR`)
          continue
        }

        const recentQuarter = available[0]
        const missing = await getMissingQuarters(inst.cik, [recentQuarter])

        if (missing.length === 0) {
          console.log(`[pipeline]   ✅ ${recentQuarter} already up to date!`)
          continue
        }

        process.stdout.write(`[pipeline]   Fetching ${recentQuarter}... `)
        try {
          const result = await runPipeline(inst.cik, recentQuarter, { skipSplitAdjustment })
          console.log(`✅ ${result.holdingsProcessed} holdings`)
          totalProcessed++
        } catch (err) {
          console.log(`❌ ${err instanceof Error ? err.message : String(err)}`)
          totalFailed++
          failed.push({ cik: inst.cik, quarter: recentQuarter, error: String(err) })
        }
      }
    } catch (err) {
      console.error(`[pipeline]   ❌ Failed to process: ${err instanceof Error ? err.message : String(err)}`)
      totalFailed++
    }
  }

  console.log(`\n[pipeline] ═══════════════════════════════════════════`)
  console.log(`[pipeline] Summary:`)
  console.log(`[pipeline]   Processed: ${totalProcessed} filings`)
  if (totalFailed > 0) {
    console.log(`[pipeline]   Failed:    ${totalFailed} filings`)
    console.log(`[pipeline]   Failures:`)
    for (const f of failed) {
      console.log(`[pipeline]     - ${f.cik} ${f.quarter}: ${f.error}`)
    }
  }
  console.log(`[pipeline] ═══════════════════════════════════════════`)
}

interface SingleBackfillOptions {
  maxQuarters?: number
  skipSplitAdjustment: boolean
}

async function runSingleInstitutionBackfill(cik: string, options: SingleBackfillOptions): Promise<void> {
  const { maxQuarters, skipSplitAdjustment } = options

  console.log(`[pipeline] Backfilling CIK=${cik}...`)

  try {
    console.log(`[pipeline]   Fetching available quarters from SEC EDGAR...`)
    const available = await getAvailableQuarters(cik)
    console.log(`[pipeline]   Found ${available.length} total quarters on SEC EDGAR`)

    const quartersToFetch = maxQuarters ? available.slice(0, maxQuarters) : available
    console.log(`[pipeline]   Will fetch ${quartersToFetch.length} quarters`)

    const missing = await getMissingQuarters(cik, quartersToFetch)
    console.log(`[pipeline]   Missing in DB: ${missing.length} quarters`)

    if (missing.length === 0) {
      console.log(`[pipeline] ✅ Already up to date!`)
      return
    }

    let totalProcessed = 0
    let totalFailed = 0
    const failed: Array<{ quarter: string; error: string }> = []

    for (const quarter of missing) {
      process.stdout.write(`[pipeline]   Fetching ${quarter}... `)
      try {
        const result = await runPipeline(cik, quarter, { skipSplitAdjustment })
        console.log(`✅ ${result.holdingsProcessed} holdings`)
        totalProcessed++
      } catch (err) {
        console.log(`❌ ${err instanceof Error ? err.message : String(err)}`)
        totalFailed++
        failed.push({ quarter, error: String(err) })
      }
    }

    console.log(`\n[pipeline] ═══════════════════════════════════════════`)
    console.log(`[pipeline]   Processed: ${totalProcessed} filings`)
    if (totalFailed > 0) {
      console.log(`[pipeline]   Failed:    ${totalFailed} filings`)
      for (const f of failed) {
        console.log(`[pipeline]     - ${f.quarter}: ${f.error}`)
      }
    }
    console.log(`[pipeline] ═══════════════════════════════════════════`)
  } catch (err) {
    console.error(`[pipeline] ❌ Failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
