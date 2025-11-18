import type { KonnectPortal, KonnectPortalsResponse } from '../types/konnect'
import type { ApiErrorInfo } from '../types'
import { API_ERROR_MESSAGES } from '../constants/messages'
import { workspace } from 'vscode'

/**
 * Custom error class for API errors with trace ID support
 */
export class ApiError extends Error {
  /** Datadog Trace ID for debugging API requests */
  public readonly traceId?: string

  /** HTTP status code from the failed request */
  public readonly statusCode?: number

  /**
   * Creates a new ApiError instance
   * @param message Error message describing the issue
   * @param traceId Optional trace ID for debugging
   * @param statusCode Optional HTTP status code
   */
  constructor(message: string, traceId?: string, statusCode?: number) {
    super(message)
    this.name = 'ApiError'
    this.traceId = traceId
    this.statusCode = statusCode
  }

  /**
   * Creates error info object for VS Code error handling
   * @returns ApiErrorInfo object containing error details
   */
  toErrorInfo(): ApiErrorInfo {
    return {
      message: this.message,
      traceId: this.traceId,
      statusCode: this.statusCode,
    }
  }
}


/**
 * Returns the Konnect API base URL for the selected region
 * @returns Base URL string (e.g., 'https://us.api.konghq.com')
 */
function getKonnectBaseUrl(): string {
  // Read region from global/user settings, fallback to 'us'
  const config = workspace.getConfiguration()
  const region = config.get<string>('kong.konnect.region', 'us')
  return `https://${region}.api.konghq.com`
}

const API_VERSION = 'v3'

/**
 * Service for interacting with the Konnect API
 */
export class KonnectApiService {
  /** Base URL for all API requests */
  private baseUrl: string

  /** Request timeout in milliseconds */
  private readonly timeout: number

  /**
   * Creates a new KonnectApiService instance
   * @param timeout Request timeout in milliseconds (default: 10000)
   */
  constructor(timeout = 10000) {
    this.baseUrl = `${getKonnectBaseUrl()}/${API_VERSION}`
    this.timeout = timeout
  }

  /**
   * Updates the base URL (call if region changes at runtime)
   */
  updateBaseUrl(): void {
    this.baseUrl = `${getKonnectBaseUrl()}/${API_VERSION}`
  }

  /**
   * Fetches all portals from Konnect API with pagination support
   * @param token Personal Access Token
   * @returns Promise resolving to array of all portals
   * @throws ApiError on API errors
   */
  /**
   * Fetches all portals for the authenticated user, handling pagination automatically
   * @param token Konnect PAT token
   * @returns Promise resolving to array of all portals
   */
  async fetchAllPortals(token: string): Promise<KonnectPortal[]> {
    const allPortals: KonnectPortal[] = []
    let currentPage = 1
    const pageSize = 100

    // Continue fetching pages until we have all portals
    while (true) {
      const url = `${this.baseUrl}/portals?page%5Bsize%5D=${pageSize}&page%5Bnumber%5D=${currentPage}`

      const response = await this.fetchRequest<KonnectPortalsResponse>(url, token, {
        method: 'GET',
      })

      // Add portals from this page to the collection (handle empty or missing data)
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
   * Makes an authenticated request to the Konnect API with flexible options
   * @param url Full URL to request
   * @param token Personal Access Token
   * @param options Additional fetch options (method, headers, body, etc.)
   * @returns Promise resolving to parsed response
   * @throws ApiError on API errors
   */
  private async fetchRequest<T>(
    url: string,
    token: string,
    options: Omit<RequestInit, 'signal'> = {},
  ): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    // Merge default headers with provided headers
    const defaultHeaders = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    }

    const mergedHeaders = {
      ...defaultHeaders,
      ...options.headers,
    }

    // Merge default options with provided options
    const fetchOptions: RequestInit = {
      method: 'GET',
      ...options,
      headers: mergedHeaders,
      signal: controller.signal,
    }

    try {
      const response = await fetch(url, fetchOptions)

      clearTimeout(timeoutId)

      if (!response.ok) {
        await this.handleApiError(response)
      }

      return await response.json() as T
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(API_ERROR_MESSAGES.REQUEST_TIMEOUT)
      }

      if (error instanceof Error) {
        throw error
      }

      throw new Error(API_ERROR_MESSAGES.UNKNOWN_ERROR)
    }
  }

  /**
   * Handles API error responses and throws appropriate ApiError
   * @param response Failed fetch response
   * @throws ApiError with trace ID support
   */
  private async handleApiError(response: Response): Promise<never> {
    let errorBody: any
    let traceId: string | undefined

    try {
      errorBody = await response.json()

      // Look for trace ID in multiple possible locations
      traceId = response.headers.get('x-datadog-trace-id') || undefined
    } catch {
      // If we can't parse the error body, fall back to status text
      errorBody = { message: response.statusText }

      // Still try to get trace ID from headers even if body parsing fails
      traceId = response.headers.get('x-datadog-trace-id') || undefined
    }

    switch (response.status) {
      case 401:
        throw new ApiError(API_ERROR_MESSAGES.INVALID_TOKEN + '. Please update your token in settings.', traceId, response.status)
      case 403:
        throw new ApiError(API_ERROR_MESSAGES.ACCESS_DENIED + '. Please ensure your Personal Access Token has the required permissions to access portals.', traceId, response.status)
      case 404:
        throw new ApiError(API_ERROR_MESSAGES.API_NOT_FOUND + '. Please ensure you are using a valid Konnect account.', traceId, response.status)
      case 429:
        throw new ApiError(API_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED + '. Please wait a moment before trying again.', traceId, response.status)
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ApiError(API_ERROR_MESSAGES.SERVER_ERROR + '. Please try again later.', traceId, response.status)
      default:
        throw new ApiError(errorBody.message || response.statusText, traceId, response.status)
    }
  }

  /**
   * Validates that a token appears to be a valid Konnect PAT format
   * @param token Token to validate
   * @returns True if token format appears valid
   */
  static validateTokenFormat(token: string): boolean {
    // Konnect PATs typically start with 'kpat_' and are longer than 20 characters
    return token.trim().length > 20 && /^kpat_/.test(token.trim())
  }
}
