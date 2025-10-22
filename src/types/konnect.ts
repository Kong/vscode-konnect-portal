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
export interface KonnectPaginationMeta {
  page: {
    total: number
    size: number
    number: number
    next?: string
  }
}

/**
 * Response from Konnect portals API
 */
export interface KonnectPortalsResponse {
  data: KonnectPortal[]
  meta: KonnectPaginationMeta
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

/**
 * API error response with optional trace ID
 */
export interface KonnectAPIError extends Error {
  status?: number
  traceId?: string
}
