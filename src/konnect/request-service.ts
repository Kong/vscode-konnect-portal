import { workspace } from 'vscode'
/**
 * Gets the current Konnect region from settings (default 'us')
 */
function getKonnectRegion(): string {
  const config = workspace.getConfiguration()
  return config.get<string>('kong.konnect.region', 'us')
}
import type * as vscode from 'vscode'
import { executeKongctl } from '../kongctl'
import { parseKongctlJsonOutput } from '../kongctl/parse'
import { checkKongctlAvailable } from '../kongctl/status'
import { KonnectApiService, ApiError } from './api'
import type { PortalStorageService } from '../storage'
import type { KonnectPortal } from '../types/konnect'
import { showApiError } from '../utils/error-handling'

/**
 * Service that provides a unified interface for Konnect requests
 * Attempts to use kongctl CLI first, then falls back to API requests
 */
export class KonnectRequestService {
  /** Service for making direct Konnect API requests */
  private readonly apiService: KonnectApiService

  /** Service for managing secure storage of portal configuration */
  private readonly storageService: PortalStorageService

  /** VS Code extension context for error handling */
  private readonly context: vscode.ExtensionContext

  /** Cache for kongctl availability to avoid repeated checks */
  private kongctlAvailable?: boolean

  /**
   * Creates a new KonnectRequestService instance
   * @param storageService Service for managing portal configuration storage
   * @param context VS Code extension context
   */
  constructor(storageService: PortalStorageService, context: vscode.ExtensionContext) {
    this.apiService = new KonnectApiService()
    this.storageService = storageService
    this.context = context
  }

  /**
   * Checks if kongctl is available, with caching
   * @returns Promise resolving to true if kongctl is available
   */
  private async isKongctlAvailable(): Promise<boolean> {
    if (this.kongctlAvailable === undefined) {
      this.kongctlAvailable = await checkKongctlAvailable()
    }
    return this.kongctlAvailable
  }

  /**
   * Fetches all portals using kongctl CLI or API fallback
   * @returns Promise resolving to array of portals
   */
  async fetchAllPortals(): Promise<KonnectPortal[]> {
    const token = await this.storageService.getToken()
    if (!token) {
      throw new Error('No authentication token available')
    }

    // Try kongctl first if available
    if (await this.isKongctlAvailable()) {
      try {
        return await this.fetchPortalsWithKongctl()
      } catch (error) {
        // Show kongctl error to user and offer debug info
        await this.handleKongctlError('Failed to fetch portals with kongctl', error)
      }
    }

    // Use API as fallback or primary method
    return await this.apiService.fetchAllPortals(token)
  }

  /**
   * Fetches portals using kongctl CLI with both terminal visibility and result capture
   * @returns Promise resolving to array of portals
   */
  private async fetchPortalsWithKongctl(): Promise<KonnectPortal[]> {
    const allPortals: KonnectPortal[] = []
    let currentPage = 1
    const pageSize = 100

    // Continue fetching pages until we have all portals

    while (true) {
      const region = getKonnectRegion()
      const baseUrl = `https://${region}.api.konghq.com/v3/portals?page%5Bsize%5D=${pageSize}&page%5Bnumber%5D=${currentPage}`

      const args = [
        'api',
        'get',
        `"${baseUrl}"`,
        '--output',
        'json',
      ]

      // Execute command with terminal visibility and output capture
      const result = await executeKongctl(args, {}, this.storageService)

      if (!result.success) {
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
   * Handles kongctl command errors by showing them to the user
   * @param prefix Error message prefix
   * @param error The error that occurred
   */
  private async handleKongctlError(prefix: string, error: unknown): Promise<void> {
    let errorMessage = 'Unknown error occurred'

    if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    }

    // Create an ApiError-like object for consistent error handling
    const apiError = new ApiError(`Kongctl Error: ${errorMessage}`)

    await showApiError(prefix, apiError, this.context)
  }

  /**
   * Resets the kongctl availability cache
   * Call this when kongctl installation status might have changed
   */
  resetKongctlAvailability(): void {
    this.kongctlAvailable = undefined
  }
}
