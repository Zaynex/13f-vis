// Holdings Pie Chart — pure data computation
// Extracted from HoldingsPieChart for unit testability.

import type { HoldingRow } from '@/components/HoldingsTable'

export interface PieSlice {
  cusip: string
  companyName: string
  rawValue: number
  weightPercent: number
  changeType: string
  changePercent: number | null
  isOthers?: boolean
}

/**
 * Compute top-N slices + others bucket from holdings.
 * Holdings are sorted internally by value descending for consistent results.
 * Returns slices with weightPercent computed from total value.
 */
export function computePieSlices(holdings: HoldingRow[]): PieSlice[] {
  if (holdings.length === 0) return []

  const totalValue = holdings.reduce((sum, h) => sum + h.rawValue, 0)
  if (totalValue === 0) return []

  // Sort by value descending for consistent top-N selection
  const sorted = [...holdings].sort((a, b) => b.rawValue - a.rawValue)
  const top10 = sorted.slice(0, 10)
  const others = sorted.slice(10)

  const top10Slices: PieSlice[] = top10.map((h) => ({
    cusip: h.cusip,
    companyName: h.companyName,
    rawValue: h.rawValue,
    weightPercent: (h.rawValue / totalValue) * 100,
    changeType: h.changeType,
    changePercent: h.changePercent,
  }))

  if (others.length === 0) return top10Slices

  const othersValue = others.reduce((sum, h) => sum + h.rawValue, 0)
  const othersSlice: PieSlice = {
    cusip: '__others__',
    companyName: `Others (${others.length} items)`,
    rawValue: othersValue,
    weightPercent: (othersValue / totalValue) * 100,
    changeType: 'UNCHANGED',
    changePercent: null,
    isOthers: true,
  }

  return [...top10Slices, othersSlice]
}
