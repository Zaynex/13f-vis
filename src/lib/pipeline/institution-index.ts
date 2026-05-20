import { prisma } from '@/lib/prisma'
import { rateLimiter, withRetry } from './rate-limiter'

const SEC_EDGAR_ARCHIVES_BASE = 'https://www.sec.gov/Archives/edgar/full-index'
const EDGAR_HEADERS = {
  'User-Agent': '13F Tracker vincent@example.com',
  'Accept': 'text/plain',
}

export interface IndexedInstitution {
  cik: string
  name: string
}

export interface EdgarIndexQuarter {
  year: number
  quarter: number
}

export interface Sync13FInstitutionDirectoryOptions {
  quarters?: number
  now?: Date
}

export interface Sync13FInstitutionDirectoryResult {
  scannedQuarters: EdgarIndexQuarter[]
  discovered: number
  upserted: number
}

export function getRecentEdgarIndexQuarters(
  now = new Date(),
  count = 4,
): EdgarIndexQuarter[] {
  const result: EdgarIndexQuarter[] = []
  let year = now.getUTCFullYear()
  let quarter = Math.floor(now.getUTCMonth() / 3) + 1

  while (result.length < count) {
    result.push({ year, quarter })
    quarter -= 1
    if (quarter === 0) {
      quarter = 4
      year -= 1
    }
  }

  return result
}

export function parse13FInstitutionFormIndex(indexText: string): IndexedInstitution[] {
  const byCik = new Map<string, IndexedInstitution>()
  const linePattern = /^13F-HR\s+(.+?)\s+(\d{1,10})\s+\d{4}-\d{2}-\d{2}\s+edgar\/data\//i

  for (const line of indexText.split(/\r?\n/)) {
    if (!line.startsWith('13F-HR')) continue
    if (line.startsWith('13F-HR/A') || line.startsWith('13F-NT')) continue

    const match = line.match(linePattern)
    if (!match) continue

    const name = match[1].replace(/\s+/g, ' ').trim()
    const cik = match[2].padStart(10, '0')
    if (!name || !/^\d{10}$/.test(cik)) continue

    byCik.set(cik, { cik, name })
  }

  return [...byCik.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetch13FInstitutionsForIndexQuarter(
  indexQuarter: EdgarIndexQuarter,
): Promise<IndexedInstitution[]> {
  const url = `${SEC_EDGAR_ARCHIVES_BASE}/${indexQuarter.year}/QTR${indexQuarter.quarter}/form.idx`
  const response = await rateLimiter.run(() =>
    withRetry(
      () =>
        fetch(url, {
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
    throw new Error(`Failed to fetch SEC form index ${url}: ${response.status}`)
  }

  return parse13FInstitutionFormIndex(await response.text())
}

export async function sync13FInstitutionDirectory(
  options: Sync13FInstitutionDirectoryOptions = {},
): Promise<Sync13FInstitutionDirectoryResult> {
  const scannedQuarters = getRecentEdgarIndexQuarters(options.now, options.quarters ?? 4)
  const byCik = new Map<string, IndexedInstitution>()

  for (const indexQuarter of scannedQuarters) {
    const institutions = await fetch13FInstitutionsForIndexQuarter(indexQuarter)
    for (const institution of institutions) {
      byCik.set(institution.cik, institution)
    }
  }

  const institutions = [...byCik.values()]
  for (const institution of institutions) {
    await prisma.institution.upsert({
      where: { cik: institution.cik },
      update: { name: institution.name },
      create: institution,
    })
  }

  return {
    scannedQuarters,
    discovered: institutions.length,
    upserted: institutions.length,
  }
}
