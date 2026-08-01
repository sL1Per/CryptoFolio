import { usePortfolioStore } from '../../store/portfolioStore'
import { SegmentedControl } from '../ui/SegmentedControl'
import type { Currency, GroupMode, SortMode } from '../../types'

const GROUPS: { value: GroupMode; label: string }[] = [
  { value: 'token', label: 'Token' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'all', label: 'All' },
]
const SORTS: { value: SortMode; label: string }[] = [
  { value: 'value', label: 'Value' },
  { value: 'name', label: 'Name' },
  { value: 'change', label: '24h Change' },
]
const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'usd', label: 'USD' },
  { value: 'eur', label: 'EUR' },
]

export function ControlBar() {
  const { groupMode, sortMode, currency, setGroupMode, setSortMode, setCurrency } = usePortfolioStore()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl options={GROUPS} value={groupMode} onChange={setGroupMode} />
      <SegmentedControl options={SORTS} value={sortMode} onChange={setSortMode} />
      <div className="ml-auto">
        <SegmentedControl options={CURRENCIES} value={currency} onChange={setCurrency} />
      </div>
    </div>
  )
}
