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
  /** Unique identifier of the portal */
  id: string
  /** Internal name of the portal */
  name: string
  /** Human-readable display name of the portal */
  displayName: string
  /** Description of the portal */
  description: string
  /** HTTPS origin used to load the portal preview */
  origin: string
  /** Canonical domain of the portal */
  canonicalDomain: string
  /**
   * Konnect region the portal lives in (e.g. 'us', 'eu').
   * Drives the region used for all subsequent API/kongctl calls for this portal.
   * Optional for backwards compatibility with configs stored before region support was added.
   */
  region?: string
}

/**
 * A Konnect portal tagged with the region it was discovered in
 */
export interface KonnectPortalWithRegion extends KonnectPortal {
  /** Konnect region this portal was fetched from (e.g. 'us', 'eu') */
  region: string
}

/**
 * A failure that occurred while fetching portals from a single region
 */
export interface RegionFetchError {
  /** Konnect region that failed to fetch */
  region: string
  /** The error that occurred while fetching this region */
  error: Error
}

/**
 * Aggregated result of fetching portals across multiple Konnect regions
 */
export interface MultiRegionPortalsResult {
  /** Portals successfully fetched, each tagged with its region */
  portals: KonnectPortalWithRegion[]
  /** Per-region failures encountered while fetching (e.g. opt-in region not enabled) */
  errors: RegionFetchError[]
}
