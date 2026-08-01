import { useState } from 'react'
import { usePortfolioStore } from '../../store/portfolioStore'
import { POPULAR_COINS, EXCHANGES } from '../../lib/constants'
import { Modal } from '../ui/Modal'
import type { Holding } from '../../types'

export function AddHoldingModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing?: Holding
}) {
  const { addHolding, updateHolding, removeHolding } = usePortfolioStore()
  const [coinId, setCoinId] = useState(editing?.coin.id ?? POPULAR_COINS[0].id)
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [exchangeId, setExchangeId] = useState(editing?.exchangeId ?? EXCHANGES[0].id)

  const fieldClass = 'w-full rounded-lg border border-field-border bg-field-bg px-3 py-2 text-sm text-text-primary font-mono'

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
          <select aria-label="Exchange" className={fieldClass} value={exchangeId} onChange={(e) => setExchangeId(e.target.value)}>
            {EXCHANGES.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </label>
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
