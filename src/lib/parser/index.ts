// 13F Filing Parser — Main Entry Point
//
// Orchestrates format detection and routing to the appropriate parser.
// All three formats (XML, HTML, text) are validated and return the same
// normalized output shape.
//
// Flow:
//   parse(content, filingUrl)
//     → detectFormat(content)           // XML | HTML | text
//     → route to appropriate parser     // xml-parser | html-parser | text-parser
//     → validate via HoldingSchema      // Zod — ensure data quality
//     → return ParsedHolding[]           // normalized shape
//
// The format detection is deterministic based on the first 1024 bytes.
// Parser routing is a simple switch statement.

import { detectFormat } from './detect'
import { parseXmlFiling } from './xml-parser'
import { parseHtmlFiling } from './html-parser'
import { parseTextFiling } from './text-parser'
import { HoldingSchema, ParsedHolding } from '../schema'
import { UnsupportedFormatError, ValidationError } from '../errors'

export async function parse13FFiling(
  content: string,
  filingUrl: string,
): Promise<ParsedHolding[]> {
  const format = detectFormat(content)

  let rawHoldings: ParsedHolding[]

  switch (format) {
    case 'xml':
      rawHoldings = await parseXmlFiling(content, filingUrl)
      break
    case 'html':
      rawHoldings = parseHtmlFiling(content, filingUrl)
      break
    case 'text':
      rawHoldings = parseTextFiling(content, filingUrl)
      break
    default:
      throw new UnsupportedFormatError(format, { filingUrl })
  }

  // Validate all holdings through Zod before returning
  // This is the data quality gate — bad records never reach the DB
  const validatedHoldings: ParsedHolding[] = []

  for (const holding of rawHoldings) {
    const result = HoldingSchema.safeParse(holding)
    if (result.success) {
      validatedHoldings.push(result.data)
    } else {
      // Log the validation failure but don't fail the whole filing
      console.warn(
        `[parse13FFiling] Skipping invalid holding:`,
        JSON.stringify(holding),
        `Errors:`,
        result.error.format(),
      )
    }
  }

  if (validatedHoldings.length === 0) {
    throw new ValidationError(
      'cusip',
      'NO_VALID_HOLDINGS',
      { filingUrl },
    )
  }

  return validatedHoldings
}
