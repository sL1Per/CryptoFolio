import type { ReactNode } from 'react'
import { Plus, Settings, RefreshCw } from 'lucide-react'

export function AppShell({
  children,
  onAdd,
  onSettings,
  onRefresh,
  isRefreshing,
}: {
  children: ReactNode
  onAdd: () => void
  onSettings: () => void
  onRefresh: () => void
  isRefreshing: boolean
}) {
  return (
    <div className="min-h-full bg-app-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <h1 className="text-lg font-semibold tracking-tight text-gold">CryptoFolio</h1>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onRefresh} aria-label="Refresh prices" disabled={isRefreshing} className="rounded-lg border border-border p-2 text-text-secondary hover:text-text-primary disabled:opacity-50">
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={onAdd} aria-label="Add holding" className="flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-black">
              <Plus size={16} /> Add
            </button>
            <button onClick={onSettings} aria-label="Settings" className="rounded-lg border border-border p-2 text-text-secondary hover:text-text-primary">
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  )
}
