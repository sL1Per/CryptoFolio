import '@testing-library/jest-dom'

// Vitest's jsdom environment exposes a `localStorage` object whose methods are
// non-functional (getItem/setItem/clear are undefined). Tests that rely on
// persistence (zustand persist middleware, .clear() in beforeEach) need a real
// in-memory Storage, so install one when the native methods are missing.
if (typeof window.localStorage?.setItem !== 'function') {
  const store: Record<string, string> = {}
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = String(value)
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key]
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length
      },
    },
  })
}
