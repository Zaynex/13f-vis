// Prisma seed — initial institution set
// Run with: npm run db:seed
//
// CIKs sourced from SEC EDGAR company tickers JSON:
// https://www.sec.gov/files/company_tickers.json
//
// These 10 funds were chosen for:
// - Recognizability (retail investors know them)
// - Diversity of strategy (value, macro, quant, growth)
// - Representative filing formats (XML, HTML, text mix)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const INSTITUTIONS = [
  { cik: '0001067983', name: 'BERKSHIRE HATHAWAY INC' },
  { cik: '0001530238', name: 'BRIDGEWATER ASSOCIATES LP' },
  { cik: '0001146184', name: 'CITADEL ADVISORS LLC' },
  { cik: '0001047502', name: 'TWO SIGMA INVESTMENTS LP' },
  { cik: '0000913764', name: 'POINT72 ASSET MANAGEMENT LP' },
  { cik: '0001167558', name: 'STEELOAK CAPITAL MANAGEMENT LLC' },
  { cik: '0000924808', name: 'SUSQUEHANNA INTERNATIONAL GROUP LLP' },
  { cik: '0000891837', name: 'BROWN BROTHERS HARRIMAN & CO' },
  { cik: '0001067766', name: 'VANGUARD GROUP INC' },
  { cik: '0001405485', name: 'BLACKROCK INSTITUTIONAL TRUST CO LLC' },
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
