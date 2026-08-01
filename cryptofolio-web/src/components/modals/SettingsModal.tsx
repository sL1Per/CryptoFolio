import { usePortfolioStore } from '../../store/portfolioStore'
import { useThemeStore } from '../../store/themeStore'
import { Modal } from '../ui/Modal'
import { SegmentedControl } from '../ui/SegmentedControl'
import type { AppearanceMode, Currency } from '../../types'

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'usd', label: 'USD' },
  { value: 'eur', label: 'EUR' },
]
const APPEARANCES: { value: AppearanceMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currency, setCurrency } = usePortfolioStore()
  const { appearance, setAppearance } = useThemeStore()
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-text-tertiary">Currency</span>
          <SegmentedControl options={CURRENCIES} value={currency} onChange={setCurrency} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-text-tertiary">Appearance</span>
          <SegmentedControl options={APPEARANCES} value={appearance} onChange={setAppearance} />
        </div>
        <p className="pt-2 text-center text-xs text-text-tertiary">Made with ♥ by Pedro Viegas and Claude.ai — 2026</p>
      </div>
    </Modal>
  )
}
