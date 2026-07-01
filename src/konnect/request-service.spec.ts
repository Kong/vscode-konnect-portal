import { describe, it, expect, beforeEach, vi } from 'vitest'
import { KonnectRequestService } from './request-service'
import { KonnectApiService, ApiError } from './api'
import { executeKongctl } from '../kongctl'
import { checkKongctlAvailable } from '../kongctl/status'
import { debug } from '../utils/debug'
import type { PortalStorageService } from '../storage'
import type { KonnectPortal } from '../types/konnect'
import type * as ApiModule from './api'

// Mock VS Code module (must be first)
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  ExtensionContext: vi.fn(),
}))

// Mock dependencies. Keep the real ApiError class (rather than a full automock)
// so `instanceof ApiError` / `.statusCode` checks in the implementation behave
// correctly against errors constructed in these tests.
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('./api')
  return {
    ...actual,
    KonnectApiService: vi.fn(),
  }
})
vi.mock('../kongctl')
vi.mock('../kongctl/status')
vi.mock('../utils/debug', () => ({
  debug: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('KonnectRequestService', () => {
  let service: KonnectRequestService
  let mockStorageService: PortalStorageService

  const mockPortals: KonnectPortal[] = [
    {
      id: 'portal1',
      name: 'Test Portal 1',
      display_name: 'Test Portal 1 Display',
      description: 'A test portal',
      canonical_domain: 'portal1.example.com',
      default_domain: 'portal1.example.com',
      authentication_enabled: false,
      rbac_enabled: false,
      auto_approve_developers: false,
      auto_approve_applications: false,
      default_api_visibility: 'public',
      default_page_visibility: 'public',
      default_application_auth_strategy_id: null,
      labels: {},
      updated_at: '2023-01-01T00:00:00Z',
      created_at: '2023-01-01T00:00:00Z',
    },
    {
      id: 'portal2',
      name: 'Test Portal 2',
      display_name: 'Test Portal 2 Display',
      description: 'Another test portal',
      canonical_domain: 'portal2.example.com',
      default_domain: 'portal2.example.com',
      authentication_enabled: true,
      rbac_enabled: true,
      auto_approve_developers: true,
      auto_approve_applications: true,
      default_api_visibility: 'private',
      default_page_visibility: 'private',
      default_application_auth_strategy_id: 'strategy1',
      labels: { environment: 'test' },
      updated_at: '2023-01-02T00:00:00Z',
      created_at: '2023-01-02T00:00:00Z',
    },
  ]

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup mock storage service
    mockStorageService = {
      getToken: vi.fn().mockResolvedValue('mock-token'),
      hasValidToken: vi.fn().mockResolvedValue(true),
      storeToken: vi.fn(),
      clearToken: vi.fn(),
      storeSelectedPortal: vi.fn(),
      getSelectedPortal: vi.fn(),
      clearSelectedPortal: vi.fn(),
    } as any

    // Setup mock functions
    vi.mocked(checkKongctlAvailable).mockResolvedValue(true)
    vi.mocked(executeKongctl).mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: JSON.stringify({
        data: mockPortals,
        meta: {
          page: {
            number: 1,
            size: 100,
            total: 2,
          },
        },
      }),
      stderr: '',
    })

    // Setup API service mock
    const mockApiService = vi.mocked(KonnectApiService)
    mockApiService.prototype.fetchAllPortals = vi.fn().mockResolvedValue(mockPortals)

    service = new KonnectRequestService(mockStorageService)
  })

  describe('fetchAllPortals', () => {
    it('should throw error when no token is available', async () => {
      vi.mocked(mockStorageService.getToken).mockResolvedValue(undefined)

      await expect(service.fetchAllPortals('us')).rejects.toThrow('No authentication token available')
    })

    it('should use kongctl when available and return portals', async () => {
      const result = await service.fetchAllPortals('us')

      expect(result).toEqual(mockPortals)
      expect(checkKongctlAvailable).toHaveBeenCalled()

      // Verify background execution for getting results
      expect(executeKongctl).toHaveBeenCalledWith(
        [
          'api',
          'get',
          '"https://us.api.konghq.com/v3/portals?page%5Bsize%5D=100&page%5Bnumber%5D=1"',
          '--output',
          'json',
        ],
        { showInTerminal: false },
        mockStorageService,
      )
    })

    it('should build the kongctl request URL from the passed region', async () => {
      // Regression test for the stale-region bug: the region must come from the
      // explicit argument, not a cached or globally-read setting.
      await service.fetchAllPortals('eu')

      expect(executeKongctl).toHaveBeenCalledWith(
        [
          'api',
          'get',
          '"https://eu.api.konghq.com/v3/portals?page%5Bsize%5D=100&page%5Bnumber%5D=1"',
          '--output',
          'json',
        ],
        { showInTerminal: false },
        mockStorageService,
      )
    })

    it('should fall back to API when kongctl is not available', async () => {
      vi.mocked(checkKongctlAvailable).mockResolvedValue(false)

      const result = await service.fetchAllPortals('us')

      expect(result).toEqual(mockPortals)
      expect(checkKongctlAvailable).toHaveBeenCalled()
      expect(executeKongctl).not.toHaveBeenCalled()
      expect(KonnectApiService.prototype.fetchAllPortals).toHaveBeenCalledWith('mock-token', 'us')
    })

    it('should fall back to API when kongctl command fails for a non-auth reason', async () => {
      vi.mocked(executeKongctl).mockResolvedValue({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Command failed',
      })

      const result = await service.fetchAllPortals('us')

      expect(result).toEqual(mockPortals)
      // The failure is logged, not surfaced as a user-facing dialog here -- this
      // method is also used to fetch several regions concurrently, and firing a
      // dialog per failed region would be poor UX. The caller shows one dialog
      // for the eventual outcome.
      expect(debug.warn).toHaveBeenCalled()
      expect(KonnectApiService.prototype.fetchAllPortals).toHaveBeenCalledWith('mock-token', 'us')
    })

    it('should throw a 401 ApiError and NOT fall back to the API when kongctl reports an auth failure', async () => {
      // A 401 means the PAT is missing/invalid -- the API call would fail
      // identically, so retrying against it would be pointless.
      vi.mocked(executeKongctl).mockResolvedValue({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Error: 401 Unauthorized',
      })

      await expect(service.fetchAllPortals('us')).rejects.toMatchObject({
        statusCode: 401,
      })

      expect(KonnectApiService.prototype.fetchAllPortals).not.toHaveBeenCalled()
    })

    it('should handle pagination with multiple pages', async () => {
      const firstPageResponse = {
        success: true,
        exitCode: 0,
        stdout: JSON.stringify({
          data: [mockPortals[0]],
          meta: {
            page: {
              number: 1,
              size: 1,
              total: 2,
            },
          },
        }),
        stderr: '',
      }

      const secondPageResponse = {
        success: true,
        exitCode: 0,
        stdout: JSON.stringify({
          data: [mockPortals[1]],
          meta: {
            page: {
              number: 2,
              size: 1,
              total: 2,
            },
          },
        }),
        stderr: '',
      }

      vi.mocked(executeKongctl)
        .mockResolvedValueOnce(firstPageResponse)
        .mockResolvedValueOnce(secondPageResponse)

      const result = await service.fetchAllPortals('us')

      expect(result).toEqual(mockPortals)
      expect(executeKongctl).toHaveBeenCalledTimes(2)
      expect(executeKongctl).toHaveBeenNthCalledWith(1,
        [
          'api',
          'get',
          '"https://us.api.konghq.com/v3/portals?page%5Bsize%5D=100&page%5Bnumber%5D=1"',
          '--output',
          'json',
        ],
        { showInTerminal: false },
        mockStorageService,
      )
      expect(executeKongctl).toHaveBeenNthCalledWith(2,
        [
          'api',
          'get',
          '"https://us.api.konghq.com/v3/portals?page%5Bsize%5D=100&page%5Bnumber%5D=2"',
          '--output',
          'json',
        ],
        { showInTerminal: false },
        mockStorageService,
      )
    })

    it('should handle JSON parsing errors in kongctl response', async () => {
      vi.mocked(executeKongctl).mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: 'invalid json',
        stderr: '',
      })

      const result = await service.fetchAllPortals('us')

      expect(result).toEqual(mockPortals)
      expect(debug.warn).toHaveBeenCalled()
      expect(KonnectApiService.prototype.fetchAllPortals).toHaveBeenCalledWith('mock-token', 'us')
    })

    it('should use cached kongctl availability on subsequent calls', async () => {
      await service.fetchAllPortals('us')
      await service.fetchAllPortals('us')

      // checkKongctlAvailable should only be called once due to caching
      expect(checkKongctlAvailable).toHaveBeenCalledTimes(1)
    })

    it('should not spawn a redundant availability check when regions race on the first concurrent fetch', async () => {
      // Regression test for a cache stampede: fetchAllPortalsAcrossRegions
      // kicks off one fetchPortalsForRegion call per region concurrently,
      // and each one calls isKongctlAvailable(). If the cache is only
      // populated after the check resolves, every region observes it as
      // unset and independently spawns its own redundant check.
      let resolveCheck: (value: boolean) => void = () => {}
      vi.mocked(checkKongctlAvailable).mockImplementation(
        () => new Promise((resolve) => {
          resolveCheck = resolve
        }),
      )

      const pending = service.fetchAllPortalsAcrossRegions(['us', 'eu', 'au'])

      // Let all three region fetches race up to the availability check
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(checkKongctlAvailable).toHaveBeenCalledTimes(1)

      resolveCheck(true)
      await pending

      expect(checkKongctlAvailable).toHaveBeenCalledTimes(1)
    })
  })

  describe('fetchAllPortalsAcrossRegions', () => {
    beforeEach(() => {
      // Exercise the API-fallback path directly for these tests: kongctl
      // unavailable keeps the region-tagging and aggregation logic isolated
      // from the kongctl pagination loop, which is already covered above.
      vi.mocked(checkKongctlAvailable).mockResolvedValue(false)
    })

    it('should throw when no token is available', async () => {
      vi.mocked(mockStorageService.getToken).mockResolvedValue(undefined)

      await expect(service.fetchAllPortalsAcrossRegions(['us', 'eu'])).rejects.toThrow(
        'No authentication token available',
      )
    })

    it('should fetch all regions in parallel and tag each portal with its region', async () => {
      const usPortal = mockPortals[0]
      const euPortal = mockPortals[1]
      const fetchAllPortalsMock = vi.mocked(KonnectApiService.prototype.fetchAllPortals)
      fetchAllPortalsMock.mockImplementation(async (_token: string, region: string) =>
        region === 'us' ? [usPortal] : [euPortal],
      )

      const result = await service.fetchAllPortalsAcrossRegions(['us', 'eu'])

      expect(result.errors).toEqual([])
      expect(result.portals).toEqual(
        expect.arrayContaining([
          { ...usPortal, region: 'us' },
          { ...euPortal, region: 'eu' },
        ]),
      )
      expect(result.portals).toHaveLength(2)

      // Verify regions were queried concurrently, not sequentially
      expect(fetchAllPortalsMock).toHaveBeenCalledWith('mock-token', 'us')
      expect(fetchAllPortalsMock).toHaveBeenCalledWith('mock-token', 'eu')
    })

    it('should collect a per-region failure while still returning portals from regions that succeeded', async () => {
      const usPortal = mockPortals[0]
      const optInNotEnabledError = new ApiError('Access denied', undefined, 403)
      const fetchAllPortalsMock = vi.mocked(KonnectApiService.prototype.fetchAllPortals)
      fetchAllPortalsMock.mockImplementation(async (_token: string, region: string) => {
        if (region === 'sg') {
          throw optInNotEnabledError
        }
        return [usPortal]
      })

      const result = await service.fetchAllPortalsAcrossRegions(['us', 'sg'])

      expect(result.portals).toEqual([{ ...usPortal, region: 'us' }])
      expect(result.errors).toEqual([{ region: 'sg', error: optInNotEnabledError }])
    })

    it('should treat a single region 401 as a per-region failure, not proof the shared token is invalid', async () => {
      // The global available-regions list includes regions the account may not
      // be provisioned in at all, and Konnect can return 401 (not just 403) for
      // those -- that must not be conflated with the shared PAT being invalid,
      // or a real, valid token gets wiped based on one unrelated region.
      const euPortal = mockPortals[1]
      const notProvisionedError = new ApiError('Invalid or expired Personal Access Token', undefined, 401)
      const fetchAllPortalsMock = vi.mocked(KonnectApiService.prototype.fetchAllPortals)
      fetchAllPortalsMock.mockImplementation(async (_token: string, region: string) => {
        if (region === 'us') {
          throw notProvisionedError
        }
        return [euPortal]
      })

      const result = await service.fetchAllPortalsAcrossRegions(['us', 'eu'])

      expect(result.portals).toEqual([{ ...euPortal, region: 'eu' }])
      expect(result.errors).toEqual([{ region: 'us', error: notProvisionedError }])
    })

    it('should rethrow a 401 when every queried region reports one, since that does indicate the shared token is invalid', async () => {
      const authError = new ApiError('Invalid or expired Personal Access Token', undefined, 401)
      const fetchAllPortalsMock = vi.mocked(KonnectApiService.prototype.fetchAllPortals)
      fetchAllPortalsMock.mockRejectedValue(authError)

      await expect(service.fetchAllPortalsAcrossRegions(['us', 'eu'])).rejects.toBe(authError)
    })
  })

  describe('resetKongctlAvailability', () => {
    it('should reset the kongctl availability cache', async () => {
      await service.fetchAllPortals('us')
      service.resetKongctlAvailability()
      await service.fetchAllPortals('us')

      // Should check availability again after reset
      expect(checkKongctlAvailable).toHaveBeenCalledTimes(2)
    })
  })
})
