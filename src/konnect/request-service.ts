import { executeKongctl } from '../kongctl'
import { parseKongctlJsonOutput } from '../kongctl/parse'
import { checkKongctlAvailable } from '../kongctl/status'
import { KonnectApiService, ApiError } from './api'
import type { PortalStorageService } from '../storage'
import type { KonnectPortal, KonnectPortalWithRegion, MultiRegionPortalsResult, RegionFetchError } from '../types/konnect'
import type { KongctlCommandResult } from '../types/kongctl'
import { API_ERROR_MESSAGES } from '../constants/messages'
import { debug } from '../utils/debug'

/**
 * Detects whether a failed kongctl command result indicates an authentication
 * failure (an invalid or missing Personal Access Token), based on common
 * patterns kongctl emits for HTTP 401 responses.
 * @param result The failed kongctl command result to inspect
 * @returns True if the failure looks like an auth failure
 */
function isKongctlAuthFailure(result: KongctlCommandResult): boolean {
  const output = `${result.stderr} ${result.stdout}`.toLowerCase()
  return /\b401\b/.test(output) ||
    output.includes('unauthorized') ||
    output.includes('invalid personal access token') ||
    output.includes('invalid token')
}

/**
 * Service that provides a unified interface for Konnect requests
 * Attempts to use kongctl CLI first, then falls back to API requests
 */
export class KonnectRequestService {
  /** Service for making direct Konnect API requests */
  private readonly apiService: KonnectApiService

  /** Service for managing secure storage of portal configuration */
  private readonly storageService: PortalStorageService

  /**
   * Cache for the in-flight/resolved kongctl availability check. Caching the
   * promise itself (not just its resolved value) avoids a stampede: multiple
   * regions fetched concurrently would otherwise all observe the cache as
   * unset before the first check resolves, each spawning its own redundant check.
   */
  private kongctlAvailablePromise?: Promise<boolean>

  /**
   * Creates a new KonnectRequestService instance
   * @param storageService Service for managing portal configuration storage
   */
  constructor(storageService: PortalStorageService) {
    this.apiService = new KonnectApiService()
    this.storageService = storageService
  }

  /**
   * Checks if kongctl is available, with caching
   * @returns Promise resolving to true if kongctl is available
   */
  private async isKongctlAvailable(): Promise<boolean> {
    if (!this.kongctlAvailablePromise) {
      this.kongctlAvailablePromise = checkKongctlAvailable()
    }
    return this.kongctlAvailablePromise
  }

  /**
   * Fetches all portals for a single Konnect region using kongctl CLI or API fallback
   * @param region Konnect region to fetch portals from (e.g. 'us', 'eu')
   * @returns Promise resolving to array of portals
   */
  async fetchAllPortals(region: string): Promise<KonnectPortal[]> {
    const token = await this.storageService.getToken()
    if (!token) {
      throw new Error('No authentication token available')
    }

    return await this.fetchPortalsForRegion(token, region)
  }

