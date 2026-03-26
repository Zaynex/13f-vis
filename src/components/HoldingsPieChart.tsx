// Holdings Pie Chart — single institution portfolio distribution
//
// Shows Top 10 holdings + Others bucket as a pie chart.
// Data: holdings[].rawValue, sorted by value descending.
//
// Features:
// - Top 10 colored slices + gray "Others" bucket
// - Hover tooltip: company name, weight %, value, QoQ change badge
// - Responsive: legend below pie on small screens, right side on large screens

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { HoldingRow } from './HoldingsTable'
import { computePieSlices, type PieSlice } from '@/lib/holdings-pie'

// Dark-theme friendly color palette — 10 distinct colors on dark backgrounds
const PIE_COLORS = [
  '#6366f1', // indigo
  '#22d3ee', // cyan
  '#fb923c', // orange
  '#a3e635', // lime
  '#f472b6', // pink
  '#fbbf24', // amber
  '#34d399', // emerald
  '#a78bfa', // violet
  '#f87171', // red
  '#38bdf8', // sky
]
const OTHERS_COLOR = '#4b5563' // gray-500

function formatValue(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

function ChangePill({ type, percent }: { type: string; percent: number | null }) {
  const arrows: Record<string, string> = {
    NEW: '★ New',
    INCREASED: '▲',
    DECREASED: '▼',
    UNCHANGED: '–',
    EXITED: '✕',
  }
  const colorMap: Record<string, string> = {
    NEW: 'text-green-400',
    INCREASED: 'text-green-400',
    DECREASED: 'text-red-400',
    UNCHANGED: 'text-gray-400',
    EXITED: 'text-red-400',
  }
  const arrow = arrows[type] ?? type
  const pct = percent != null ? `${Math.abs(percent).toFixed(0)}%` : ''
  const cls = colorMap[type] ?? 'text-gray-400'
  return (
    <span className={`text-xs font-medium ${cls}`}>
      {arrow}{pct ? ` ${pct}` : ''}
    </span>
  )
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ payload: PieSlice }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-md">
      <p className="font-medium text-[var(--foreground)]">{d.companyName}</p>
      <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
        {formatValue(d.rawValue)} · {d.weightPercent.toFixed(1)}%
      </p>
      {!d.isOthers && (
        <div className="mt-1">
          <ChangePill type={d.changeType} percent={d.changePercent} />
        </div>
      )}
    </div>
  )
}

interface LegendItemProps {
  slice: PieSlice
  color: string
}

function LegendItem({ slice, color }: LegendItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="truncate text-sm text-[var(--foreground)]">
          {slice.companyName}
        </span>
      </div>
      <span className="shrink-0 text-sm font-medium text-[var(--muted-foreground)]">
        {slice.weightPercent.toFixed(1)}%
      </span>
    </div>
  )
}

interface HoldingsPieChartProps {
  holdings: HoldingRow[]
}

/**
 * HoldingsPieChart — renders a pie chart of portfolio distribution.
 *
 * `holdings` should be sorted by value descending (same order as the holdings table).
 * Top 10 are colored; remaining holdings are bucketed as gray "Others".
 *
 * Note: changeType reflects comparison against the PRIOR quarter — if viewing a
 * non-consecutive quarter, the change badge may not reflect what the user expects.
 */
export function HoldingsPieChart({ holdings }: HoldingsPieChartProps) {
  if (holdings.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] py-12 text-sm text-[var(--muted-foreground)]">
        No holdings to display.
      </div>
    )
  }

  const slices = computePieSlices(holdings)

  // Legend: top 10 + others (if present)
  const legendItems = slices
  const maxLegendItems = 11 // top 10 + others

  return (
    <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">
        Holdings Distribution
      </h2>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Pie chart */}
        <div className="relative flex-shrink-0">
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="rawValue"
                nameKey="companyName"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={75}
                paddingAngle={1}
                startAngle={90}
                endAngle={-270}
              >
                {slices.map((entry, index) => (
                  <Cell
                    key={entry.cusip}
                    fill={entry.isOthers ? OTHERS_COLOR : PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="min-w-0 flex-1">
          <div className="space-y-0.5">
            {legendItems.slice(0, maxLegendItems).map((slice, index) => (
              <LegendItem
                key={slice.cusip}
                slice={slice}
                color={slice.isOthers ? OTHERS_COLOR : PIE_COLORS[index % PIE_COLORS.length]}
              />
            ))}
          </div>
          {legendItems.length > maxLegendItems && (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              +{legendItems.length - maxLegendItems} more not shown
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
