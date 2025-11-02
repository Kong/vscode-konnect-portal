import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError, KonnectApiService } from './api'
import {
  mockPortals,
  mockSinglePageResponse,
  mockPaginatedPage1Response,
  mockPaginatedPage2Response,
  mockEmptyResponse,
  testTokens,
  mockErrorHeaders,
  mockErrorResponses,
} from '../../tests/fixtures/konnect-api'

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
    })

    describe('fetchAllPortals', () => {
      it('should fetch all portals with single page', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValueOnce(mockSinglePageResponse),
        })

        const result = await apiService.fetchAllPortals(testTokens.valid)

        expect(result).toEqual(mockPortals)
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(mockFetch).toHaveBeenCalledWith(
          'https://us.api.konghq.com/v3/portals',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'Authorization': `Bearer ${testTokens.valid}`,
              'Accept': 'application/json',
            }),
          }),
        )
      })

      it('should fetch all portals with pagination', async () => {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValueOnce(mockPaginatedPage1Response),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValueOnce(mockPaginatedPage2Response),
          })

        const result = await apiService.fetchAllPortals(testTokens.valid)

        expect(result).toEqual(mockPortals)
        expect(mockFetch).toHaveBeenCalledTimes(2)
      })

      it('should handle 401 authentication error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: {
            get: vi.fn((key: string) => mockErrorHeaders.withTraceId.get(key)),
          },
          json: vi.fn().mockResolvedValueOnce(mockErrorResponses.empty),
        })

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('Invalid or expired Personal Access Token')
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

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('Access denied')
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

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('API endpoint not found')
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

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('Rate limit exceeded')
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

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('Server error occurred')
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

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('Custom error message')
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

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('Bad Request')
      })

      it('should handle network timeout', async () => {
        // Simulate timeout by making fetch throw AbortError
        const abortError = new Error('Request timeout')
        abortError.name = 'AbortError'
        mockFetch.mockRejectedValueOnce(abortError)

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('Request timeout - please check your connection')
      })

      it('should handle unknown network error', async () => {
        mockFetch.mockRejectedValueOnce('Unknown error')

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('Unknown error occurred while fetching portals')
      })

      it('should handle known Error instance', async () => {
        const knownError = new Error('Network error')
        mockFetch.mockRejectedValueOnce(knownError)

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow('Network error')
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

        await expect(apiService.fetchAllPortals(testTokens.valid)).rejects.toThrow()
        expect(vi.mocked(clearTimeout)).toHaveBeenCalledWith(123)
      })
    })
  })
})
