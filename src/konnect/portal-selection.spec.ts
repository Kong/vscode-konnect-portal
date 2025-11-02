import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ExtensionContext } from 'vscode'
import { PortalSelectionService } from './portal-selection'
import type { PortalStorageService } from './storage'
import { ApiError } from './api'
import { PORTAL_SELECTION_MESSAGES } from '../constants/messages'
import {
  mockPortals,
  testTokens,
} from '../../tests/fixtures/konnect-api'
import {
  createMockContext,
  createMockProgress,
  createMockCancellationToken,
  mockQuickPickItems,
} from '../../tests/fixtures/konnect-storage'

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
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

// Mock API service with a simple function
vi.mock('./api', () => ({
  KonnectApiService: class {
    fetchAllPortals = vi.fn()
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public traceId?: string, public statusCode?: number) {
      super(message)
      this.name = 'ApiError'
    }
  },
}))

// Mock error handling utility
vi.mock('../utils/error-handling', () => ({
  showApiError: vi.fn(),
}))

describe('konnect/portal-selection', () => {
  let portalSelectionService: PortalSelectionService
  let mockStorageService: PortalStorageService
  let mockContext: ReturnType<typeof createMockContext>
  let mockApiService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Setup mock context
    mockContext = createMockContext()

    // Setup mock storage service
    mockStorageService = {
      getToken: vi.fn(),
      storeSelectedPortal: vi.fn(),
      clearToken: vi.fn(),
    } as unknown as PortalStorageService

    // Create service instance
    portalSelectionService = new PortalSelectionService(
      mockStorageService,
      mockContext as unknown as ExtensionContext,
    )

    // Get reference to the mocked API service instance
    mockApiService = (portalSelectionService as any).apiService
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

      it('should throw error when no token is stored', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(undefined)

        await expect(portalSelectionService.selectPortal()).rejects.toThrow(
          PORTAL_SELECTION_MESSAGES.NO_TOKEN,
        )
      })

      it('should show warning when no portals are found', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockApiService.fetchAllPortals.mockResolvedValueOnce([])

        const result = await portalSelectionService.selectPortal()

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.NO_PORTALS_WARNING,
        )
        expect(result).toBeUndefined()
      })

      it('should return undefined when user cancels selection', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockApiService.fetchAllPortals.mockResolvedValueOnce(mockPortals)
        mockShowQuickPick.mockResolvedValueOnce(undefined)

        const result = await portalSelectionService.selectPortal()

        expect(result).toBeUndefined()
      })

      it('should successfully select and store portal with complete workflow verification', async () => {
        // Setup mocks for successful workflow
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockApiService.fetchAllPortals.mockResolvedValueOnce(mockPortals)
        mockShowQuickPick.mockResolvedValueOnce(mockQuickPickItems[0])

        const selectedPortal = mockQuickPickItems[0].portal
        const expectedConfig = {
          id: selectedPortal.id,
          name: selectedPortal.name,
          displayName: selectedPortal.display_name,
          description: selectedPortal.description,
          origin: 'https://portal1.example.com',
          canonicalDomain: selectedPortal.canonical_domain,
        }

        // Execute portal selection
        const result = await portalSelectionService.selectPortal()

        // Verify storage behavior
        expect(mockStorageService.storeSelectedPortal).toHaveBeenCalledWith(expectedConfig)

        // Verify user feedback
        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.PORTAL_SELECTED('Portal 1 Display', 'https://portal1.example.com'),
        )

        // Verify return value matches stored config
        expect(result).toEqual(expectedConfig)

        // Verify API was called with correct token
        expect(mockApiService.fetchAllPortals).toHaveBeenCalledWith(testTokens.valid)

        // Verify complete data structure
        expect(result).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
          displayName: expect.any(String),
          origin: expect.stringMatching(/^https?:\/\//),
          canonicalDomain: expect.any(String),
        })
      })

      it('should clear token and show error on 401 API error with complete error recovery', async () => {
        const apiError = new ApiError('Unauthorized', 'trace-123', 401)

        // Setup initial state with token
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockApiService.fetchAllPortals.mockRejectedValueOnce(apiError)

        const { showApiError } = await import('../utils/error-handling')

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

    describe('Portal Selection Workflow Integration Tests', () => {
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

      describe('complete workflow scenarios', () => {
        it('should handle complete successful portal selection workflow', async () => {
          // Step 1: Token validation
          mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)

          // Step 2: API call for portals
          mockApiService.fetchAllPortals.mockResolvedValueOnce(mockPortals)

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
          })

          // Verify all required operations were performed
          expect(mockStorageService.getToken).toHaveBeenCalledWith()
          expect(mockApiService.fetchAllPortals).toHaveBeenCalledWith(testTokens.valid)
          expect(mockStorageService.storeSelectedPortal).toHaveBeenCalledWith(result)
          expect(mockShowInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('Portal "Portal 1 Display" selected'),
          )
        })

        it('should handle error workflow with proper cleanup and recovery', async () => {
          // Step 1: Valid token initially
          mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)

          // Step 2: API failure with 401
          const apiError = new ApiError('Invalid token', 'trace-456', 401)
          mockApiService.fetchAllPortals.mockRejectedValueOnce(apiError)

          const { showApiError } = await import('../utils/error-handling')

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
          mockApiService.fetchAllPortals.mockResolvedValueOnce(mockPortals)

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
          expect(mockApiService.fetchAllPortals).toHaveBeenCalledWith(testTokens.valid)
        })

        it('should handle empty portal list with appropriate user feedback', async () => {
          // Setup valid token but no portals
          mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
          mockApiService.fetchAllPortals.mockResolvedValueOnce([])

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
          mockApiService.fetchAllPortals.mockResolvedValueOnce(mockPortals)
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
    })
  })
})
