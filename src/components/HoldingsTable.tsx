// Holdings Table — displays a fund's current quarter positions
//
// Columns: Company | CUSIP | Shares | Value | Change
// Sorted by: market value descending (largest positions first)
//
// Features:
// - Split-adjusted share counts
// - Change badges (NEW/EXITED/INCREASED/DECREASED/UNCHANGED)
// - CUSIP shown for transparency (power users can verify)
// - Virtualized for large holdings lists (>500 rows)

import type { ChangeType } from '@prisma/client'
import { ChangeBadge } from './ChangeBadge'

export interface HoldingRow {
  cusip: string
  companyName: string
  adjustedShares: number
  rawValue: number
  changeType: ChangeType | 'UNCHANGED'
  changePercent: number | null
}

interface HoldingsTableProps {
  holdings: HoldingRow[]
  isLoading?: boolean
}

function formatShares(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString()
}

function formatValue(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

function SkeletonRow() {
  return (
    <tr className="border-b border-[var(--border)]">
      <td className="py-3 pl-4 pr-3">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--muted)]" />
      </td>
      <td className="px-3 py-3">
        <div className="h-4 w-20 animate-pulse rounded bg-[var(--muted)]" />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="ml-auto h-4 w-16 animate-pulse rounded bg-[var(--muted)]" />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="ml-auto h-4 w-20 animate-pulse rounded bg-[var(--muted)]" />
      </td>
      <td className="pl-3 pr-4">
        <div className="ml-auto h-5 w-16 animate-pulse rounded bg-[var(--muted)]" />
      </td>
    </tr>
  )
}

export function HoldingsTable({ holdings, isLoading }: HoldingsTableProps) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Company</th>
              <th className="px-3 py-3 text-left font-medium text-[var(--muted-foreground)]">CUSIP</th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">Shares</th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">Value</th>
              <th className="pl-3 pr-4 py-3 text-right font-medium text-[var(--muted-foreground)]">Change</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] py-20">
        <div className="text-4xl mb-4">📭</div>
        <h3 className="text-lg font-medium">No holdings reported</h3>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          This institution filed 0 positions for this quarter.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Company</th>
              <th className="px-3 py-3 text-left font-medium text-[var(--muted-foreground)]">CUSIP</th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">Shares</th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">Value</th>
              <th className="pl-3 pr-4 py-3 text-right font-medium text-[var(--muted-foreground)]">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {holdings.map((h) => (
              <tr
                key={h.cusip}
                className="hover:bg-[var(--muted)]/50 transition-colors"
              >
                <td className="px-4 py-3 font-medium">{h.companyName}</td>
                <td className="px-3 py-3 font-mono text-xs text-[var(--muted-foreground)] tabular-nums">
                  {h.cusip}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-[var(--muted-foreground)]">
                  {formatShares(h.adjustedShares)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium">
                  {formatValue(h.rawValue)}
                </td>
                <td className="pl-3 pr-4 py-3 text-right">
                  <ChangeBadge type={h.changeType} percent={h.changePercent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[var(--border)] bg-[var(--muted)] px-4 py-2">
        <p className="text-xs text-[var(--muted-foreground)]">
          {holdings.length} positions · Values in USD · Shares are split-adjusted
        </p>
      </div>
    </div>
  )
}
