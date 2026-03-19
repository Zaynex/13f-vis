# SEC 13F Filing Format Reference

This document captures the lessons learned from handling real SEC EDGAR 13F filings across multiple institutional investors. It is intended for anyone maintaining or extending the 13F parsing pipeline.

---

## 1. Three Filing Formats

SEC 13F filings arrive in three formats. The `detectFormat()` function in `src/lib/parser/detect.ts` routes each to the correct parser.

| Format | Frequency | Parser |
|--------|-----------|--------|
| XML | ~40% | `xml-parser.ts` |
| HTML (XSL-transformed) | ~50% | `html-parser.ts` |
| Plain text | ~10% | Not yet implemented |

Detection logic:
```typescript
// XML: starts with declaration, <informationTable>, or has xmlns= namespace
if (sample.startsWith('<?xml') || sample.startsWith('<informationTable') || sample.includes('xmlns="http://www.sec.gov')) return 'xml'
// HTML: starts with DOCTYPE or <html>
if (sample.startsWith('<!DOCTYPE') || sample.startsWith('<HTML') || sample.startsWith('<html')) return 'html'
// Default: text
return 'text'
```

---

## 2. XML Format — Two Variants

### Variant A: `informationTable` / `infoTable` (most common)

Used by: Berkshire Hathaway, most modern filers.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>ALLY FINL INC</nameOfIssuer>
    <cusip>02005N100</cusip>
    <value>498611260</value>
    <shrsOrPrnAmt>
      <sshPrnamt>12719675</sshPrnamt>
      <sshPrnamtType>SH</sshPrnamtType>
    </shrsOrPrnAmt>
  </infoTable>
</informationTable>
```

Parsed structure (xml2js with `explicitArray: true`):
```javascript
{
  informationTable: {
    '$': { xmlns: 'http://www.sec.gov/...' },
    infoTable: [
      {
        nameOfIssuer: ['ALLY FINL INC'],
        cusip: ['02005N100'],
        value: ['498611260'],
        shrsOrPrnAmt: [{ sshPrnamt: ['12719675'], sshPrnamtType: ['SH'] }]
      }
    ]
  }
}
```

**Critical: `explicitArray: true` makes nested elements arrays.**
- `shrsOrPrnAmt` is `[{ sshPrnamt: ['12719675'] }]` — an array, not an object
- Access shares as: `shrsOrPrnAmt[0].sshPrnamt[0]`
- NOT: `shrsOrPrnAmt.sshPrnamt` → would return `undefined`

**Namespace prefixes vary by filer:**
- No prefix: `informationTable`, `infoTable`, `cusip`, `shrsOrPrnAmt`
- `ns1:` prefix: Bridgewater Associates
- `ns2:` prefix: Some older filings

The parser must try all three: `row.cusip ?? row['ns1:cusip'] ?? row['ns2:cusip']`

### Variant B: `SEC-DOCUMENT` / `INFOTABLE` (legacy)

Used by: Some older filings.

```xml
<SEC-DOCUMENT>
  <FORM-13F-INFO>
    <DATABASE>
      <INFOTABLE>
        <Cusip>...</Cusip>
        <Security>...</Security>
        <Value>...</Value>
        <Shares><PrinAmount>...</PrinAmount></Shares>
      </INFOTABLE>
    </DATABASE>
  </FORM-13F-INFO>
