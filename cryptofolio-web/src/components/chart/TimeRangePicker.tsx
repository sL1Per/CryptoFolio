import type { TimeRange } from '../../types'
import { SegmentedControl } from '../ui/SegmentedControl'

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7D', label: '7D' }, { value: '1M', label: '1M' }, { value: '1Y', label: '1Y' }, { value: '5Y', label: '5Y' },
]

export function TimeRangePicker({ value, onChange }: { value: TimeRange; onChange: (r: TimeRange) => void }) {
  return <SegmentedControl options={OPTIONS} value={value} onChange={onChange} />
}
