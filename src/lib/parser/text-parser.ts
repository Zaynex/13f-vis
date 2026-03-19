// Text-format 13F parser
//
// Handles SEC 13F filings submitted as plain text (columnar layout).
// Least common format (~10% of filers) but still needs support.
//
// Text format is typically fixed-width columns:
// Column 1: Company/Issuer name (left-padded, ~35 chars)
// Column 2: CUSIP (left-padded, ~12 chars)
// Column 3: Market value (right-padded, ~18 chars)
// Column 4: Shares (right-padded, ~15 chars)
// etc.
//
// The column positions vary by filer, so we detect them dynamically.

import { ParsedHolding } from '../schema'
import { ParseError } from '../errors'

// Regex patterns to detect text-format 13F rows
const CUSIP_PATTERN = /^[A-Z0-9]{9}$/
const SHARES_PATTERN = /^\d[\d,]*$/
const VALUE_PATTERN = /^[\d,.\-]+$/

interface ColumnPositions {
  cusipStart: number
  cusipEnd: number
  sharesStart: number
  sharesEnd: number
  valueStart: number
  valueEnd: number
  nameStart: number
  nameEnd: number
}

function detectColumnPositions(headerLine: string): ColumnPositions | null {
  // Look for column headers in the line
  const upper = headerLine.toUpperCase()
  const cusipIdx = upper.indexOf('CUSIP')
  const sharesIdx = upper.indexOf('SHARES') !== -1 ? upper.indexOf('SHARES') : upper.indexOf('SH')
  const valueIdx = upper.indexOf('VALUE') !== -1 ? upper.indexOf('VALUE') : upper.indexOf('MARKET')

  if (cusipIdx === -1) return null

  // Assume column widths if we only have cusip
  const nameEnd = cusipIdx
  const nameStart = 0

  const cusipEnd = cusipIdx + 12
  const sharesEnd = sharesIdx !== -1 ? sharesIdx + 15 : cusipEnd + 27
  const valueEnd = valueIdx !== -1 ? valueIdx + 18 : sharesEnd + 20

  const sharesStart = sharesIdx !== -1 ? sharesIdx : cusipEnd + 15
  const valueStart = valueIdx !== -1 ? valueIdx : sharesEnd + 2

  return {
    cusipStart: cusipIdx,
    cusipEnd,
    sharesStart: sharesIdx !== -1 ? sharesIdx : sharesStart,
    sharesEnd,
    valueStart: valueIdx !== -1 ? valueIdx : valueStart,
    valueEnd,
    nameStart,
    nameEnd,
  }
}

export function parseTextFiling(
  content: string,
  filingUrl: string,
): ParsedHolding[] {
  try {
    const lines = content.split(/\r?\n/)
    const holdings: ParsedHolding[] = []
    let cols: ColumnPositions | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue

      // Try to detect column positions from header row
      if (!cols && line.toUpperCase().includes('CUSIP')) {
        cols = detectColumnPositions(line)
        continue
      }

      if (!cols) continue

      // Extract cusip (9 chars at known position)
      const rawCusip = line.slice(cols.cusipStart, cols.cusipEnd).trim()
      if (!CUSIP_PATTERN.test(rawCusip)) continue

      const cusip = rawCusip.toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(9, '0').slice(0, 9)

      // Extract company name (everything before cusip column)
      const companyName = line.slice(cols.nameStart, cols.cusipStart).trim() || 'UNKNOWN'

      // Extract shares
      const rawShares = line.slice(cols.sharesStart, cols.sharesEnd).trim()
      const shares = SHARES_PATTERN.test(rawShares)
        ? parseInt(rawShares.replace(/,/g, ''), 10) || 0
        : 0

      // Extract value
      const rawValue = line.slice(cols.valueStart, cols.valueEnd).trim()
      let value = 0
      if (VALUE_PATTERN.test(rawValue)) {
        // Values may be in thousands
        const rawVal = parseFloat(rawValue.replace(/,/g, '')) || 0
        value = rawVal < 10000 ? rawVal * 1000 : rawVal
      }

      if (shares > 0 || value > 0) {
        holdings.push({ cusip, companyName, shares, value })
      }
    }

    if (holdings.length === 0) {
      throw new ParseError(`No holdings parsed from text filing: ${filingUrl}`, { filingUrl })
    }

    return holdings
  } catch (err) {
    if (err instanceof ParseError) throw err
    throw new ParseError(
      `Text parse failed: ${err instanceof Error ? err.message : String(err)}`,
      { filingUrl },
    )
  }
}
