import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ExtensionContext } from 'vscode'
import { PortalSelectionService } from './portal-selection'
import type { PortalStorageService } from './storage'
import { ApiError } from './konnect/api'
import { PORTAL_SELECTION_MESSAGES } from './constants/messages'
import {
  mockPortals,
  testTokens,
} from './test/fixtures/konnect-api'
import {
  createMockContext,
  createMockProgress,
  createMockCancellationToken,
  mockQuickPickItems,
  mockStoredPortalConfig,
} from './test/fixtures/konnect-storage'

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showQuickPick: vi.fn(),
    withProgress: vi.fn(),
  },
  ProgressLocation: {
    Notification: 15,
  },
}))

// Mock ufo module
vi.mock('ufo', () => ({
  withHttps: vi.fn((domain: string) => `https://${domain}`),
}))

// Portals tagged with a region, as returned by the multi-region fetch
const mockPortalsWithRegion = mockPortals.map(portal => ({ ...portal, region: 'us' }))

// Create global mock functions that we can access in tests. Declared via
// vi.hoisted() so they're safely initialized before the vi.mock factories
// below (which are hoisted above all other module code) run.
const { mockFetchAllPortals, mockFetchAllPortalsAcrossRegions, mockFetchAvailableRegions } = vi.hoisted(() => ({
  mockFetchAllPortals: vi.fn(),
  mockFetchAllPortalsAcrossRegions: vi.fn(),
  mockFetchAvailableRegions: vi.fn(),
}))

// Mock request service
vi.mock('./konnect/request-service', () => ({
  KonnectRequestService: class MockKonnectRequestService {
    fetchAllPortals = mockFetchAllPortals
    fetchAllPortalsAcrossRegions = mockFetchAllPortalsAcrossRegions
  },
}))

// Mock region discovery
vi.mock('./konnect/regions', () => ({
  fetchAvailableRegions: mockFetchAvailableRegions,
}))

// Mock MDC extension utilities
vi.mock('./utils/mdc-extension', () => ({
  checkAndPromptMDCExtensionForPortal: vi.fn().mockResolvedValue(undefined),
}))

// Mock API error class
vi.mock('./konnect/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string, public traceId?: string, public statusCode?: number) {
      super(message)
      this.name = 'ApiError'
    }
  },
}))

// Mock error handling utility
vi.mock('./utils/error-handling', () => ({
  showApiError: vi.fn(),
}))

