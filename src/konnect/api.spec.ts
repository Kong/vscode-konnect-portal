import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError, KonnectApiService } from './api'
// Mock VS Code workspace.getConfiguration for region
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key, def) => {
        if (key === 'kong.konnect.region') return 'us'
        return def
      }),
    })),
  },
}))
import { API_ERROR_MESSAGES } from '../constants/messages'
import {
  mockPortals,
  mockSinglePageResponse,
  mockPaginatedPage1Response,
  mockPaginatedPage2Response,
  mockEmptyResponse,
  testTokens,
  mockErrorHeaders,
  mockErrorResponses,
} from '../test/fixtures/konnect-api'

// Mock fetch globally for this test file
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock AbortController
const mockAbort = vi.fn()

// Mock AbortController as a constructor function
class MockAbortController {
  abort = mockAbort
  signal = {} as AbortSignal
}

vi.stubGlobal('AbortController', MockAbortController)

// Mock setTimeout and clearTimeout
vi.stubGlobal('setTimeout', vi.fn(() => {
  return 123 // Mock timer ID
}))
vi.stubGlobal('clearTimeout', vi.fn())

describe('konnect/api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('ApiError', () => {
    it('should create error with message only', () => {
      const error = new ApiError('Test error')

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('ApiError')
      expect(error.traceId).toBeUndefined()
      expect(error.statusCode).toBeUndefined()
      expect(error).toBeInstanceOf(Error)
    })

    it('should create error with trace ID', () => {
      const error = new ApiError('Test error', 'trace-123')

      expect(error.message).toBe('Test error')
      expect(error.traceId).toBe('trace-123')
      expect(error.statusCode).toBeUndefined()
    })

    it('should create error with trace ID and status code', () => {
      const error = new ApiError('Test error', 'trace-456', 404)

      expect(error.message).toBe('Test error')
      expect(error.traceId).toBe('trace-456')
      expect(error.statusCode).toBe(404)
    })

    describe('toErrorInfo', () => {
      it('should convert to error info with all properties', () => {
        const error = new ApiError('Server error', 'trace-789', 500)
        const errorInfo = error.toErrorInfo()

        expect(errorInfo).toEqual({
          message: 'Server error',
          traceId: 'trace-789',
          statusCode: 500,
        })
      })

      it('should convert to error info with minimal properties', () => {
        const error = new ApiError('Simple error')
        const errorInfo = error.toErrorInfo()

        expect(errorInfo).toEqual({
          message: 'Simple error',
          traceId: undefined,
          statusCode: undefined,
        })
      })
    })
  })

  describe('KonnectApiService', () => {
    let apiService: KonnectApiService

    beforeEach(() => {
      apiService = new KonnectApiService()
    })

    describe('constructor', () => {
      it('should create service with default timeout', () => {
        const service = new KonnectApiService()
        expect(service).toBeInstanceOf(KonnectApiService)
      })

      it('should create service with custom timeout', () => {
        const service = new KonnectApiService(5000)
        expect(service).toBeInstanceOf(KonnectApiService)
      })
    })

    describe('validateTokenFormat', () => {
      it('should validate correct token format', () => {
        expect(KonnectApiService.validateTokenFormat(testTokens.validLong)).toBe(true)
      })

      it('should reject token without kpat_ prefix', () => {
        expect(KonnectApiService.validateTokenFormat(testTokens.invalidPrefix)).toBe(false)
      })

      it('should reject short token', () => {
        expect(KonnectApiService.validateTokenFormat(testTokens.short)).toBe(false)
      })

      it('should handle token with whitespace', () => {
        expect(KonnectApiService.validateTokenFormat(testTokens.withWhitespace)).toBe(true)
      })

      it('should reject empty token', () => {
        expect(KonnectApiService.validateTokenFormat(testTokens.empty)).toBe(false)
        expect(KonnectApiService.validateTokenFormat(testTokens.whitespaceOnly)).toBe(false)
      })

      it('should validate token format before making requests', async () => {
        // Test various token formats
        const tokenTests = [
          { token: testTokens.valid, shouldPass: true },
          { token: testTokens.validLong, shouldPass: true },
          { token: testTokens.invalidPrefix, shouldPass: false },
          { token: testTokens.short, shouldPass: false },
          { token: testTokens.empty, shouldPass: false },
        ]

        tokenTests.forEach(({ token, shouldPass }) => {
          const isValid = KonnectApiService.validateTokenFormat(token)
          expect(isValid).toBe(shouldPass)
        })

        // Verify that service would work with valid tokens
        if (KonnectApiService.validateTokenFormat(testTokens.valid)) {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValueOnce(mockEmptyResponse),
          })

          const result = await apiService.fetchAllPortals(testTokens.valid)
          expect(result).toBeDefined()
        }
      })
    })

    describe('fetchAllPortals', () => {
      it('should fetch all portals with single page and verify data integrity', async () => {
        const mockResponse = mockSinglePageResponse
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValueOnce(mockResponse),
        })

        const result = await apiService.fetchAllPortals(testTokens.valid)

        // Verify request behavior
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(mockFetch).toHaveBeenCalledWith(
          'https://us.api.konghq.com/v3/portals?page%5Bsize%5D=100&page%5Bnumber%5D=1',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'Authorization': `Bearer ${testTokens.valid}`,
              'Accept': 'application/json',
            }),
          }),
        )

        // Verify data integrity and structure
        expect(result).toEqual(mockPortals)
        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(mockPortals.length)

        // Verify each portal has required properties
        result.forEach(portal => {
          expect(portal).toHaveProperty('id')
          expect(portal).toHaveProperty('name')
          expect(portal).toHaveProperty('canonical_domain')
          expect(typeof portal.id).toBe('string')
          expect(portal.id.length).toBeGreaterThan(0)
        })
      })

      it('should fetch all portals with pagination and verify data aggregation', async () => {
        const page1Response = mockPaginatedPage1Response
        const page2Response = mockPaginatedPage2Response

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValueOnce(page1Response),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValueOnce(page2Response),
          })

        const result = await apiService.fetchAllPortals(testTokens.valid)

        // Verify pagination handling - combined results from both pages
        expect(result).toEqual(mockPortals)
        expect(result).toHaveLength(page1Response.data.length + page2Response.data.length)

        // Verify pagination requests were made (implementation detail but necessary for pagination)
        expect(mockFetch).toHaveBeenCalledTimes(2)

        // Verify data aggregation integrity
        const page1Data = page1Response.data
        const page2Data = page2Response.data
        page1Data.forEach(portal => {
          expect(result).toContainEqual(portal)
        })
        page2Data.forEach(portal => {
          expect(result).toContainEqual(portal)
        })

        // Verify no duplicate portals in aggregated result
        const ids = result.map(p => p.id)
        const uniqueIds = new Set(ids)
        expect(uniqueIds.size).toBe(ids.length)
      })

      it('should handle 401 authentication error with complete error context', async () => {
        const traceId = 'trace-auth-failure-123'
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: {
            get: vi.fn((key: string) =>
              key === 'x-datadog-trace-id' ? traceId : mockErrorHeaders.withTraceId.get(key),
            ),
          },
          json: vi.fn().mockResolvedValueOnce(mockErrorResponses.empty),
        })

        try {
          await apiService.fetchAllPortals(testTokens.valid)
          expect.fail('Expected ApiError to be thrown')
        } catch (error) {
          // Verify error type and message
          expect(error).toBeInstanceOf(ApiError)
          expect((error as ApiError).message).toContain(API_ERROR_MESSAGES.INVALID_TOKEN)

          // Verify error metadata preservation
          const apiError = error as ApiError
          expect(apiError.statusCode).toBe(401)
          expect(apiError.traceId).toBe(traceId)

          // Verify error info conversion
          const errorInfo = apiError.toErrorInfo()
          expect(errorInfo.statusCode).toBe(401)
          expect(errorInfo.traceId).toBe(traceId)
          expect(errorInfo.message).toContain(API_ERROR_MESSAGES.INVALID_TOKEN)
        }
      })

      it('should handle 403 forbidden error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          headers: {
            get: vi.fn(),
          },
          json: vi.fn().mockResolvedValueOnce(mockErrorResponses.empty),
        })

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(API_ERROR_MESSAGES.ACCESS_DENIED)
      })

      it('should handle 404 not found error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: {
            get: vi.fn(),
          },
          json: vi.fn().mockResolvedValueOnce(mockErrorResponses.empty),
        })

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(API_ERROR_MESSAGES.API_NOT_FOUND)
      })

      it('should handle 429 rate limit error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            get: vi.fn(),
          },
          json: vi.fn().mockResolvedValueOnce(mockErrorResponses.empty),
        })

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(API_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED)
      })

      it('should handle 500 server error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: {
            get: vi.fn(),
          },
          json: vi.fn().mockResolvedValueOnce(mockErrorResponses.empty),
        })

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(API_ERROR_MESSAGES.SERVER_ERROR)
      })

      it('should handle generic error with custom message', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          headers: {
            get: vi.fn(),
          },
          json: vi.fn().mockResolvedValueOnce(mockErrorResponses.customMessage),
        })

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(API_ERROR_MESSAGES.CUSTOM_MESSAGE)
      })

      it('should handle error with invalid JSON response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          headers: {
            get: vi.fn(),
          },
          json: vi.fn().mockRejectedValueOnce(new Error('Invalid JSON')),
        })

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(API_ERROR_MESSAGES.BAD_REQUEST)
      })

      it('should handle network timeout', async () => {
        // Simulate timeout by making fetch throw AbortError
        const abortError = new Error('Request timeout')
        abortError.name = 'AbortError'
        mockFetch.mockRejectedValueOnce(abortError)

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(API_ERROR_MESSAGES.REQUEST_TIMEOUT)
      })

      it('should handle unknown network error', async () => {
        mockFetch.mockRejectedValueOnce('Unknown error')

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(API_ERROR_MESSAGES.UNKNOWN_ERROR)
      })

      it('should handle known Error instance', async () => {
        const knownError = new Error('Network error')
        mockFetch.mockRejectedValueOnce(knownError)

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(API_ERROR_MESSAGES.NETWORK_ERROR)
      })

      it('should set up timeout and clear it on success', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValueOnce(mockEmptyResponse),
        })

        await apiService.fetchAllPortals(testTokens.valid)

        expect(vi.mocked(setTimeout)).toHaveBeenCalledWith(expect.any(Function), 10000)
        expect(vi.mocked(clearTimeout)).toHaveBeenCalledWith(123)
      })

      it('should clear timeout on error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: { get: vi.fn() },
          json: vi.fn().mockResolvedValueOnce(mockErrorResponses.empty),
        })

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow(ApiError)
        expect(vi.mocked(clearTimeout)).toHaveBeenCalledWith(123)
      })
    })

  })
})
