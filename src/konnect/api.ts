import type { KonnectPortalsResponse, KonnectPortal } from '../types/konnect'
import type { ApiErrorInfo } from '../types'

/**
 * Custom error class for API errors with trace ID support
 */
export class ApiError extends Error {
  public readonly traceId?: string
  public readonly statusCode?: number

  constructor(message: string, traceId?: string, statusCode?: number) {
    super(message)
    this.name = 'ApiError'
    this.traceId = traceId
    this.statusCode = statusCode
  }

  /**
   * Creates error info object for VS Code error handling
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
 * Base API configuration for Konnect
 */
const KONNECT_BASE_URL = 'https://us.api.konghq.com'
const API_VERSION = 'v3'

/**
 * Service for interacting with the Konnect API
 */
export class KonnectApiService {
  private readonly baseUrl: string
  private readonly timeout: number

  constructor(timeout = 10000) {
    this.baseUrl = `${KONNECT_BASE_URL}/${API_VERSION}`
    this.timeout = timeout
  }

  /**
   * Fetches all portals from Konnect API with pagination support
   * @param token Personal Access Token
   * @returns Promise resolving to array of all portals
   * @throws ApiError on API errors
   */
  async fetchAllPortals(token: string): Promise<KonnectPortal[]> {
    const allPortals: KonnectPortal[] = []
    let nextUrl: string | null = `${this.baseUrl}/portals`

    while (nextUrl) {
      const response: KonnectPortalsResponse = await this.fetchRequest<KonnectPortalsResponse>(nextUrl, token)

      allPortals.push(...response.data)

      // Check for pagination
      nextUrl = response.meta?.page?.next || null
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
        throw new Error('Request timeout - please check your connection and try again')
      }

      if (error instanceof Error) {
        throw error
      }

      throw new Error('Unknown error occurred while fetching portals')
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
        throw new ApiError('Invalid or expired Personal Access Token. Please update your token in settings.', traceId, response.status)
      case 403:
        throw new ApiError('Access denied. Please ensure your Personal Access Token has the required permissions to access portals.', traceId, response.status)
      case 404:
        throw new ApiError('API endpoint not found. Please ensure you are using a valid Konnect account.', traceId, response.status)
      case 429:
        throw new ApiError('Rate limit exceeded. Please wait a moment before trying again.', traceId, response.status)
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ApiError('Server error occurred. Please try again later.', traceId, response.status)
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