// Mock debug logging so it doesn't need a real vscode workspace/config
vi.mock('./utils/debug', () => ({
  debug: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('konnect/portal-selection', () => {
  let portalSelectionService: PortalSelectionService
  let mockStorageService: PortalStorageService
  let mockContext: ReturnType<typeof createMockContext>


  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset the global mock functions
    mockFetchAllPortals.mockReset()
    mockFetchAllPortalsAcrossRegions.mockReset()
    mockFetchAvailableRegions.mockReset()
    mockFetchAvailableRegions.mockResolvedValue(['us'])

    // Setup mock context
    mockContext = createMockContext()

    // Setup mock storage service
    mockStorageService = {
      getToken: vi.fn(),
      storeSelectedPortal: vi.fn(),
      clearToken: vi.fn(),
      getSelectedPortal: vi.fn(),
      clearSelectedPortal: vi.fn(),
      hasValidToken: vi.fn(),
    } as unknown as PortalStorageService

    // Create service instance
    portalSelectionService = new PortalSelectionService(
      mockStorageService,
      mockContext as unknown as ExtensionContext,
    )

    // mockFetchAllPortals is available globally
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('PortalSelectionService', () => {
    describe('constructor', () => {
      it('should create service with storage service and context', () => {
        expect(portalSelectionService).toBeInstanceOf(PortalSelectionService)
      })
    })

    describe('selectPortal', () => {
      let mockShowWarningMessage: any
      let mockShowErrorMessage: any
      let mockShowInformationMessage: any
      let mockShowQuickPick: any
      let mockWithProgress: any

      beforeEach(async () => {
        const vscode = await import('vscode')
        mockShowWarningMessage = vi.mocked(vscode.window.showWarningMessage)
        mockShowErrorMessage = vi.mocked(vscode.window.showErrorMessage)
        mockShowInformationMessage = vi.mocked(vscode.window.showInformationMessage)
        mockShowQuickPick = vi.mocked(vscode.window.showQuickPick)
        mockWithProgress = vi.mocked(vscode.window.withProgress)

        // Setup default progress mock
        mockWithProgress.mockImplementation(async (options: any, callback: any) => {
          const progress = createMockProgress()
          const cancellationToken = createMockCancellationToken()
          return await callback(progress, cancellationToken)
        })
      })

      it('should throw error when no token is stored', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(undefined)

        await expect(portalSelectionService.selectPortal()).rejects.toThrow(
          PORTAL_SELECTION_MESSAGES.NO_TOKEN,
        )
      })

      it('should discover portals across all available regions', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAvailableRegions.mockResolvedValueOnce(['us', 'eu', 'au'])
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({ portals: mockPortalsWithRegion, errors: [] })
        mockShowQuickPick.mockResolvedValueOnce(undefined)

        await portalSelectionService.selectPortal()

        expect(mockFetchAvailableRegions).toHaveBeenCalledWith(mockStorageService)
        expect(mockFetchAllPortalsAcrossRegions).toHaveBeenCalledWith(['us', 'eu', 'au'])
      })

      it('should show warning when no portals are found and no regions failed', async () => {
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({ portals: [], errors: [] })
        vi.mocked(mockStorageService.getToken).mockResolvedValueOnce(testTokens.valid)

        const result = await portalSelectionService.selectPortal()

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.NO_PORTALS_WARNING,
        )
        expect(result).toBeUndefined()
      })

      it('should show a grouped region error when every region failed to fetch', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAvailableRegions.mockResolvedValueOnce(['us', 'sg'])
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({
          portals: [],
          errors: [
            { region: 'us', error: new Error('Network error') },
            { region: 'sg', error: new Error('Not enabled') },
          ],
        })

        const result = await portalSelectionService.selectPortal()

        expect(mockShowErrorMessage).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.ALL_REGIONS_FAILED('us, sg'),
        )
        expect(mockShowWarningMessage).not.toHaveBeenCalled()
        expect(result).toBeUndefined()
      })

      it('should still proceed when some regions have portals and others failed', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({
          portals: mockPortalsWithRegion,
          errors: [{ region: 'sg', error: new Error('Not enabled for this account') }],
        })
        mockShowQuickPick.mockResolvedValueOnce(undefined)

        const result = await portalSelectionService.selectPortal()

        // Partial region failures do not block selection when other regions
        // returned portals successfully.
        expect(mockShowErrorMessage).not.toHaveBeenCalled()
        expect(mockShowWarningMessage).not.toHaveBeenCalled()
        expect(mockShowQuickPick).toHaveBeenCalled()
        expect(result).toBeUndefined()
      })

      it('should return undefined when user cancels selection', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({ portals: mockPortalsWithRegion, errors: [] })
        mockShowQuickPick.mockResolvedValueOnce(undefined)

        const result = await portalSelectionService.selectPortal()

        expect(result).toBeUndefined()
      })

      it('should include the region in the quick pick item detail', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({ portals: mockPortalsWithRegion, errors: [] })
        mockShowQuickPick.mockResolvedValueOnce(undefined)

        await portalSelectionService.selectPortal()

        const [items] = mockShowQuickPick.mock.calls[0]
        expect(items[0].detail).toBe(`${mockPortalsWithRegion[0].canonical_domain}  ·  US`)
      })

      it('should successfully select and store portal with its region', async () => {
        // Setup mocks for successful workflow
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({ portals: mockPortalsWithRegion, errors: [] })
        mockShowQuickPick.mockResolvedValueOnce(mockQuickPickItems[0])

        const selectedPortal = mockQuickPickItems[0].portal
        const expectedConfig = {
          id: selectedPortal.id,
          name: selectedPortal.name,
          displayName: selectedPortal.display_name,
          description: selectedPortal.description,
          origin: 'https://portal1.example.com',
          canonicalDomain: selectedPortal.canonical_domain,
          region: selectedPortal.region,
        }

        // Execute portal selection
        const result = await portalSelectionService.selectPortal()

        // Verify storage behavior
        expect(mockStorageService.storeSelectedPortal).toHaveBeenCalledWith(expectedConfig)

        // Verify user feedback
        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.PORTAL_SELECTED('Portal 1 Name', 'https://portal1.example.com'),
        )

        // Verify return value matches stored config, including region
        expect(result).toEqual(expectedConfig)
        expect(result?.region).toBe('us')

        expect(mockFetchAllPortalsAcrossRegions).toHaveBeenCalled()
      })

      it('should clear token and show error on 401 API error with complete error recovery', async () => {
        const apiError = new ApiError('Unauthorized', 'trace-123', 401)

        // Setup initial state with token
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAllPortalsAcrossRegions.mockRejectedValueOnce(apiError)

        const { showApiError } = await import('./utils/error-handling')

        // Execute portal selection (should fail with 401)
        const result = await portalSelectionService.selectPortal()

        // Verify token cleanup was triggered
        expect(mockStorageService.clearToken).toHaveBeenCalledWith()

        // Verify error handling maintains context
        expect(showApiError).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.LOAD_PORTALS_FAILED,
          apiError,
          mockContext,
        )

        // Verify graceful failure
        expect(result).toBeUndefined()

        // Verify error object structure is preserved
        expect(showApiError).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            statusCode: 401,
            traceId: 'trace-123',
            message: expect.any(String),
          }),
          expect.any(Object),
        )
      })
    })

    describe('Portal Selection Workflow Tests', () => {
      let mockShowWarningMessage: any
      let mockShowInformationMessage: any
      let mockShowQuickPick: any
      let mockWithProgress: any

      beforeEach(async () => {
        const vscode = await import('vscode')
        mockShowWarningMessage = vi.mocked(vscode.window.showWarningMessage)
        mockShowInformationMessage = vi.mocked(vscode.window.showInformationMessage)
        mockShowQuickPick = vi.mocked(vscode.window.showQuickPick)
        mockWithProgress = vi.mocked(vscode.window.withProgress)

        // Setup default progress mock
        mockWithProgress.mockImplementation(async (options: any, callback: any) => {
          const progress = createMockProgress()
          const cancellationToken = createMockCancellationToken()
          return await callback(progress, cancellationToken)
        })
      })

      it('should handle complete successful portal selection workflow', async () => {
        // Step 1: Token validation
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)

        // Step 2: API call for portals across regions
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({ portals: mockPortalsWithRegion, errors: [] })

        // Step 3: User portal selection
        mockShowQuickPick.mockResolvedValueOnce(mockQuickPickItems[0])

        // Execute complete workflow
        const result = await portalSelectionService.selectPortal()

        // Verify workflow completed successfully
        expect(result).toBeDefined()
        expect(result).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          displayName: expect.any(String),
          origin: expect.stringMatching(/^https?:\/\//),
          region: expect.any(String),
        })

        // Verify all required operations were performed
        expect(mockStorageService.getToken).toHaveBeenCalledWith()
        expect(mockFetchAllPortalsAcrossRegions).toHaveBeenCalled()
        expect(mockStorageService.storeSelectedPortal).toHaveBeenCalledWith(result)
        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          expect.stringContaining('Portal "Portal 1 Name" selected'),
        )
      })

      it('should handle error workflow with proper cleanup and recovery', async () => {
        // Step 1: Valid token initially
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)

        // Step 2: API failure with 401
        const apiError = new ApiError('Invalid token', 'trace-456', 401)
        mockFetchAllPortalsAcrossRegions.mockRejectedValueOnce(apiError)

        const { showApiError } = await import('./utils/error-handling')

        // Execute workflow (should fail gracefully)
        const result = await portalSelectionService.selectPortal()

        // Verify error handling and cleanup occurred
        expect(result).toBeUndefined()
        expect(mockStorageService.clearToken).toHaveBeenCalledWith()
        expect(showApiError).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.LOAD_PORTALS_FAILED,
          apiError,
          mockContext,
        )

        // Verify no partial state corruption occurred
        expect(mockStorageService.storeSelectedPortal).not.toHaveBeenCalled()
        expect(mockShowInformationMessage).not.toHaveBeenCalled()
        expect(mockShowQuickPick).not.toHaveBeenCalled()
      })

      it('should handle UI cancellation without side effects', async () => {
        // Setup successful API call
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({ portals: mockPortalsWithRegion, errors: [] })

        // User cancels selection
        mockShowQuickPick.mockResolvedValueOnce(undefined)

        // Execute workflow
        const result = await portalSelectionService.selectPortal()

        // Verify no side effects from cancellation
        expect(mockStorageService.storeSelectedPortal).not.toHaveBeenCalled()
        expect(mockStorageService.clearToken).not.toHaveBeenCalled()
        expect(mockShowInformationMessage).not.toHaveBeenCalled()

        // Verify clean cancellation
        expect(result).toBeUndefined()

        // Verify API was still called (user saw the options before canceling)
        expect(mockFetchAllPortalsAcrossRegions).toHaveBeenCalled()
      })

      it('should handle empty portal list with appropriate user feedback', async () => {
        // Setup valid token but no portals
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({ portals: [], errors: [] })

        // Execute workflow
        const result = await portalSelectionService.selectPortal()

        // Verify appropriate user feedback
        expect(mockShowWarningMessage).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.NO_PORTALS_WARNING,
        )

        // Verify no further UI interactions
        expect(mockShowQuickPick).not.toHaveBeenCalled()
        expect(mockStorageService.storeSelectedPortal).not.toHaveBeenCalled()
        expect(mockShowInformationMessage).not.toHaveBeenCalled()

        // Verify clean termination
        expect(result).toBeUndefined()
      })

      it('should handle progress reporting workflow correctly', async () => {
        // Setup successful workflow
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({ portals: mockPortalsWithRegion, errors: [] })
        mockShowQuickPick.mockResolvedValueOnce(mockQuickPickItems[0])

        // Execute workflow
        await portalSelectionService.selectPortal()

        // Verify progress reporting sequence
        expect(mockWithProgress).toHaveBeenCalledWith(
          expect.objectContaining({
            title: PORTAL_SELECTION_MESSAGES.LOADING_PORTALS,
            cancellable: true,
          }),
          expect.any(Function),
        )

        // The progress callback should have been called with proper reporting
        const progressCallback = vi.mocked(mockWithProgress).mock.calls[0][1]
        expect(progressCallback).toBeDefined()
      })
    })

    describe('validateStoredPortal', () => {
      it('should return undefined when no portal is stored', async () => {
        vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValueOnce(undefined)

        const result = await portalSelectionService.validateStoredPortal()

        expect(result).toBeUndefined()
        expect(mockFetchAllPortals).not.toHaveBeenCalled()
        expect(mockFetchAllPortalsAcrossRegions).not.toHaveBeenCalled()
      })

      it('should return the stored portal without fetching when there is no token', async () => {
        vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValueOnce(mockStoredPortalConfig)
        vi.mocked(mockStorageService.hasValidToken).mockResolvedValueOnce(false)

        const result = await portalSelectionService.validateStoredPortal()

        expect(result).toEqual(mockStoredPortalConfig)
        expect(mockFetchAllPortals).not.toHaveBeenCalled()
      })

      it('should validate against only the stored region when the config has one', async () => {
        vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValueOnce(mockStoredPortalConfig)
        vi.mocked(mockStorageService.hasValidToken).mockResolvedValueOnce(true)
        mockFetchAllPortals.mockResolvedValueOnce([
          { ...mockPortals[0], id: mockStoredPortalConfig.id },
        ])

        const result = await portalSelectionService.validateStoredPortal()

        expect(mockFetchAllPortals).toHaveBeenCalledWith(mockStoredPortalConfig.region)
        expect(mockFetchAllPortalsAcrossRegions).not.toHaveBeenCalled()
        expect(result).toEqual(mockStoredPortalConfig)
      })

      it('should clear the stored portal when it no longer exists in its region', async () => {
        vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValueOnce(mockStoredPortalConfig)
        vi.mocked(mockStorageService.hasValidToken).mockResolvedValueOnce(true)
        mockFetchAllPortals.mockResolvedValueOnce([])

        const result = await portalSelectionService.validateStoredPortal()

        expect(mockStorageService.clearSelectedPortal).toHaveBeenCalled()
        expect(result).toBeUndefined()
      })

      it('should fall back to validating across all regions when the stored config predates region support', async () => {
        const legacyConfig = { ...mockStoredPortalConfig, region: undefined }
        vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValueOnce(legacyConfig)
        vi.mocked(mockStorageService.hasValidToken).mockResolvedValueOnce(true)
        mockFetchAvailableRegions.mockResolvedValueOnce(['us', 'eu'])
        mockFetchAllPortalsAcrossRegions.mockResolvedValueOnce({
          portals: [{ ...mockPortals[0], id: legacyConfig.id, region: 'us' }],
          errors: [],
        })

        const result = await portalSelectionService.validateStoredPortal()

        expect(mockFetchAllPortalsAcrossRegions).toHaveBeenCalledWith(['us', 'eu'])
        expect(mockFetchAllPortals).not.toHaveBeenCalled()
        expect(result).toEqual(legacyConfig)
      })

      it('should clear credentials on a 401 during validation', async () => {
        const apiError = new ApiError('Unauthorized', 'trace-789', 401)
        vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValueOnce(mockStoredPortalConfig)
        vi.mocked(mockStorageService.hasValidToken).mockResolvedValueOnce(true)
        mockFetchAllPortals.mockRejectedValueOnce(apiError)

        const result = await portalSelectionService.validateStoredPortal()

        expect(mockStorageService.clearToken).toHaveBeenCalled()
        expect(mockStorageService.clearSelectedPortal).toHaveBeenCalled()
        expect(result).toBeUndefined()
      })

      it('should keep the stored portal and continue on a non-auth error', async () => {
        vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValueOnce(mockStoredPortalConfig)
        vi.mocked(mockStorageService.hasValidToken).mockResolvedValueOnce(true)
        mockFetchAllPortals.mockRejectedValueOnce(new Error('Network unreachable'))

        const result = await portalSelectionService.validateStoredPortal()

        expect(mockStorageService.clearToken).not.toHaveBeenCalled()
        expect(mockStorageService.clearSelectedPortal).not.toHaveBeenCalled()
        expect(result).toEqual(mockStoredPortalConfig)
      })
    })
  })
})
