import { useState } from 'react'
import { usePortfolioStore } from '../store/portfolioStore'
import { AppShell } from '../components/layout/AppShell'
import { TotalPortfolioCard } from '../components/portfolio/TotalPortfolioCard'
import { ControlBar } from '../components/portfolio/ControlBar'
import { TokenGroupedGrid } from '../components/portfolio/TokenGroupedGrid'
import { FlatHoldingsGrid } from '../components/portfolio/FlatHoldingsGrid'
import { ExchangeGroupedGrid } from '../components/portfolio/ExchangeGroupedGrid'
import { AddHoldingModal } from '../components/modals/AddHoldingModal'
import { SettingsModal } from '../components/modals/SettingsModal'
import type { Holding } from '../types'

export function PortfolioPage() {
  const holdings = usePortfolioStore((s) => s.holdings)
  const groupMode = usePortfolioStore((s) => s.groupMode)
  const [addOpen, setAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<Holding | null>(null)

  return (
    <AppShell onAdd={() => setAddOpen(true)} onSettings={() => setSettingsOpen(true)}>
      <div className="flex flex-col gap-5">
        <TotalPortfolioCard />
        <ControlBar />
        {holdings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-text-tertiary">
            No holdings yet — tap Add to track your first coin.
          </div>
        ) : groupMode === 'token' ? (
          <TokenGroupedGrid />
        ) : groupMode === 'exchange' ? (
          <ExchangeGroupedGrid onEditHolding={setEditing} />
        ) : (
          <FlatHoldingsGrid onEditHolding={setEditing} />
        )}
      </div>
      {addOpen && <AddHoldingModal open onClose={() => setAddOpen(false)} />}
      {editing && <AddHoldingModal open editing={editing} onClose={() => setEditing(null)} />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </AppShell>
  )
}
