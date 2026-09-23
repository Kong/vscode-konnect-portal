import { describe, expect, it } from 'vitest'
import { isKonnectPortalSnippet } from './validation'

describe('isKonnectPortalSnippet', () => {
  it('accepts valid snippet metadata', async () => {
    expect(isKonnectPortalSnippet({ id: 'snippet-id', name: 'authentication-example' })).toBe(true)
  })

  it.each([
    null,
    { id: 'snippet-id' },
    { id: 'snippet-id', name: undefined },
    { id: 123, name: 'authentication-example' },
    { id: 'snippet-id', name: 'authentication-example', title: 123 },
  ])('rejects malformed snippet metadata', async (value) => {
    expect(isKonnectPortalSnippet(value)).toBe(false)
  })
})
