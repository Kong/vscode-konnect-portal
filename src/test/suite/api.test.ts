import * as assert from 'assert'
import { KonnectApiService, ApiError } from '../../konnect/api'
import { API_ERROR_MESSAGES } from '../../constants/messages'
import type { KonnectPortal } from '../../types/konnect'

/** Test suite for Konnect API Service functionality */
suite('API Service Tests', () => {
  /** API service instance for testing */
  let apiService: KonnectApiService

  /** Original fetch function to restore after tests */
  let originalFetch: typeof globalThis.fetch

  /** Mock fetch calls storage */
  let mockFetchCalls: Array<[string, RequestInit?]>

  /** Mock fetch responses queue */
  let mockFetchResponses: Array<Response | Error>

  /** Sample valid Konnect token */
  const validToken = 'kpat_test123456789abcdefghijklmnopqrstuvwxyz'

  /** Sample portal data for testing */
  const samplePortal: KonnectPortal = {
    id: 'portal-123',
    name: 'test-portal',
    display_name: 'Test Portal',
    description: 'A test portal for unit testing',
    default_domain: 'test-portal.example.com',
    canonical_domain: 'test-portal.example.com',
    authentication_enabled: true,
    rbac_enabled: false,
    auto_approve_developers: false,
    auto_approve_applications: true,
    default_api_visibility: 'public',
    default_page_visibility: 'public',
    default_application_auth_strategy_id: null,
    labels: {},
    updated_at: '2023-01-01T00:00:00Z',
    created_at: '2023-01-01T00:00:00Z',
  }

  setup(async () => {
    // Store original fetch to restore later
    originalFetch = globalThis.fetch

    // Reset mock state
    mockFetchCalls = []
    mockFetchResponses = []

    // Install mock fetch
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Record the call
      const url = typeof input === 'string' ? input : input.toString()
      mockFetchCalls.push([url, init])

      // Return next queued response or error
      const response = mockFetchResponses.shift()
      if (response instanceof Error) {
        throw response
      }
      if (response) {
        return response
      }

      // Default successful response if none queued
      return new Response(JSON.stringify({ message: 'No mock response configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Create API service instance
    apiService = new KonnectApiService(5000) // 5 second timeout for tests
  })

  teardown(async () => {
    // Restore original fetch
    globalThis.fetch = originalFetch
  })

  /**
   * Helper to queue a mock fetch response
   */
  function queueMockResponse(response: Response | Error): void {
    mockFetchResponses.push(response)
  }

  /**
   * Helper to create a mock Response object
   */
  function createMockResponse(body: any, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    })
  }

  /**
   * Helper to get the last fetch call
   */
  function getLastFetchCall(): [string, RequestInit?] | undefined {
    return mockFetchCalls[mockFetchCalls.length - 1]
  }

  suite('Token Validation', () => {
    test('should validate correct Konnect PAT format', async () => {
      // Test valid token formats
      assert.strictEqual(KonnectApiService.validateTokenFormat('kpat_123456789012345678901'), true, 'Should accept valid kpat_ token')
      assert.strictEqual(KonnectApiService.validateTokenFormat('kpat_abcdefghijklmnopqrstuvwxyz'), true, 'Should accept valid long kpat_ token')
      assert.strictEqual(KonnectApiService.validateTokenFormat('  kpat_123456789012345678901  '), true, 'Should accept token with whitespace')
    })

    test('should reject invalid token formats', async () => {
      // Test invalid token formats
      assert.strictEqual(KonnectApiService.validateTokenFormat(''), false, 'Should reject empty token')
      assert.strictEqual(KonnectApiService.validateTokenFormat('short'), false, 'Should reject short token')
      assert.strictEqual(KonnectApiService.validateTokenFormat('kpat_short'), false, 'Should reject short kpat_ token')
      assert.strictEqual(KonnectApiService.validateTokenFormat('invalid_123456789012345678901'), false, 'Should reject token without kpat_ prefix')
      assert.strictEqual(KonnectApiService.validateTokenFormat('   '), false, 'Should reject whitespace-only token')
    })
  })

  suite('API Error Handling', () => {
    test('should handle 401 unauthorized errors correctly', async () => {
      const mockResponse = createMockResponse(
        { message: 'Unauthorized' },
        401,
        { 'x-datadog-trace-id': 'test-trace-401' },
      )
      queueMockResponse(mockResponse)

      try {
        await apiService.fetchAllPortals(validToken)
        assert.fail('Should have thrown ApiError for 401')
      } catch (error) {
        assert.ok(error instanceof ApiError, 'Should throw ApiError instance')
        assert.ok(error.message.includes(API_ERROR_MESSAGES.INVALID_TOKEN), 'Should include invalid token message')
        assert.strictEqual(error.statusCode, 401, 'Should have correct status code')
        assert.strictEqual(error.traceId, 'test-trace-401', 'Should include trace ID')
      }
    })

    test('should handle 403 forbidden errors correctly', async () => {
      const mockResponse = createMockResponse(
        { message: 'Forbidden' },
        403,
        { 'x-datadog-trace-id': 'test-trace-403' },
      )
      queueMockResponse(mockResponse)

      try {
        await apiService.fetchAllPortals(validToken)
        assert.fail('Should have thrown ApiError for 403')
      } catch (error) {
        assert.ok(error instanceof ApiError, 'Should throw ApiError instance')
        assert.ok(error.message.includes(API_ERROR_MESSAGES.ACCESS_DENIED), 'Should include access denied message')
        assert.strictEqual(error.statusCode, 403, 'Should have correct status code')
        assert.strictEqual(error.traceId, 'test-trace-403', 'Should include trace ID')
      }
    })

    test('should handle 404 not found errors correctly', async () => {
      const mockResponse = createMockResponse(
        { message: 'Not Found' },
        404,
        { 'x-datadog-trace-id': 'test-trace-404' },
      )
      queueMockResponse(mockResponse)

      try {
        await apiService.fetchAllPortals(validToken)
        assert.fail('Should have thrown ApiError for 404')
      } catch (error) {
        assert.ok(error instanceof ApiError, 'Should throw ApiError instance')
        assert.ok(error.message.includes(API_ERROR_MESSAGES.API_NOT_FOUND), 'Should include not found message')
        assert.strictEqual(error.statusCode, 404, 'Should have correct status code')
        assert.strictEqual(error.traceId, 'test-trace-404', 'Should include trace ID')
      }
    })

    test('should handle 429 rate limit errors correctly', async () => {
      const mockResponse = createMockResponse(
        { message: 'Too Many Requests' },
        429,
        { 'x-datadog-trace-id': 'test-trace-429' },
      )
      queueMockResponse(mockResponse)

      try {
        await apiService.fetchAllPortals(validToken)
        assert.fail('Should have thrown ApiError for 429')
      } catch (error) {
        assert.ok(error instanceof ApiError, 'Should throw ApiError instance')
        assert.ok(error.message.includes(API_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED), 'Should include rate limit message')
        assert.strictEqual(error.statusCode, 429, 'Should have correct status code')
        assert.strictEqual(error.traceId, 'test-trace-429', 'Should include trace ID')
      }
    })

    test('should handle 500 server errors correctly', async () => {
      const mockResponse = createMockResponse(
        { message: 'Internal Server Error' },
        500,
        { 'x-datadog-trace-id': 'test-trace-500' },
      )
      queueMockResponse(mockResponse)

      try {
        await apiService.fetchAllPortals(validToken)
        assert.fail('Should have thrown ApiError for 500')
      } catch (error) {
        assert.ok(error instanceof ApiError, 'Should throw ApiError instance')
        assert.ok(error.message.includes(API_ERROR_MESSAGES.SERVER_ERROR), 'Should include server error message')
        assert.strictEqual(error.statusCode, 500, 'Should have correct status code')
        assert.strictEqual(error.traceId, 'test-trace-500', 'Should include trace ID')
      }
    })

    test('should handle network timeouts', async () => {
      const abortError = new Error('Request timeout')
      abortError.name = 'AbortError'
      queueMockResponse(abortError)

      try {
        await apiService.fetchAllPortals(validToken)
        assert.fail('Should have thrown timeout error')
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw Error for timeout')
        assert.ok(error.message.includes(API_ERROR_MESSAGES.REQUEST_TIMEOUT), 'Should include timeout message')
      }
    })

    test('should handle malformed JSON responses', async () => {
      const mockResponse = new Response('invalid json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      queueMockResponse(mockResponse)

      try {
        await apiService.fetchAllPortals(validToken)
        assert.fail('Should have thrown JSON parse error')
      } catch (error) {
        assert.ok(error instanceof SyntaxError, 'Should throw SyntaxError for invalid JSON')
      }
    })
  })

  suite('Portal Fetching', () => {
    test('should fetch single page of portals successfully', async () => {
      const mockResponse = createMockResponse({
        data: [samplePortal],
        meta: {
          page: {
            number: 1,
            size: 1,
            total: 1,
          },
        },
      })
      queueMockResponse(mockResponse)

      const portals = await apiService.fetchAllPortals(validToken)

      assert.strictEqual(portals.length, 1, 'Should return one portal')
      assert.strictEqual(portals[0].id, samplePortal.id, 'Should return correct portal')

      // Verify API call was made correctly
      const lastCall = getLastFetchCall()
      assert.ok(lastCall, 'Should have made a fetch call')
      const [url, options] = lastCall
      assert.ok(url.includes('/v3/portals'), 'Should call portals endpoint')
      assert.strictEqual((options?.headers as any)?.['Authorization'], `Bearer ${validToken}`, 'Should include auth header')
    })

    test('should handle pagination and fetch all portals', async () => {
      // First page response with next URL
      const firstPageResponse = createMockResponse({
        data: [samplePortal],
        meta: {
          page: {
            number: 1,
            size: 1,
            total: 2,
            next: 'https://us.api.konghq.com/v3/portals?page=2',
          },
        },
      })

      // Second page response with no next URL
      const secondPortal = { ...samplePortal, id: 'portal-456', name: 'second-portal' }
      const secondPageResponse = createMockResponse({
        data: [secondPortal],
        meta: {
          page: {
            number: 2,
            size: 1,
            total: 2,
            next: null,
          },
        },
      })

      queueMockResponse(firstPageResponse)
      queueMockResponse(secondPageResponse)

      const portals = await apiService.fetchAllPortals(validToken)

      assert.strictEqual(portals.length, 2, 'Should return both portals')
      assert.strictEqual(portals[0].id, samplePortal.id, 'Should return first portal')
      assert.strictEqual(portals[1].id, secondPortal.id, 'Should return second portal')
      assert.strictEqual(mockFetchCalls.length, 2, 'Should make two API calls for pagination')
    })

    test('should handle empty portal list', async () => {
      const mockResponse = createMockResponse({
        data: [],
        meta: {
          page: {
            number: 1,
            size: 0,
            total: 0,
          },
        },
      })
      queueMockResponse(mockResponse)

      const portals = await apiService.fetchAllPortals(validToken)

      assert.strictEqual(portals.length, 0, 'Should return empty array')
    })

    test('should include custom timeout in requests', async () => {
      const customTimeoutService = new KonnectApiService(2000)
      const mockResponse = createMockResponse({
        data: [samplePortal],
        meta: {
          page: {
            number: 1,
            size: 1,
            total: 1,
          },
        },
      })
      queueMockResponse(mockResponse)

      await customTimeoutService.fetchAllPortals(validToken)

      const lastCall = getLastFetchCall()
      assert.ok(lastCall, 'Should have made a fetch call')
      const [, options] = lastCall
      assert.ok(options?.signal instanceof AbortSignal, 'Should include abort signal for timeout')
    })
  })

  suite('ApiError Class', () => {
    test('should create ApiError with all properties', async () => {
      const error = new ApiError('Test error message', 'trace-123', 400)

      assert.strictEqual(error.message, 'Test error message', 'Should have correct message')
      assert.strictEqual(error.statusCode, 400, 'Should have correct status code')
      assert.strictEqual(error.traceId, 'trace-123', 'Should have correct trace ID')
      assert.ok(error instanceof Error, 'Should be instance of Error')
      assert.strictEqual(error.name, 'ApiError', 'Should have correct name')
    })

    test('should create ApiError without trace ID', async () => {
      const error = new ApiError('Test error message', undefined, 500)

      assert.strictEqual(error.message, 'Test error message', 'Should have correct message')
      assert.strictEqual(error.statusCode, 500, 'Should have correct status code')
      assert.strictEqual(error.traceId, undefined, 'Should have no trace ID')
    })
  })

  suite('Service Configuration', () => {
    test('should handle custom timeout configuration', async () => {
      // Test timeout behavior by creating a service with very short timeout
      const timeoutService = new KonnectApiService(1) // 1ms timeout

      // Instead of mocking a slow response, we'll mock an immediate abort error
      // which is what actually happens when the AbortController times out
      const abortError = new Error('The operation was aborted.')
      abortError.name = 'AbortError'
      queueMockResponse(abortError)

      try {
        await timeoutService.fetchAllPortals(validToken)
        assert.fail('Should have timed out')
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw Error for timeout')
        // Should get the REQUEST_TIMEOUT message from the service's error handling
        assert.ok(
          error.message.includes(API_ERROR_MESSAGES.REQUEST_TIMEOUT),
          `Expected timeout message, got: ${error.message}`,
        )
      }
    })

    test('should handle requests within timeout window', async () => {
      const timeoutService = new KonnectApiService(1000) // 1 second timeout

      const mockResponse = createMockResponse({
        data: [samplePortal],
        meta: { page: { number: 1, size: 1, total: 1 } },
      })
      queueMockResponse(mockResponse)

      const portals = await timeoutService.fetchAllPortals(validToken)
      assert.strictEqual(portals.length, 1, 'Should successfully fetch portals within timeout')
    })
  })
})
