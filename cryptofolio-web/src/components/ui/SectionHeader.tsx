import type { ReactNode } from 'react'

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-1 py-2 text-xs uppercase tracking-wider text-text-tertiary font-mono">
      {children}
    </div>
  )
}
