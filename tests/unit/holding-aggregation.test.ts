import { describe, expect, it } from 'vitest'
import { aggregateSplitAdjustedHoldings } from '@/lib/pipeline'

describe('aggregateSplitAdjustedHoldings', () => {
  it('aggregates stock, put, and call exposure separately while keeping CUSIP totals', () => {
    const holdings = aggregateSplitAdjustedHoldings(
      [
        {
          cusip: '67066G104',
          companyName: 'NVIDIA CORP',
          shares: 10,
          value: 100,
          adjustedShares: 10,
          cumulativeFactor: 1,
        },
        {
          cusip: '67066G104',
          companyName: 'NVIDIA CORP',
          shares: 20,
          value: 200,
          adjustedShares: 20,
          cumulativeFactor: 1,
          putCall: 'PUT',
        },
        {
          cusip: '67066G104',
          companyName: 'NVIDIA CORP',
          shares: 30,
          value: 300,
          adjustedShares: 30,
          cumulativeFactor: 1,
          putCall: 'CALL',
        },
      ],
      new Map([['67066G104', 40]]),
    )

    expect(holdings).toHaveLength(1)
    expect(holdings[0]).toMatchObject({
      cusip: '67066G104',
      rawShares: 60,
      rawValue: 600,
      adjustedShares: 60,
      stockShares: 10,
      putShares: 20,
      callShares: 30,
      stockValue: 100,
      putValue: 200,
      callValue: 300,
      changeType: 'INCREASED',
      changePercent: 50,
    })
  })
})
