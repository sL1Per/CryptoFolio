import { describe, it, expect } from 'vitest'
import { imagesTransform } from './images'

describe('imagesTransform', () => {
  it('maps a valid markets array to id→image', () => {
    expect(imagesTransform([{ id: 'bitcoin', image: 'u1' }, { id: 'ethereum', image: 'u2' }]))
      .toEqual({ bitcoin: 'u1', ethereum: 'u2' })
  })
  it('returns an empty object for non-array payloads', () => {
    expect(imagesTransform(null)).toEqual({})
    expect(imagesTransform({})).toEqual({})
    expect(imagesTransform('nope')).toEqual({})
  })
  it('skips entries missing or mistyping id/image', () => {
    expect(imagesTransform([{ id: 'bitcoin', image: 'u1' }, { id: 123, image: 'x' }, { id: 'eth' }, null]))
      .toEqual({ bitcoin: 'u1' })
  })
})
