import type { KonnectPortalSnippet } from '../../../types/konnect/snippets'

/** Checks whether an unknown API item is safe to use as a portal snippet. */
export function isKonnectPortalSnippet(value: unknown): value is KonnectPortalSnippet {
  if (typeof value !== 'object' || value === null) return false

  const snippet = value as Record<string, unknown>
  return typeof snippet.id === 'string' &&
    typeof snippet.name === 'string' &&
    (snippet.title === undefined || typeof snippet.title === 'string') &&
    (snippet.description === undefined || typeof snippet.description === 'string')
}
