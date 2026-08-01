import '@testing-library/jest-dom'

// Ensure localStorage is available with clear method in tests
if (!window.localStorage || typeof window.localStorage.clear !== 'function') {
  const store: Record<string, string> = {}
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString()
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        Object.keys(store).forEach(key => delete store[key])
      },
      key: (index: number) => Object.keys(store)[index] || null,
      length: Object.keys(store).length,
    },
  })
}
