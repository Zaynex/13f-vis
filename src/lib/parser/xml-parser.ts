// XML-format 13F parser
//
// Handles SEC 13F filings submitted as structured XML.
// Two major format variants are supported:
//
// VARIANT 1 — informationTable (most common in newer filings):
//   <informationTable>
//     <infoTable>
//       <nameOfIssuer>ALLY FINL INC</nameOfIssuer>
//       <cusip>02005N100</cusip>
//       <value>576074081</value>
//       <shrsOrPrnAmt><sshPrnamt>12719675</sshPrnamt></shrsOrPrnAmt>
//     </infoTable>
//   </informationTable>
//
// VARIANT 2 — SEC-DOCUMENT (older filings):
//   <SEC-DOCUMENT><FORM-13F-INFO><DATABASE>
//     <INFOTABLE>...</INFOTABLE>
//   </DATABASE></FORM-13F-INFO></SEC-DOCUMENT>

import { parseString } from 'xml2js'
import { promisify } from 'util'
import { ParsedHolding } from '../schema'
import { ParseError } from '../errors'

const parseXml = promisify(parseString)

function extractText(val: unknown): string {
  if (Array.isArray(val)) return String(val[0] ?? '').trim()
  if (typeof val === 'string') return val.trim()
  return ''
}

function extractNumber(val: unknown): number {
  const text = extractText(val)
  if (!text) return 0
  return parseInt(text.replace(/,/g, ''), 10)
}

function extractDecimal(val: unknown): number {
  const text = extractText(val)
  if (!text) return 0
  return parseFloat(text.replace(/,/g, ''))
}

function normalizeCusip(raw: string): string {
  return raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(9, '0').slice(0, 9)
}

// ─── Variant 1: informationTable / infoTable ─────────────────────────────────

function parseInfoTableVariant(root: unknown): ParsedHolding[] {
  const holdings: ParsedHolding[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = root as any

  // Navigate to infoTable array
  // r.informationTable = { '$': {...}, 'infoTable': [...] }
  // Some filings use ns1: prefix, others use ns2:, others use no prefix
  const infoTableElement = r.informationTable ?? r['ns1:informationTable'] ?? r['ns2:informationTable']
  if (!infoTableElement) return []

  // Get the infoTable array (skip namespace attr '$')
  const infoTableArray: unknown[] = []
  for (const [key, val] of Object.entries(infoTableElement)) {
    if (key === '$') continue
    if (Array.isArray(val)) {
      infoTableArray.push(...val)
    }
  }

  if (infoTableArray.length === 0) return []

  for (const row of infoTableArray) {
    if (!row || typeof row !== 'object') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r2 = row as any

    const nameRaw = extractText(r2.nameOfIssuer ?? r2['ns1:nameOfIssuer'] ?? r2['ns2:nameOfIssuer'])
    const cusipRaw = extractText(r2.cusip ?? r2['ns1:cusip'] ?? r2['ns2:cusip'])
    const valueRaw = extractText(r2.value ?? r2['ns1:value'] ?? r2['ns2:value'])

    if (!cusipRaw || cusipRaw.length < 7) continue

    // shares: nested in shrsOrPrnAmt/sshPrnamt
    // With explicitArray: true, shrsOrPrnAmt is [{ sshPrnamt: ['12719675'] }]
    let shares = 0
    const shrsOrPrnAmt = r2.shrsOrPrnAmt ?? r2['ns1:shrsOrPrnAmt'] ?? r2['ns2:shrsOrPrnAmt']
    if (shrsOrPrnAmt) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (Array.isArray(shrsOrPrnAmt) ? shrsOrPrnAmt[0] : shrsOrPrnAmt) as any
      shares = extractNumber(s.sshPrnamt ?? s['ns1:sshPrnamt'] ?? s['ns2:sshPrnamt'])
    }

    const value = extractDecimal(valueRaw)
    const cusip = normalizeCusip(cusipRaw)

    if (shares > 0 || value > 0) {
      holdings.push({
        cusip,
        companyName: nameRaw || 'UNKNOWN',
        shares,
        value,
      })
    }
  }

  return holdings
}

// ─── Variant 2: SEC-DOCUMENT / INFOTABLE ─────────────────────────────────

function findInfotables(root: unknown): unknown[] {
  if (!root || typeof root !== 'object') return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = root as any
  const keys = ['ns1:INFOTABLE', 'ns2:INFOTABLE', 'INFOTABLE', 'ns1:infoTable', 'ns2:infoTable', 'infoTable']
  for (const key of keys) {
    if (key in r && Array.isArray(r[key])) return r[key]
  }
  return []
}

function parseInfotableVariant(root: unknown): ParsedHolding[] {
  const infotables = findInfotables(root)
  const holdings: ParsedHolding[] = []

  for (const row of infotables) {
    if (!row || typeof row !== 'object') continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any

    const cusipRaw = extractText(r.Cusip ?? r['ns1:Cusip'] ?? r['ns2:Cusip'])
    const companyName = extractText(r.Security ?? r['ns1:Security'] ?? r['ns2:Security'])
    const value = extractDecimal(r.Value ?? r['ns1:Value'] ?? r['ns2:Value'])

    let shares = 0
    const sharesEl = r.Shares ?? r['ns1:Shares'] ?? r['ns2:Shares']
    if (Array.isArray(sharesEl) && sharesEl[0]) {
      shares = extractNumber(sharesEl[0]._ ?? sharesEl[0].sshPrnamt ?? sharesEl[0]['ns2:sshPrnamt'])
    }

    if (!cusipRaw || cusipRaw.length < 7) continue
    const cusip = normalizeCusip(cusipRaw)

    if (shares > 0 || value > 0) {
      holdings.push({ cusip, companyName: companyName || 'UNKNOWN', shares, value })
    }
  }

  return holdings
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export async function parseXmlFiling(
  content: string,
  filingUrl: string,
): Promise<ParsedHolding[]> {
  try {
    const parsed = await parseXml(content, { explicitArray: true, trim: true })

    // Try Variant 1: informationTable (50240.xml and similar)
    const variant1 = parseInfoTableVariant(parsed)
    if (variant1.length > 0) return variant1

    // Try Variant 2: SEC-DOCUMENT / INFOTABLE (legacy)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = parsed as any
    const secDoc = r['SEC-DOCUMENT'] ?? r['ns1:SEC-DOCUMENT']
    if (secDoc && Array.isArray(secDoc)) {
      const holdings = parseInfotableVariant(secDoc[0])
      if (holdings.length > 0) return holdings
    }

    throw new ParseError(
      `No holdings found in XML. Root keys: ${Object.keys(parsed as object).join(', ')}`,
      { filingUrl },
    )
  } catch (err) {
    if (err instanceof ParseError) throw err
    throw new ParseError(
      `XML parse failed: ${err instanceof Error ? err.message : String(err)}`,
      { filingUrl },
    )
  }
}
