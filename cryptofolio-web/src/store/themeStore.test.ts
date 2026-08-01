import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore, applyAppearance } from './themeStore'

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    useThemeStore.setState({ appearance: 'dark' })
  })

  it('applyAppearance(dark) adds the dark class', () => {
    applyAppearance('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('applyAppearance(light) removes the dark class', () => {
    document.documentElement.classList.add('dark')
    applyAppearance('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setAppearance updates state', () => {
    useThemeStore.getState().setAppearance('light')
    expect(useThemeStore.getState().appearance).toBe('light')
  })
})