</SEC-DOCUMENT>
```

Field names are UPPERCASE. Parser must check: `Cusip` / `Security` / `Value` / `Shares`.

---

## 3. HTML Format

### Why HTML Instead of XML

Many filers submit XML that gets transformed via XSL into HTML before being displayed. The raw XML file (e.g., `xslForm13F_X02/50240.xml`) is actually HTML when fetched.

Check with:
```bash
curl -sI "https://www.sec.gov/.../xslForm13F_X02/50240.xml" | grep content-type
# text/html ❌ (XSL-transformed, not XML)
# application/xml ✅ (raw XML)
```

### SEC HTML Table Structure

SEC HTML filings spread column headers across **multiple rows**:

```
ROW 0: COLUMN 1 | COLUMN 2 | COLUMN 3 | COLUMN 4 | COLUMN 5 | ...
ROW 1: (sub-header row 1) VALUE | SHRS OR | SH/ | PUT/ | INVESTMENT | ...
ROW 2: (sub-header row 2) (to the nearest dollar) | PRN AMT | PRN | CALL | DISCRETION | ...
ROW 3: NAME OF ISSUER | TITLE OF CLASS | CUSIP | FIGI | VALUE (thousands) | ...
ROW 4: data begins
```

**Common mistake:** Reading only `rows[0]` to find column indices fails because the first row only has generic labels like "COLUMN 1".

**Correct approach:** Scan the first 4 rows of header cells and look for keywords:
- CUSIP: `cusip`
- Company: `name of issuer`, `security`, `company`
- Shares: `shares`, `shr`, `prn amt`, `stock`
- Value: `value`, `market value`

---

## 4. EDGAR URL Structure

### Directory Format
```
https://www.sec.gov/Archives/edgar/data/<CIK>/<accession>/<document>
```

### Accession Number Rules (Critical)

The accession number from the SEC API (`filings.recent.accessionNumber[i]`) has dashes:
```
0001067983-24-000038
```

**For directory paths:** Remove dashes
```
000106798324000038/   ← correct
0001067983-24-000038/ ← WRONG (404)
```

**For index filename:** Keep dashes
```
0001067983-24-000038-index.htm  ← correct
000106798324000038-index.htm   ← WRONG (404)
```

### Finding the Holdings File

The `primaryDocument` field from the API always points to the **cover page** (`primary_doc.xml`), NOT the holdings data.

The holdings file must be discovered by scraping the index page.

**Index page URL pattern:**
```
https://www.sec.gov/Archives/edgar/data/<CIK>/<accession-normalized>/<accession-with-dashes>-index.htm
```

**Holdings filename patterns (in order of preference):**
1. `50240.xml` — the standard SEC document number for 13F info tables
2. `infotable.xml` (non-XSL version) — prefer the raw XML over XSL-transformed
3. Any other `.xml` excluding `primary_doc` and `-index` files

**Important:** `xslForm13F_X02/infotable.xml` is HTML (XSL-transformed), not XML. The non-XSL `infotable.xml` at the same level is raw XML.

### Scraping the Index Page

Use non-greedy regex `[^"]*` to avoid matching across HTML tags:

```javascript
// DO: matches just the href value
/href="(\/Archives\/edgar\/data\/[^"]*infotable\.xml)"/g

// DON'T: greedy [^"]+ can match past the closing " into adjacent HTML
/href="(\/Archives\/edgar\/data\/[^"]+\.xml)"/g
// Example match: /Archives/.../infotable.xml">infotable.html</a></td>
// The ">" character gets included in the URL
```

---

## 5. Duplicate Holdings per CUSIP

SEC 13F filings can contain **multiple `<infoTable>` entries with the same CUSIP** when different sub-advisors or investment discretion managers report separately.

Example (Berkshire Hathaway, Ally Financial appears 6 times):
```xml
<infoTable><cusip>02005N100</cusip><otherManager>4</otherManager>...</infoTable>
<infoTable><cusip>02005N100</cusip><otherManager>2,4,11</otherManager>...</infoTable>
<infoTable><cusip>02005N100</cusip><otherManager>4,5</otherManager>...</infoTable>
```

**The pipeline aggregates by CUSIP** — shares and values are summed, and company name is taken from the first entry. The unique constraint in the database is `(filingId, cusip)`, which enforces one row per CUSIP per filing after aggregation.

---

## 6. xml2js `explicitArray: true` Behavior Reference

| XML Element | Value Type | Access Pattern |
|-------------|------------|----------------|
| `<nameOfIssuer>` | `['ALLY FINL INC']` | `val[0]` |
| `<cusip>` | `['02005N100']` | `val[0]` |
| `<value>` | `['498611260']` | `val[0]` |
| `<shrsOrPrnAmt><sshPrnamt>12719675</sshPrnamt></shrsOrPrnAmt>` | `[{ sshPrnamt: ['12719675'] }]` | `val[0].sshPrnamt[0]` |

---

## 7. Common Error Patterns

| Symptom | Likely Cause |
|---------|-------------|
| `shares = 0` but `value > 0` | `shrsOrPrnAmt` is an array — need `[0].sshPrnamt[0]` |
| `Could not find a valid 13F holdings table in HTML` | HTML table column labels in rows 1-3, not row 0 |
| `No holdings found in XML. Root keys: ns1:informationTable` | Parser only checks `ns2:`, need `ns1:` support |
| `Filing not found: .../50240.xml` | Accession used twice in URL (dashes removed from both CIK path and filename) |
| `403 Forbidden` from Yahoo Finance | Yahoo Finance chart API requires cookies/crumb — not usable server-side without a valid crumb token |

---

## 8. Filing Availability by Institution Type

Not all institutions file the same form types:

| Form | Meaning | Holdings Data |
|------|---------|---------------|
| `13F-HR` | Full holdings report | Yes |
| `13F-NT` | Notice (no holdings attached) | No |
| `13F-HR/A` | Amended 13F-HR | Yes (supersedes prior) |

- **Vanguard** files `13F-NT` — notices with no holdings data
- **Bridgewater** files `13F-HR` — full holdings report
- **Berkshire Hathaway** files `13F-HR` — full holdings report

The pipeline's `fetchFilingMeta()` filters for forms containing `13F` and selects the most recent within the quarter's due-date window.

---

## 9. EDGAR Rate Limiting

SEC EDGAR enforces rate limits:
- **User-Agent required** — must include contact info: `'13F Tracker vincent@example.com'`
- **10 requests/second** limit — the pipeline enforces 1 request/second with `REQUEST_DELAY_MS = 1000`

Do not change the User-Agent to a generic value — SEC EDGAR will block non-identifying requests.
