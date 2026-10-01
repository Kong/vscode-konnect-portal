import type { KonnectPaginationMeta } from './index'

/** Portal snippet metadata returned by the Konnect Portal Management API */
export interface KonnectPortalSnippet {
  /** Unique identifier of the snippet */
  id: string
  /** Name used by the MDC Snippet component */
  name: string
  /** Optional human-readable snippet title */
  title?: string
  /** Optional snippet description */
  description?: string
}

/** Paginated response from the Konnect portal snippets endpoint */
export interface KonnectPortalSnippetsResponse {
  /** Snippets returned on the current page */
  data: KonnectPortalSnippet[]
  /** Pagination information, when supplied by the API */
  meta?: {
    page?: KonnectPaginationMeta
  }
}
