import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppearanceMode } from '../types'

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

export function applyAppearance(mode: AppearanceMode): void {
  const dark = mode === 'dark' || (mode === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

interface ThemeState {
  appearance: AppearanceMode
  setAppearance: (mode: AppearanceMode) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      appearance: 'dark',
      setAppearance: (mode) => {
        applyAppearance(mode)
        set({ appearance: mode })
      },
    }),
    {
      name: 'cryptofolio_appearance',
      onRehydrateStorage: () => (state) => {
        if (state) applyAppearance(state.appearance)
      },
    },
  ),
)
