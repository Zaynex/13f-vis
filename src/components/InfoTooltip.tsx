// InfoTooltip — hover tooltip for glossary terms
'use client'

interface InfoTooltipProps {
  term: string
  children: React.ReactNode
}

export function InfoTooltip({ term, children }: InfoTooltipProps) {
  return (
    <span className="group relative inline-flex items-center gap-1">
      {children}
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--foreground)] shadow-lg z-50 whitespace-normal">
        {term}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--border)]" />
      </span>
    </span>
  )
}
