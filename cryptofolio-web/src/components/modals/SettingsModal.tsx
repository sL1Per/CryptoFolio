import { useRef, useState } from 'react'
import { Download, Upload, Trash2, AlertTriangle } from 'lucide-react'
import { usePortfolioStore } from '../../store/portfolioStore'
import { useThemeStore } from '../../store/themeStore'
import { Modal } from '../ui/Modal'
import { SegmentedControl } from '../ui/SegmentedControl'
import { downloadPortfolioJson, parsePortfolioImport } from '../../lib/exportPortfolio'
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
  const { currency, setCurrency, holdings, customExchanges, importPortfolio, resetAll } = usePortfolioStore()
  const { appearance, setAppearance } = useThemeStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const handleResetAll = () => {
    resetAll()
    setAppearance('dark') // full factory reset also restores default appearance
    setConfirmingReset(false)
    setImportError(null)
    onClose()
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setImportError(null)
    try {
      const parsed = parsePortfolioImport(await file.text())
      if (
        holdings.length > 0 &&
        !window.confirm(`This will replace your current ${holdings.length} holding(s). Continue?`)
      )
        return
      importPortfolio(parsed.holdings, parsed.currency, parsed.customExchanges)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not import file.')
    }
  }

  const handleClose = () => {
    setConfirmingReset(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Settings">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-text-tertiary">Currency</span>
          <SegmentedControl options={CURRENCIES} value={currency} onChange={setCurrency} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-text-tertiary">Appearance</span>
          <SegmentedControl options={APPEARANCES} value={appearance} onChange={setAppearance} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-text-tertiary">Data</span>
          <button
            onClick={() => downloadPortfolioJson(holdings, currency, Object.values(customExchanges))}
            disabled={holdings.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} /> Export portfolio (JSON)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            <Upload size={16} /> Import portfolio (JSON)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="hidden"
          />
          {importError && <p className="text-xs text-red-400">{importError}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-text-tertiary">Danger zone</span>
          {!confirmingReset ? (
            <button
              onClick={() => setConfirmingReset(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10"
            >
              <Trash2 size={16} /> Delete all data
            </button>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
              <div className="flex items-start gap-2 text-sm text-text-primary">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
                <p>
                  {`Delete ${holdings.length} holding${holdings.length === 1 ? '' : 's'} and all settings? ` +
                    'This resets the app to its default state and cannot be undone.'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingReset(false)}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetAll}
                  className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600"
                >
                  Delete everything
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
