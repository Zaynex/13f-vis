// Change Badge — visual indicator of QoQ position change
//
// Badges appear in the holdings table and comparison view.
// Each badge is color-coded for instant visual parsing:
//   NEW       — institution initiated a new position this quarter
//   EXITED    — institution closed a position this quarter
//   INCREASED — >1% increase in shares
//   DECREASED — >1% decrease in shares
//   UNCHANGED — <1% change

import type { ChangeType } from '@prisma/client'

interface ChangeBadgeProps {
  type: ChangeType | 'UNCHANGED'
  percent?: number | null
  compact?: boolean
}

const LABELS: Record<string, string> = {
  NEW: 'NEW',
  EXITED: 'EXITED',
  INCREASED: '▲',
  DECREASED: '▼',
  UNCHANGED: '—',
}

const COLORS: Record<string, string> = {
  NEW: 'badge-new',
  EXITED: 'badge-exited',
  INCREASED: 'badge-increased',
  DECREASED: 'badge-decreased',
  UNCHANGED: 'badge-unchanged',
}

export function ChangeBadge({ type, percent, compact = false }: ChangeBadgeProps) {
  const label = LABELS[type] ?? '—'
  const colorClass = COLORS[type] ?? 'badge-unchanged'

  const pct =
    percent !== null && percent !== undefined
      ? `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`
      : null

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${colorClass}`}
      title={pct ? `${type} by ${pct}` : type}
    >
      <span>{compact ? label : `${label}`}</span>
      {pct && <span className="text-2xs opacity-80">{pct}</span>}
    </span>
  )
}
