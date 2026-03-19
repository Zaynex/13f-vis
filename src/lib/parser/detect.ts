// Format detection for SEC EDGAR 13F filings
//
// 13F filings arrive in three formats — each requires a different parser:
// 1. XML   — structured XML (~40% of filers)
//    - edgarSubmission (cover page primary_doc.xml)
//    - informationTable (holdings in 50240.xml)
//    - May have no XML declaration, starts directly with root element
// 2. HTML  — XSL-transformed HTML (~50% of filers)
//    - starts with <!DOCTYPE html> or <html>
// 3. TEXT  — plain text with columnar layout (~10% of filers)

export type FilingFormat = 'xml' | 'html' | 'text'

export function detectFormat(content: string): FilingFormat {
  const sample = content.slice(0, 1024)

  // HTML: starts with DOCTYPE or <html tag
  if (sample.startsWith('<!DOCTYPE') || sample.startsWith('<HTML') || sample.startsWith('<html')) {
    return 'html'
  }

  // XML: starts with XML declaration, or is an SEC EDGAR XML document
  // SEC EDGAR XML files may have no declaration (starts with root element)
  if (
    sample.startsWith('<?xml') ||
    sample.startsWith('<edgarSubmission') ||
    sample.startsWith('<informationTable') ||
    sample.includes('xmlns="http://www.sec.gov')
  ) {
    return 'xml'
  }

  // Default to text (columnar plain text)
  return 'text'
}
