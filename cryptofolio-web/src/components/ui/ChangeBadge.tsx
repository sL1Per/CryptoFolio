import { asPercentChange } from '../../lib/formatters'

export function ChangeBadge({ change }: { change: number | undefined }) {
  if (change === undefined) return <span className="text-text-tertiary">—</span>
  return <span className={change >= 0 ? 'text-green' : 'text-red'}>{asPercentChange(change)}</span>
}
