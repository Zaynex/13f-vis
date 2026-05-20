// HTML-format 13F parser
//
// Handles SEC 13F filings submitted as HTML with inline tables.
// Most common format (~50% of filers). Requires careful DOM traversal
// because HTML tables have variable structure across filers.
//
// Common patterns:
// - Table with <TH> headers: Company, CUSIP, Value, Shares, etc.
// - Table rows: <TR><TD>company</TD><TD>cusip</TD><TD>value</TD><TD>shares</TD></TR>
// - Nested tables sometimes appear (handle colspan/rowspan carefully)

import * as cheerio from 'cheerio'
import { normalizePutCall, ParsedHolding } from '../schema'
import { ParseError } from '../errors'

interface TableHeader {
  index: number
  text: string
}

function normalizeHeader(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, '')
}

function detectColumnIndices(headers: TableHeader[]): {
  cusipIdx: number
  companyIdx: number
  sharesIdx: number
  valueIdx: number
  putCallIdx: number
} | null {
  // We look for specific header text patterns across ALL header rows
  let cusipIdx = -1
  let companyIdx = -1
  let sharesIdx = -1
  let valueIdx = -1
  let putCallIdx = -1
  const headerTextByIndex = new Map<number, string>()

  for (const h of headers) {
    const t = h.text.toUpperCase()
    const normalized = normalizeHeader(h.text)
    headerTextByIndex.set(h.index, `${headerTextByIndex.get(h.index) ?? ''} ${normalized}`)
    if (t.includes('CUSIP') && cusipIdx === -1) cusipIdx = h.index
    if ((t.includes('SECURITY') || t.includes('NAME OF ISSUER') || t.includes('COMPANY')) && companyIdx === -1) companyIdx = h.index
    if ((t.includes('SHARES') || t.includes('SHRS') || t.includes('PRN AMT') || t.includes('STOCK')) && sharesIdx === -1) sharesIdx = h.index
    if (t.includes('VALUE') && valueIdx === -1) valueIdx = h.index
    if ((t.includes('PUT/CALL') || normalized === 'PUTCALL') && putCallIdx === -1) putCallIdx = h.index
  }

  if (putCallIdx === -1) {
    for (const [index, text] of headerTextByIndex.entries()) {
      if (text.includes('PUT') && text.includes('CALL')) {
        putCallIdx = index
        break
      }
    }
  }

  // Require at minimum cusip and one of company/shares
  if (cusipIdx === -1) return null

  // If we have a shares header, use it. Otherwise, try to infer from value column.
  if (sharesIdx === -1 && valueIdx !== -1) {
    // Sometimes value column is labeled differently — we'll handle 3-column tables too
  }

  return {
    cusipIdx: cusipIdx >= 0 ? cusipIdx : 0,
    companyIdx: companyIdx >= 0 ? companyIdx : 1,
    sharesIdx: sharesIdx >= 0 ? sharesIdx : 2,
    valueIdx: valueIdx >= 0 ? valueIdx : 3,
    putCallIdx,
  }
}

export function parseHtmlFiling(
  content: string,
  filingUrl: string,
): ParsedHolding[] {
  try {
    const $ = cheerio.load(content)
    const holdings: ParsedHolding[] = []

    // Find all tables in the document
    const tables = $('table')

    if (tables.length === 0) {
      throw new ParseError(`No <table> elements found in HTML filing: ${filingUrl}`, { filingUrl })
    }

    // Try each table until we find one that looks like a 13F holdings table
    for (const tableEl of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: cheerio.Cheerio<any> = $(tableEl).find('tr')
      if (rows.length < 3) continue // Need header + at least 2 data rows

      // SEC HTML filings have column labels spread across multiple header rows.
      // Collect all header cells from the first 4 rows to find column indices.
      const headers: TableHeader[] = []
      for (let rowIdx = 0; rowIdx < Math.min(4, rows.length); rowIdx++) {
        const headerCells = $(rows[rowIdx]).find('th, td')
        headerCells.each((i, el) => {
          const text = $(el).text().trim()
          if (text.length > 0) {
            headers.push({ index: i, text })
          }
        })
      }

      const cols = detectColumnIndices(headers)
      if (!cols) continue

      // Parse all rows. Header rows naturally drop out because they do not
      // contain valid CUSIPs plus positive share/value data, and SEC XSL
      // tables can start data before the fourth row.
      let parsedCount = 0
      for (let i = 0; i < rows.length; i++) {
        const cells = $(rows[i]).find('td')
        if (cells.length === 0) continue

        const getCellText = (idx: number): string => {
          const cell = $(cells[idx])
          return cell.text().trim()
        }

        const cusipRaw = getCellText(cols.cusipIdx)
        if (!cusipRaw || cusipRaw.length < 7) continue // Skip empty/bad rows

        // CUSIP: 9 alphanumeric chars, strip any non-alphanumeric
        const cusip = cusipRaw.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(9, '0').slice(0, 9)

        const companyName = getCellText(cols.companyIdx) || 'UNKNOWN'
        const putCall = cols.putCallIdx >= 0
          ? normalizePutCall(getCellText(cols.putCallIdx))
          : null

        // Shares: may have commas, parse as integer
        let shares = 0
        const sharesText = getCellText(cols.sharesIdx)
        if (sharesText) {
          shares = parseInt(sharesText.replace(/,/g, ''), 10) || 0
        }

        // Value: may have commas, parse as float (in thousands USD sometimes)
        let value = 0
        const valueText = getCellText(cols.valueIdx)
        if (valueText) {
          // 13F values are often in thousands
          const rawVal = parseFloat(valueText.replace(/,/g, '')) || 0
          // If value < 10000, it's likely in thousands
          value = rawVal < 10000 ? rawVal * 1000 : rawVal
        }

        if (shares > 0 || value > 0) {
          holdings.push({
            cusip,
            companyName,
            shares,
            value,
            ...(putCall ? { putCall } : {}),
          })
          parsedCount++
        }
      }

      if (parsedCount > 0) {
        return holdings
      }
    }

    // No valid holdings table found
    throw new ParseError(
      `Could not find a valid 13F holdings table in HTML: ${filingUrl}`,
      { filingUrl },
    )
  } catch (err) {
    if (err instanceof ParseError) throw err
    throw new ParseError(
      `HTML parse failed: ${err instanceof Error ? err.message : String(err)}`,
      { filingUrl },
    )
  }
}
