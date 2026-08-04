export interface ChartSeriesOption {
  value: string
  label: string
}

/**
 * Horizontally-scrollable chip row that switches the chart between the aggregate
 * ('Total') and each held token. Scrolls when there are more tokens than fit.
 */
export function ChartSeriesSelector({
  options,
  value,
  onChange,
}: {
  options: ChartSeriesOption[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`min-h-[32px] shrink-0 rounded-md px-3 py-1 font-mono text-xs transition-colors ${
              active ? 'bg-[var(--gold-card-bg)] text-gold' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
