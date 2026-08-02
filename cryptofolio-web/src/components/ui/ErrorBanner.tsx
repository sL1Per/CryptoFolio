import { X } from 'lucide-react'

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--gold-border)] bg-[var(--gold-card-bg)] px-3 py-2 text-xs text-text-secondary">
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-text-tertiary hover:text-text-primary">
        <X size={14} />
      </button>
    </div>
  )
}
