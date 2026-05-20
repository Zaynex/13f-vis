import { describe, expect, it } from 'vitest'
import { parse13FFiling } from '@/lib/parser'

describe('13F PUT/CALL parsing', () => {
  it('preserves putCall values from XML information tables', async () => {
    const xml = `<?xml version="1.0"?>
<informationTable>
  <infoTable>
    <nameOfIssuer>NVIDIA CORP</nameOfIssuer>
    <cusip>67066G104</cusip>
    <value>1000</value>
    <shrsOrPrnAmt><sshPrnamt>10</sshPrnamt></shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>NVIDIA CORP</nameOfIssuer>
    <cusip>67066G104</cusip>
    <value>2000</value>
    <shrsOrPrnAmt><sshPrnamt>20</sshPrnamt></shrsOrPrnAmt>
    <putCall>Put</putCall>
  </infoTable>
  <infoTable>
    <nameOfIssuer>MICRON TECHNOLOGY INC</nameOfIssuer>
    <cusip>595112103</cusip>
    <value>3000</value>
    <shrsOrPrnAmt><sshPrnamt>30</sshPrnamt></shrsOrPrnAmt>
    <putCall>CALL</putCall>
  </infoTable>
</informationTable>`

    const holdings = await parse13FFiling(xml, 'https://www.sec.gov/example.xml')

    expect(holdings.map((h) => h.putCall ?? null)).toEqual([null, 'PUT', 'CALL'])
  })

  it('preserves putCall values from HTML information tables', async () => {
    const html = `<html><body>
<table>
  <tr>
    <th>Name of Issuer</th><th>CUSIP</th><th>Value</th><th>Shares</th><th>PUT/CALL</th>
  </tr>
  <tr><th></th><th></th><th>(x$1000)</th><th>SH/PRN AMT</th><th></th></tr>
  <tr><th></th><th></th><th></th><th></th><th></th></tr>
  <tr><th></th><th></th><th></th><th></th><th></th></tr>
  <tr><td>VANECK ETF TRUST</td><td>92189H805</td><td>500</td><td>50</td><td>Put</td></tr>
  <tr><td>SANDISK CORP</td><td>80004C101</td><td>600</td><td>60</td><td>Call</td></tr>
</table>
</body></html>`

    const holdings = await parse13FFiling(html, 'https://www.sec.gov/example.htm')

    expect(holdings.map((h) => h.putCall)).toEqual(['PUT', 'CALL'])
  })

  it('detects SEC XSL tables where PUT/CALL is split across header rows', async () => {
    const html = `<html><body>
<table>
  <tr>
    <td>COLUMN 1</td><td>COLUMN 2</td><td colspan="2">COLUMN 3</td><td>COLUMN 4</td><td colspan="3">COLUMN 5</td><td>COLUMN 6</td>
  </tr>
  <tr>
    <td></td><td></td><td></td><td></td><td>VALUE</td><td>SHRS OR</td><td>SH/</td><td>PUT/</td><td>INVESTMENT</td>
  </tr>
  <tr>
    <td>NAME OF ISSUER</td><td>TITLE OF CLASS</td><td>CUSIP</td><td>FIGI</td><td>(to the nearest dollar)</td><td>PRN AMT</td><td>PRN</td><td>CALL</td><td>DISCRETION</td>
  </tr>
  <tr><td>ASML HLDG NV N Y REGISTRY</td><td>SHS</td><td>N07059210</td><td></td><td>494,122,503</td><td>374,100</td><td>SH</td><td>Put</td><td>SOLE</td></tr>
  <tr><td>ASML HLDG NV N Y REGISTRY</td><td>SHS</td><td>N07059210</td><td></td><td>6,119,405</td><td>4,633</td><td>SH</td><td></td><td>SOLE</td></tr>
</table>
</body></html>`

    const holdings = await parse13FFiling(html, 'https://www.sec.gov/example-xsl.htm')

    expect(holdings.map((h) => h.putCall ?? null)).toEqual(['PUT', null])
  })
})
