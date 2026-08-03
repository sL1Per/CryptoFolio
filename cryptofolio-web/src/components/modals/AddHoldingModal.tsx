import { useState } from 'react'
import { usePortfolioStore } from '../../store/portfolioStore'
import { POPULAR_COINS, EXCHANGES } from '../../lib/constants'
import { Modal } from '../ui/Modal'
import type { Holding } from '../../types'

const ADD_CUSTOM = '__add_custom__'

export function AddHoldingModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing?: Holding
}) {
  const { addHolding, updateHolding, removeHolding, addCustomExchange } = usePortfolioStore()
  const customExchanges = usePortfolioStore((s) => s.customExchanges)
  const [coinId, setCoinId] = useState(editing?.coin.id ?? POPULAR_COINS[0].id)
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [exchangeId, setExchangeId] = useState(editing?.exchangeId ?? EXCHANGES[0].id)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customWebsite, setCustomWebsite] = useState('')

  const fieldClass = 'w-full rounded-lg border border-field-border bg-field-bg px-3 py-2 text-sm text-text-primary font-mono'
  const customList = Object.values(customExchanges)

  function onExchangeChange(value: string) {
    if (value === ADD_CUSTOM) {
      setShowCustomForm(true)
      return
    }
    setShowCustomForm(false)
    setExchangeId(value)
  }

  function addCustom() {
    if (!customName.trim()) return
    const ex = addCustomExchange(customName, customWebsite)
    setExchangeId(ex.id)
    setShowCustomForm(false)
    setCustomName('')
    setCustomWebsite('')
  }

  function cancelCustom() {
    setShowCustomForm(false)
    setCustomName('')
    setCustomWebsite('')
  }

  function save() {
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt <= 0) return
    if (editing) {
      updateHolding(editing.id, amt, exchangeId)
    } else {
      const coin = POPULAR_COINS.find((c) => c.id === coinId)
      if (!coin) return
      addHolding(coin, amt, exchangeId)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Holding' : 'Add Holding'}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Coin
          <select aria-label="Coin" className={fieldClass} value={coinId} onChange={(e) => setCoinId(e.target.value)} disabled={!!editing}>
            {POPULAR_COINS.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.symbol})</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Amount
          <input aria-label="Amount" className={fieldClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Exchange
          <select
            aria-label="Exchange"
            className={fieldClass}
            value={showCustomForm ? ADD_CUSTOM : exchangeId}
            onChange={(e) => onExchangeChange(e.target.value)}
          >
            {EXCHANGES.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
            {customList.length > 0 && (
              <optgroup label="Custom">
                {customList.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </optgroup>
            )}
            <option value={ADD_CUSTOM}>+ Add custom…</option>
          </select>
        </label>
        {showCustomForm && (
          <div className="flex flex-col gap-2 rounded-lg border border-field-border bg-field-bg/50 p-3">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Name
              <input
                aria-label="Custom exchange name"
                className={fieldClass}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Website (optional)
              <input
                aria-label="Custom exchange website"
                className={fieldClass}
                placeholder="e.g. river.com"
                value={customWebsite}
                onChange={(e) => setCustomWebsite(e.target.value)}
              />
            </label>
            <div className="flex items-center gap-2">
              <button onClick={addCustom} className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-black">Add</button>
              <button onClick={cancelCustom} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">Cancel</button>
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button onClick={save} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-black">Save</button>
          {editing && (
            <button
              onClick={() => {
                removeHolding(editing.id)
                onClose()
              }}
              className="rounded-lg border border-red px-4 py-2 text-sm text-red"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
