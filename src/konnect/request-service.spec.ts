import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as vscode from 'vscode'
import { KonnectRequestService } from './request-service'
import { KonnectApiService } from './api'
import { executeKongctl } from '../kongctl'
import { checkKongctlAvailable } from '../kongctl/status'
import { showApiError } from '../utils/error-handling'
import type { PortalStorageService } from '../storage'
import type { KonnectPortal } from '../types/konnect'

// Mock VS Code module
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  ExtensionContext: vi.fn(),
}))

// Mock dependencies
vi.mock('./api')
vi.mock('../kongctl')
vi.mock('../kongctl/status')
vi.mock('../utils/error-handling')

describe('KonnectRequestService', () => {
  let service: KonnectRequestService
  let mockStorageService: PortalStorageService
  let mockContext: vscode.ExtensionContext

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

    // Setup mock context
    mockContext = {} as vscode.ExtensionContext



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

    service = new KonnectRequestService(mockStorageService, mockContext)
  })

  describe('fetchAllPortals', () => {
    it('should throw error when no token is available', async () => {
      vi.mocked(mockStorageService.getToken).mockResolvedValue(undefined)

      await expect(service.fetchAllPortals()).rejects.toThrow('No authentication token available')
    })

    it('should use kongctl when available and return portals', async () => {
      const result = await service.fetchAllPortals()

      expect(result).toEqual(mockPortals)
      expect(checkKongctlAvailable).toHaveBeenCalled()

      // Verify background execution for getting results
      expect(executeKongctl).toHaveBeenCalledWith(
        ['api', 'get', '/v3/portals?page%5Bsize%5D=100&page%5Bnumber%5D=1', '--output', 'json'],
        {},
        mockStorageService,
      )

      // Note: executeKongctl now handles both terminal visibility and output capture
    })

    it('should fall back to API when kongctl is not available', async () => {
      vi.mocked(checkKongctlAvailable).mockResolvedValue(false)

      const result = await service.fetchAllPortals()

      expect(result).toEqual(mockPortals)
      expect(checkKongctlAvailable).toHaveBeenCalled()
      expect(executeKongctl).not.toHaveBeenCalled()
      expect(KonnectApiService.prototype.fetchAllPortals).toHaveBeenCalledWith('mock-token')
    })

    it('should fall back to API when kongctl command fails', async () => {
      vi.mocked(executeKongctl).mockResolvedValue({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Command failed',
      })

      const result = await service.fetchAllPortals()

      expect(result).toEqual(mockPortals)
      expect(showApiError).toHaveBeenCalled()
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Falling back to Konnect API...')
      expect(KonnectApiService.prototype.fetchAllPortals).toHaveBeenCalledWith('mock-token')
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

      const result = await service.fetchAllPortals()

      expect(result).toEqual(mockPortals)
      expect(executeKongctl).toHaveBeenCalledTimes(2)
      expect(executeKongctl).toHaveBeenNthCalledWith(1,
        ['api', 'get', '/v3/portals?page%5Bsize%5D=100&page%5Bnumber%5D=1', '--output', 'json'],
        {},
        mockStorageService,
      )
      expect(executeKongctl).toHaveBeenNthCalledWith(2,
        ['api', 'get', '/v3/portals?page%5Bsize%5D=100&page%5Bnumber%5D=2', '--output', 'json'],
        {},
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

      const result = await service.fetchAllPortals()

      expect(result).toEqual(mockPortals)
      expect(showApiError).toHaveBeenCalled()
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Falling back to Konnect API...')
      expect(KonnectApiService.prototype.fetchAllPortals).toHaveBeenCalledWith('mock-token')
    })

    it('should use cached kongctl availability on subsequent calls', async () => {
      await service.fetchAllPortals()
      await service.fetchAllPortals()

      // checkKongctlAvailable should only be called once due to caching
      expect(checkKongctlAvailable).toHaveBeenCalledTimes(1)
    })
  })

  describe('resetKongctlAvailability', () => {
    it('should reset the kongctl availability cache', async () => {
      await service.fetchAllPortals()
      service.resetKongctlAvailability()
      await service.fetchAllPortals()

      // Should check availability again after reset
      expect(checkKongctlAvailable).toHaveBeenCalledTimes(2)
    })
  })
})
