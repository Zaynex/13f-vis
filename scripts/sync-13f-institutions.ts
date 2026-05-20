#!/usr/bin/env node

import { sync13FInstitutionDirectory } from '../src/lib/pipeline/institution-index'
import { prisma } from '../src/lib/prisma'

function getQuarterCount(): number {
  const arg = process.argv.find((value) => value.startsWith('--quarters='))
  const parsed = arg ? Number(arg.split('=')[1]) : 4
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 40) {
    throw new Error('--quarters must be an integer between 1 and 40')
  }
  return parsed
}

async function main() {
  const quarters = getQuarterCount()
  console.log(`Syncing SEC 13F-HR institution directory from the latest ${quarters} SEC filing quarter(s)...`)

  const result = await sync13FInstitutionDirectory({ quarters })
  const labels = result.scannedQuarters.map((q) => `${q.year}-QTR${q.quarter}`).join(', ')

  console.log(`Scanned: ${labels}`)
  console.log(`Discovered/upserted institutions: ${result.upserted}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
