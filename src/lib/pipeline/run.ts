// Pipeline CLI — Run the 13F data pipeline
// Usage: npm run pipeline:run -- --cik 0001067983 --quarter 2025-Q4
//
// Fetches a single institution + quarter from SEC EDGAR, parses the 13F filing,
// applies stock split adjustments, and upserts to the database.

import { parseArgs } from 'util'
import { runPipeline } from './index'

async function main() {
  const { values } = parseArgs({
    options: {
      cik: { type: 'string' },
      quarter: { type: 'string' },
      'all': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })

  if (values.help) {
    console.log(`
13F Pipeline CLI

Usage:
  npm run pipeline:run -- --cik 0001067983 --quarter 2025-Q4
  npm run pipeline:run -- --all                               # run for all seeded institutions

Options:
  --cik      10-digit zero-padded SEC CIK
  --quarter  Quarter in YYYY-QN format (e.g. 2025-Q4)
  --all      Run for all institutions in the database
`)
    process.exit(0)
  }

  if (values.all) {
    console.log('[pipeline] Running for all seeded institutions (last 4 quarters)...')
    // This would import the institution list and run for each
    // For now, just show the message
    console.log('[pipeline] TODO: implement --all flag with seeded institution list')
    process.exit(0)
  }

  if (!values.cik || !values.quarter) {
    console.error('[pipeline] Error: --cik and --quarter are required')
    process.exit(1)
  }

  console.log(`[pipeline] Starting: CIK=${values.cik}, quarter=${values.quarter}`)

  try {
    const result = await runPipeline(values.cik, values.quarter)
    console.log(`[pipeline] ✅ Success! Processed ${result.holdingsProcessed} holdings`)
    console.log(`[pipeline]    Filing: ${result.filingUrl}`)
    console.log(`[pipeline]    Filed:  ${result.filedAt.toISOString()}`)
  } catch (err) {
    console.error(`[pipeline] ❌ Failed:`, err)
    process.exit(1)
  }
}

main()
