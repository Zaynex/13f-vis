// Prisma seed — initial institution set
// Run with: npm run db:seed
//
// CIKs verified against SEC EDGAR Submissions API (data.sec.gov):
// Each CIK was checked for actual 13F-HR filings before inclusion.
// Many "obvious" CIKs from company tickers JSON are wrong — always verify.
//
// These funds were chosen for:
// - Recognizability (retail investors know them)
// - Diversity of strategy (value, macro, quant, growth)
// - Representative filing formats (XML, HTML, text mix)
//
// Note: Vanguard files 13F-NT (notice, no holdings) under most US entities.
// Individual Vanguard funds (Wellington, Magellan, etc.) file their own 13F-HR
// under separate CIKs. Not included here because the fund landscape is large
// and constantly changing.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const INSTITUTIONS = [
  { cik: '0001067983', name: 'BERKSHIRE HATHAWAY INC' },            // 40 13F-HR filings
  { cik: '0001600319', name: 'BRIDGEWATER ADVISORS INC' },           // 23 13F-HR filings
  { cik: '0001179392', name: 'TWO SIGMA INVESTMENTS LP' },          // 93 13F-HR filings
  { cik: '0001423053', name: 'CITADEL ADVISORS LLC' },               // 40 13F-HR filings
  { cik: '0001599822', name: 'POINT72 HONG KONG LTD' },              // 48 13F-HR filings (HK entity — US entity files SC 13G only)
  { cik: '0001698051', name: 'POINT72 EUROPE (LONDON) LLP' },       // 36 13F-HR filings
  { cik: '0000924808', name: 'SUSQUEHANNA INTERNATIONAL GROUP LLP' }, // 24 13F-HR filings
  { cik: '0000014661', name: 'BROWN BROTHERS HARRIMAN & CO' },       // 106 13F-HR filings
  { cik: '0001003283', name: 'BLACKROCK GROUP LTD' },                // 71 13F-HR filings
]

async function main() {
  console.log('Seeding institutions...')
  for (const inst of INSTITUTIONS) {
    await prisma.institution.upsert({
      where: { cik: inst.cik },
      update: { name: inst.name },
      create: inst,
    })
    console.log(`  ✓ ${inst.name} (CIK: ${inst.cik})`)
  }
  console.log(`\nDone. ${INSTITUTIONS.length} institutions seeded.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
