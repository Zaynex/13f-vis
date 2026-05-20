// Holdings Table — displays a fund's current quarter positions
//
// Columns: Company | CUSIP | Type | Shares | Value | Weight | Change
// Sorted by: market value descending (largest positions first)
//
// Features:
// - Split-adjusted share counts
// - Change badges (NEW/EXITED/INCREASED/DECREASED/UNCHANGED)
// - CUSIP shown for transparency (power users can verify)
// - Virtualized for large holdings lists (>500 rows)

import type { ChangeType } from '@prisma/client'
import { ChangeBadge } from './ChangeBadge'
import { InfoTooltip } from './InfoTooltip'

const GLOSSARY = {
  cusip: 'CUSIP (Committee on Uniform Security Identification Procedures) — A 9-character unique identifier for each security. Used instead of company name because names vary across filers.',
  shares: 'Split-adjusted share count. Raw 13F counts are adjusted for stock splits to enable accurate quarter-over-quarter comparison.',
  value: 'Market value in USD. Calculated as shares × price-per-share on the filing date.',
  type: '13F holding type. Stock means direct equity exposure; Put and Call are option positions reported in the filing.',
  change: 'Quarter-over-quarter change in shares. ▲ = increased >1%, ▼ = decreased >1%, ★ = new position, ✕ = exited.',
  etf: 'ETF (Exchange-Traded Fund) — A fund that trades on exchanges like a stock. One ETF ticker can represent dozens of underlying holdings.',
}

export interface HoldingRow {
  cusip: string
  companyName: string
  adjustedShares: number
  rawValue: number
  stockShares?: number
  stockValue?: number
  putShares?: number
  putValue?: number
  callShares?: number
  callValue?: number
  optionSummary?: string
  weightPercent?: number | null
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

function getOptionParts(h: HoldingRow): string[] {
  const parts: string[] = []
  if ((h.stockShares ?? 0) > 0) parts.push('Stock')
  if ((h.putShares ?? 0) > 0) parts.push('Put')
  if ((h.callShares ?? 0) > 0) parts.push('Call')
  if (parts.length > 0) return parts
  if (h.optionSummary && h.optionSummary !== 'Unknown') return h.optionSummary.split(' + ')
  return ['Unknown']
}

function OptionExposure({ holding }: { holding: HoldingRow }) {
  const parts = getOptionParts(holding)
  const classNameFor = (part: string) => {
    if (part === 'Put') return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
    if (part === 'Call') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    if (part === 'Stock') return 'border-sky-500/40 bg-sky-500/10 text-sky-300'
    return 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]'
  }

  return (
    <div className="flex flex-wrap justify-start gap-1">
      {parts.map((part) => (
        <span
          key={part}
          className={`inline-flex min-w-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase leading-4 tracking-normal ${classNameFor(part)}`}
        >
          {part}
        </span>
      ))}
    </div>
  )
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
      <td className="px-3 py-3">
        <div className="h-4 w-16 animate-pulse rounded bg-[var(--muted)]" />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="ml-auto h-4 w-16 animate-pulse rounded bg-[var(--muted)]" />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="ml-auto h-4 w-20 animate-pulse rounded bg-[var(--muted)]" />
      </td>
      <td className="px-3 py-3 text-right">
        <div className="ml-auto h-4 w-12 animate-pulse rounded bg-[var(--muted)]" />
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
              <th className="px-3 py-3 text-left font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.cusip}>CUSIP</InfoTooltip>
              </th>
              <th className="px-3 py-3 text-left font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.type}>Type</InfoTooltip>
              </th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.shares}>Shares</InfoTooltip>
              </th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.value}>Value</InfoTooltip>
              </th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">
                Weight
              </th>
              <th className="pl-3 pr-4 py-3 text-right font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.change}>Change</InfoTooltip>
              </th>
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
              <th className="px-3 py-3 text-left font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.cusip}>CUSIP</InfoTooltip>
              </th>
              <th className="px-3 py-3 text-left font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.type}>Type</InfoTooltip>
              </th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.shares}>Shares</InfoTooltip>
              </th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.value}>Value</InfoTooltip>
              </th>
              <th className="px-3 py-3 text-right font-medium text-[var(--muted-foreground)]">
                Weight
              </th>
              <th className="pl-3 pr-4 py-3 text-right font-medium text-[var(--muted-foreground)]">
                <InfoTooltip term={GLOSSARY.change}>Change</InfoTooltip>
              </th>
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
                <td className="px-3 py-3">
                  <OptionExposure holding={h} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-[var(--muted-foreground)]">
                  {formatShares(h.adjustedShares)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-medium">
                  {formatValue(h.rawValue)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-[var(--muted-foreground)]">
                  {h.weightPercent != null ? `${h.weightPercent.toFixed(1)}%` : '—'}
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
          {holdings.length} positions · Values in USD · Shares are split-adjusted · Weight = % of portfolio
        </p>
      </div>
    </div>
  )
}
