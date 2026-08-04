import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  it('caps height and scrolls its panel so tall content stays reachable', () => {
    render(
      <Modal open onClose={() => {}} title="Test">
        <p>content</p>
      </Modal>,
    )
    const panel = screen.getByRole('dialog')
    expect(panel.className).toMatch(/overflow-y-auto/)
    expect(panel.className).toMatch(/max-h-\[90dvh\]/)
  })
})
