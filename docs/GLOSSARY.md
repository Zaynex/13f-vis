# Financial Terms Glossary

This glossary explains the financial terminology used throughout the SEC 13F Visualizer.

## Core Terms

### CUSIP
**Committee on Uniform Security Identification Procedures**

A 9-character alphanumeric code that uniquely identifies a specific security (stock, bond, ETF share class, etc.). Think of it as a national ID number for securities — no two securities share the same CUSIP.

- **Format:** 9 characters (letters and numbers)
- **Example:** Apple = `037833100`, Microsoft = `594918104`
- **Why it matters:** Company names can vary between filers (e.g., "APPLE INC" vs "APPLE INC (DELAWARE)"), but CUSIP is always the same. We use CUSIP as the authoritative identifier for matching holdings across institutions.

### 13F Filing
**SEC Form 13F — Information Required of Institutional Investment Managers**

A quarterly report that institutional investment managers with over $100M in assets under management must file with the SEC within 45 days of quarter-end. It discloses all their equity positions.

- **Filed for:** Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
- **Due:** 45 days after quarter end (e.g., Q4 2024 due Feb 14, 2025)
- **What it shows:** List of all equity securities held, with share counts and market values

### ETF (Exchange-Traded Fund)
**Exchange-Traded Fund**

A type of investment fund that trades on stock exchanges, like individual stocks. ETFs hold a basket of securities (stocks, bonds, etc.) and offer an easy way to diversify.

- **Key feature:** One ticker can represent dozens or hundreds of underlying holdings
- **Note on 13F:** When a fund files a 13F, they report each ETF as a single line item — not the ETF's underlying holdings. So if Bridgewater holds an S&P 500 ETF, you'll see the ETF ticker but not the individual stocks inside it.

### QoQ (Quarter-over-Quarter)
A comparison of a metric between one quarter and the immediately preceding quarter. For example, comparing Q4 holdings to Q3 holdings.

- **↑ Green:** Position increased from prior quarter
- **↓ Orange/Red:** Position decreased from prior quarter
- **★ New:** First appearance in this quarter (didn't exist in prior quarter)
- **✕ Exited:** Completely sold off (was in prior quarter, gone now)

## Holdings Data

### Adjusted Shares
**Split-Adjusted Share Count**

13F filings report raw share counts as of the filing date. When companies undergo stock splits (e.g., 2-for-1), the raw share count changes even if the dollar value stays the same. We adjust share counts to account for splits, making quarter-over-quarter comparisons accurate.

- **Without adjustment:** A 2-for-1 split would look like the fund doubled its position, when in reality they held the same value
- **With adjustment:** The prior quarter is recalculated to match the current split-adjusted count

### Market Value
The dollar value of the position, calculated as: `shares × price-per-share` on the filing date.

- **Note:** Values are as of the filing date, not the quarter-end date. There's typically a 45-day delay between quarter-end and when the 13F is filed.

### Change Badge
Our classification of how a position changed from one quarter to the next:

| Badge | Meaning | Threshold |
|-------|---------|-----------|
| **NEW** | First quarter this position appeared | Prior quarter = 0 shares |
| **EXITED** | Completely sold off | Current quarter = 0 shares |
| **▲ Increased** | Bought more | >1% increase in shares |
| **▼ Decreased** | Sold some | >1% decrease in shares |
| **— Unchanged** | Minimal change | Within ±1% |

## Institutional Investors

### Institutional Investment Manager
A professional money management firm (hedge fund, mutual fund, pension fund, etc.) that files 13F reports. These are the "smart money" players in the market.

**Pre-seeded institutions in this database:**
- **Berkshire Hathaway** (`0001067983`) — Warren Buffett's company
- **Bridgewater Advisors Inc** (`0001600319`) — Ray Dalio's hedge fund
- **Two Sigma Investments LP** (`0001179392`) — Quantitative hedge fund
- **Citadel Advisors LLC** (`0001423053`) — Ken Griffin's hedge fund
- **Point72 Hong Kong Ltd** (`0001599822`) — Steve Cohen's fund (HK entity)
- **Point72 Europe London LLP** (`0001698051`) — Steve Cohen's fund (London entity)
- **Susquehanna International Group** (`0001765924`) — Large quantitative hedge fund
- **Brown Brothers Harriman** (`0000014661`) — Oldest US investment bank
- **BlackRock Group LTD** (`0001003283`) — World's largest asset manager

**Note:** Some institutions file "13F-NT" instead of full 13F. NT means "Notice" — it indicates they have no holdings to report, or the filing is incomplete. We only show institutions with actual holdings data.
