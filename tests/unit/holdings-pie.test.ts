// Unit tests for computePieSlices — HoldingsPieChart data computation
import { describe, it, expect } from 'vitest'
import { computePieSlices } from '@/lib/holdings-pie'
import type { HoldingRow } from '@/components/HoldingsTable'

function makeHolding(overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    cusip: '000000000',
    companyName: 'Test Corp',
    adjustedShares: 1000,
    rawValue: 100000,
    changeType: 'UNCHANGED',
    changePercent: null,
    ...overrides,
  }
}

describe('computePieSlices', () => {
  describe('empty holdings', () => {
    it('returns empty array when holdings is empty', () => {
      expect(computePieSlices([])).toEqual([])
    })

    it('returns empty array when all rawValues are zero', () => {
      const holdings = [
        makeHolding({ rawValue: 0 }),
        makeHolding({ rawValue: 0 }),
      ]
      expect(computePieSlices(holdings)).toEqual([])
    })
  })

  describe('single holding', () => {
    it('returns single slice at 100%', () => {
      const holdings = [makeHolding({ cusip: '001', companyName: 'Solo Co', rawValue: 500000 })]
      const slices = computePieSlices(holdings)
      expect(slices).toHaveLength(1)
      expect(slices[0].companyName).toBe('Solo Co')
      expect(slices[0].weightPercent).toBeCloseTo(100, 1)
      expect(slices[0].isOthers).toBeUndefined()
    })
  })

  describe('exactly 10 holdings — no Others bucket', () => {
    it('returns exactly 10 slices with no Others bucket', () => {
      // Holdings must be sorted descending by value for predictable results
      const holdings = Array.from({ length: 10 }, (_, i) =>
        makeHolding({ cusip: `00${i}`, companyName: `Co ${i}`, rawValue: (10 - i) * 10000 }),
      )
      const slices = computePieSlices(holdings)
      expect(slices).toHaveLength(10)
      // Values: 100000, 90000, 80000, ..., 10000. Total = 550000. Co 0 weight = 100000/550000 = 18.18%
      expect(slices[0].companyName).toBe('Co 0')
      expect(slices[0].weightPercent).toBeCloseTo(18.18, 1)
      // No Others bucket
      expect(slices.some((s) => s.isOthers)).toBe(false)
    })
  })

  describe('more than 10 holdings — Others bucket', () => {
    it('returns 11 slices: top10 + Others', () => {
      const holdings = Array.from({ length: 15 }, (_, i) =>
        makeHolding({ cusip: `00${i}`, companyName: `Co ${i}`, rawValue: (15 - i) * 10000 }),
      )
      const slices = computePieSlices(holdings)
      expect(slices).toHaveLength(11) // 10 + Others
      const others = slices.find((s) => s.isOthers)
      expect(others).toBeDefined()
      expect(others!.companyName).toBe('Others (5 items)')
    })

    it('Others bucket has correct cumulative weight', () => {
      // 15 items: values 150000,140000,...,20000,10000
      // Total = 15/2*(150000+10000) = 1200000
      // Top 10 (indices 0-9: 150000..60000) = 1050000
      // Others (indices 10-14: 50000..10000) = 150000
      // Others weight = 150000/1200000 = 12.5%
      const holdings = Array.from({ length: 15 }, (_, i) =>
        makeHolding({ cusip: `00${i}`, companyName: `Co ${i}`, rawValue: (15 - i) * 10000 }),
      )
      const slices = computePieSlices(holdings)
      const others = slices.find((s) => s.isOthers)!
      expect(others.weightPercent).toBeCloseTo(12.5, 1)
      // Others rawValue = 50000+40000+30000+20000+10000 = 150000
      expect(others.rawValue).toBe(150000)
    })
  })

  describe('weight percent correctness', () => {
    it('weightPercents sum to ~100%', () => {
      const holdings = [
        makeHolding({ cusip: 'A', companyName: 'Alpha', rawValue: 50000 }),
        makeHolding({ cusip: 'B', companyName: 'Beta', rawValue: 30000 }),
        makeHolding({ cusip: 'C', companyName: 'Gamma', rawValue: 20000 }),
      ]
      const slices = computePieSlices(holdings)
      const sum = slices.reduce((acc, s) => acc + s.weightPercent, 0)
      expect(sum).toBeCloseTo(100, 1)
    })

    it('top holding by value appears first regardless of input order', () => {
      // Function sorts internally, so Alpha (70000) appears first even though Beta is first in the array
      const holdings = [
        makeHolding({ cusip: 'B', companyName: 'Beta', rawValue: 20000 }),
        makeHolding({ cusip: 'A', companyName: 'Alpha', rawValue: 70000 }),
        makeHolding({ cusip: 'C', companyName: 'Gamma', rawValue: 10000 }),
      ]
      const slices = computePieSlices(holdings)
      expect(slices[0].companyName).toBe('Alpha')
      expect(slices[0].rawValue).toBe(70000)
    })
  })

  describe('changeType and changePercent passthrough', () => {
    it('preserves changeType and changePercent for each slice', () => {
      const holdings = [
        makeHolding({
          cusip: '001',
          companyName: 'NewCo',
          rawValue: 50000,
          changeType: 'NEW',
          changePercent: null,
        }),
        makeHolding({
          cusip: '002',
          companyName: 'OldCo',
          rawValue: 50000,
          changeType: 'INCREASED',
          changePercent: 25.5,
        }),
      ]
      const slices = computePieSlices(holdings)
      expect(slices[0].changeType).toBe('NEW')
      expect(slices[0].changePercent).toBeNull()
      expect(slices[1].changeType).toBe('INCREASED')
      expect(slices[1].changePercent).toBe(25.5)
    })
  })

  describe('Others bucket edge cases', () => {
    it('Others has UNCHANGED changeType and null changePercent', () => {
      const holdings = Array.from({ length: 12 }, (_, i) =>
        makeHolding({ cusip: `00${i}`, companyName: `Co ${i}`, rawValue: 10000 }),
      )
      const slices = computePieSlices(holdings)
      const others = slices.find((s) => s.isOthers)
      expect(others?.changeType).toBe('UNCHANGED')
      expect(others?.changePercent).toBeNull()
    })

    it('handles case where others value rounds to 0%', () => {
      // Small others relative to total — weightPercent might be very small
      const holdings = [
        makeHolding({ cusip: 'A', companyName: 'Alpha', rawValue: 999999 }),
        ...Array.from({ length: 10 }, (_, i) =>
          makeHolding({ cusip: `0${i}`, companyName: `Co ${i}`, rawValue: 1 }),
        ),
      ]
      const slices = computePieSlices(holdings)
      const others = slices.find((s) => s.isOthers)
      expect(others).toBeDefined()
      expect(others!.weightPercent).toBeLessThan(0.01)
      expect(others!.weightPercent).toBeGreaterThan(0)
    })
  })
})
