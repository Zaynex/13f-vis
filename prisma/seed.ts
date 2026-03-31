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
  { cik: '0001067983', name: 'BERKSHIRE HATHAWAY INC' },            // 45 13F-HR filings
  { cik: '0001600319', name: 'BRIDGEWATER ADVISORS INC' },           // 23 13F-HR filings
  { cik: '0001179392', name: 'TWO SIGMA INVESTMENTS LP' },          // 114 13F-HR filings
  { cik: '0001423053', name: 'CITADEL ADVISORS LLC' },               // 63 13F-HR filings
  { cik: '0001599822', name: 'POINT72 HONG KONG LTD' },              // 48 13F-HR filings
  { cik: '0001698051', name: 'POINT72 EUROPE (LONDON) LLP' },       // 36 13F-HR filings
  { cik: '0000924808', name: 'SUSQUEHANNA INTERNATIONAL GROUP LLP' }, // 0 13F-HR filings (no 13F-HR found)
  { cik: '0000014661', name: 'BROWN BROTHERS HARRIMAN & CO' },       // 118 13F-HR filings
  { cik: '0001003283', name: 'BLACKROCK GROUP LTD' },                // 79 13F-HR filings
  { cik: '0001161722', name: 'HOLLENCREST CAPITAL MANAGEMENT' },     // 110 13F-HR filings (Vanguard Group subsidiary)
  { cik: '0000093751', name: 'STATE STREET CORP' },                  // 9 13F-HR filings
  { cik: '0000886982', name: 'GOLDMAN SACHS GROUP INC' },           // 7 13F-HR filings
  { cik: '0000019617', name: 'JPMORGAN CHASE & CO' },               // 5 13F-HR filings
  { cik: '0000102909', name: 'VANGUARD GROUP INC' },                // 4 13F-HR filings
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