  /**
   * Fetches all portals across multiple Konnect regions in parallel, tagging
   * each portal with the region it was found in. Per-region failures (e.g. an
   * opt-in region not enabled for this org, or a region the account isn't
   * provisioned in at all) are tolerated and collected in `errors` rather than
   * failing the whole call -- the region list comes from a global, unscoped
   * endpoint, so an account may legitimately not exist in every region, and
   * Konnect can report that as a 401 rather than a 403.
   *
   * The only time a 401 is treated as proof the shared PAT itself is invalid
   * (and rethrown so the caller clears it) is when *every* queried region
   * reports one -- a single region's 401 does not mean the same for the rest.
   * @param regions Konnect regions to query (e.g. ['us', 'eu', 'au'])
   * @returns Promise resolving to the discovered portals and any per-region errors
   */
  async fetchAllPortalsAcrossRegions(regions: string[]): Promise<MultiRegionPortalsResult> {
    const token = await this.storageService.getToken()
    if (!token) {
      throw new Error('No authentication token available')
    }

    const settled = await Promise.allSettled(
      regions.map(region => this.fetchPortalsForRegion(token, region)),
    )

    const authFailures = settled.filter(
      (result): result is PromiseRejectedResult =>
        result.status === 'rejected' && result.reason instanceof ApiError && result.reason.statusCode === 401,
    )
    if (authFailures.length > 0 && authFailures.length === settled.length) {
      throw authFailures[0].reason
    }

    const portals: KonnectPortalWithRegion[] = []
    const errors: RegionFetchError[] = []

    settled.forEach((result, index) => {
      const region = regions[index]
      if (result.status === 'fulfilled') {
        result.value.forEach(portal => portals.push({ ...portal, region }))
      } else {
        const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason))
        errors.push({ region, error })
      }
    })

    return { portals, errors }
  }

  /**
   * Fetches portals for a single region, trying kongctl first and falling back
   * to the direct API. A 401 from kongctl (invalid/missing PAT) is thrown
   * immediately without falling back to the API, since the same token would
   * fail identically there.
   * @param token Konnect PAT token
   * @param region Konnect region to fetch portals from
   * @returns Promise resolving to array of portals
   */
  private async fetchPortalsForRegion(token: string, region: string): Promise<KonnectPortal[]> {
    if (await this.isKongctlAvailable()) {
      try {
        return await this.fetchPortalsWithKongctl(region)
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) {
          throw error
        }
        // Non-auth kongctl failure: fall back to the API. Logged rather than
        // shown as a dialog here, since this path can run concurrently across
        // several regions -- the caller shows one dialog for the final outcome.
        debug.warn(`Failed to fetch portals with kongctl for region '${region}', falling back to API`, error)
      }
    }

    return await this.apiService.fetchAllPortals(token, region)
  }

  /**
   * Fetches portals using kongctl CLI with both terminal visibility and result capture
   * @param region Konnect region to fetch portals from
   * @returns Promise resolving to array of portals
   */
  private async fetchPortalsWithKongctl(region: string): Promise<KonnectPortal[]> {
    const allPortals: KonnectPortal[] = []
    let currentPage = 1
    const pageSize = 100

    // Continue fetching pages until we have all portals
    while (true) {
      const baseUrl = `https://${region}.api.konghq.com/v3/portals?page%5Bsize%5D=${pageSize}&page%5Bnumber%5D=${currentPage}`

      const args = [
        'api',
        'get',
        `"${baseUrl}"`,
        '--output',
        'json',
      ]

      // Silent, programmatic call, and callers may fetch several regions
      // concurrently -- use the isolated spawn fallback (fresh env/token per
      // invocation) rather than the shared terminal, which only applies its
      // env once at creation and isn't safe for concurrent commands.
      const result = await executeKongctl(args, { showInTerminal: false }, this.storageService)

      if (!result.success) {
        if (isKongctlAuthFailure(result)) {
          throw new ApiError(API_ERROR_MESSAGES.INVALID_TOKEN, undefined, 401)
        }
        throw new Error(result.stderr || result.stdout)
      }

      // Use shared kongctl output parser for robust JSON extraction
      let response
      try {
        response = parseKongctlJsonOutput(result.stdout)
      } catch (parseError) {
        throw new Error(`Failed to parse kongctl response: ${parseError}`)
      }

      // Add portals from this page to the collection
      if (response.data && Array.isArray(response.data)) {
        allPortals.push(...response.data)
      }

      // Check if there are more pages to fetch
      if (!response.meta?.page) {
        // No pagination metadata, assume single page
        break
      }

      const { number, size, total } = response.meta.page

      // Handle edge cases that could cause infinite loops
      if (total === 0 || size === 0) {
        // No more data to fetch
        break
      }

      const totalPages = Math.ceil(total / size)

      if (number >= totalPages) {
        // We've fetched all pages
        break
      }

      // Move to next page
      currentPage = number + 1
    }

    return allPortals
  }

  /**
   * Resets the kongctl availability cache
   * Call this when kongctl installation status might have changed
   */
  resetKongctlAvailability(): void {
    this.kongctlAvailablePromise = undefined
  }
}
