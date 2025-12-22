/**
 * Types for Konnect API integration
 */

/**
 * Portal data from Konnect API
 */
export interface KonnectPortal {
  id: string
  name: string
  display_name: string
  description: string
  default_domain: string
  canonical_domain: string
  authentication_enabled: boolean
  rbac_enabled: boolean
  auto_approve_developers: boolean
  auto_approve_applications: boolean
  default_api_visibility: string
  default_page_visibility: string
  default_application_auth_strategy_id: string | null
  labels: Record<string, unknown>
  updated_at: string
  created_at: string
}

/**
 * Pagination metadata from Konnect API
 */
/** Konnect API pagination metadata */
interface KonnectPaginationMeta {
  /** Current page number (1-based) */
  number: number
  /** Number of items per page */
  size: number
  /** Total number of items across all pages */
  total: number
}

/**
 * Response from Konnect portals API
 */
export interface KonnectPortalsResponse {
  data: KonnectPortal[]
  meta: {
    page: KonnectPaginationMeta
  }
}

/**
 * Stored portal configuration
 */
export interface StoredPortalConfig {
  id: string
  name: string
  displayName: string
  description: string
  origin: string
  canonicalDomain: string
}
