import { describe, expect, it } from 'vitest'
import { parseHtmlFiling } from '../../src/lib/parser/html-parser'

describe('parseHtmlFiling', () => {
  it('parses holdings that appear within the first four table rows', () => {
    const html = `
      <html>
        <body>
          <table>
            <tr>
              <td>NAME OF ISSUER</td>
              <td>TITLE OF CLASS</td>
              <td>CUSIP</td>
              <td>FIGI</td>
              <td>VALUE</td>
              <td>SHRS OR PRN AMT</td>
            </tr>
            <tr>
              <td>ALLY FINL INC</td>
              <td>COM</td>
              <td>02005N100</td>
              <td></td>
              <td>498,992,850</td>
              <td>12,719,675</td>
            </tr>
            <tr>
              <td>ALLY FINL INC</td>
              <td>COM</td>
              <td>02005N100</td>
              <td></td>
              <td>109,996,016</td>
              <td>2,803,875</td>
            </tr>
          </table>
        </body>
      </html>
    `

    const holdings = parseHtmlFiling(html, 'https://www.sec.gov/example')

    expect(holdings).toHaveLength(2)
    expect(holdings[0]).toEqual({
      cusip: '02005N100',
      companyName: 'ALLY FINL INC',
      shares: 12719675,
      value: 498992850,
    })
  })
})
