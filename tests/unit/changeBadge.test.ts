// Unit tests for calculateChangeBadge function
import { describe, it, expect } from 'vitest'
import { calculateChangeBadge, type ChangeBadge } from '@/lib/schema'

describe('calculateChangeBadge', () => {
  describe('NEW positions', () => {
    it('returns NEW when current shares exist and prior is null', () => {
      expect(calculateChangeBadge(1000, null)).toBe('NEW')
    })

    it('treats 0 as a real value, not as null', () => {
      // 0 is treated as an actual share count of 0, not as "no position"
      expect(calculateChangeBadge(1000, 0)).toBe('INCREASED') // +infinity% increase from 0
    })
  })

  describe('EXITED positions', () => {
    it('returns EXITED when current is null and prior exists', () => {
      expect(calculateChangeBadge(null, 1000)).toBe('EXITED')
    })

    it('treats 0 as a real value, not as null', () => {
      // 0 share position is still a position with 0 shares
      expect(calculateChangeBadge(0, 1000)).toBe('DECREASED')
    })
  })

  describe('INCREASED positions (>1% change)', () => {
    it('returns INCREASED for >1% increase', () => {
      expect(calculateChangeBadge(1050, 1000)).toBe('INCREASED') // +5%
    })

    it('returns INCREASED for exactly 1% change threshold boundary', () => {
      // At exactly 1%, should be UNCHANGED (not INCREASED)
      expect(calculateChangeBadge(1010, 1000)).toBe('UNCHANGED')
    })
  })

  describe('DECREASED positions (>1% change)', () => {
    it('returns DECREASED for >1% decrease', () => {
      expect(calculateChangeBadge(900, 1000)).toBe('DECREASED') // -10%
    })

    it('returns DECREASED for exactly -1% change threshold boundary', () => {
      expect(calculateChangeBadge(990, 1000)).toBe('UNCHANGED')
    })
  })

  describe('UNCHANGED positions (<1% change)', () => {
    it('returns UNCHANGED for less than 1% increase', () => {
      expect(calculateChangeBadge(1005, 1000)).toBe('UNCHANGED') // +0.5%
    })

    it('returns UNCHANGED for less than 1% decrease', () => {
      expect(calculateChangeBadge(995, 1000)).toBe('UNCHANGED') // -0.5%
    })

    it('returns UNCHANGED when no change', () => {
      expect(calculateChangeBadge(1000, 1000)).toBe('UNCHANGED')
    })
  })

  describe('edge cases', () => {
    it('handles null both values as UNCHANGED', () => {
      expect(calculateChangeBadge(null, null)).toBe('UNCHANGED')
    })

    it('handles zero to zero as UNCHANGED', () => {
      expect(calculateChangeBadge(0, 0)).toBe('UNCHANGED')
    })

    it('handles large percentage increase', () => {
      expect(calculateChangeBadge(10000, 100)).toBe('INCREASED') // +9900%
    })

    it('handles large percentage decrease', () => {
      expect(calculateChangeBadge(100, 10000)).toBe('DECREASED') // -99%
    })
  })
})
