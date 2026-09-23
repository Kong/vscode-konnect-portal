import { describe, expect, it } from 'vitest'
import { getNextPageNumber } from './pagination'

describe('getNextPageNumber', () => {
  it('advances when the server repeats a previous page number', async () => {
    expect(getNextPageNumber(2, { number: 1, size: 1, total: 3 })).toBe(3)
  })

  it('uses a valid server page when it is ahead of the requested page', async () => {
    expect(getNextPageNumber(1, { number: 2, size: 1, total: 3 })).toBe(3)
  })

  it('stops after the final bounded page', async () => {
    expect(getNextPageNumber(3, { number: 1, size: 1, total: 3 })).toBeUndefined()
  })

  it.each([
    undefined,
    { number: Number.NaN, size: 1, total: 2 },
    { number: 1, size: 0, total: 2 },
    { number: 1, size: 1, total: Number.NaN },
  ])('stops for missing or malformed metadata', async (page) => {
    expect(getNextPageNumber(1, page)).toBeUndefined()
  })
})
