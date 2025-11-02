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
    } as any

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

      it('should successfully select and store portal', async () => {
        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockApiService.fetchAllPortals.mockResolvedValueOnce(mockPortals)
        mockShowQuickPick.mockResolvedValueOnce(mockQuickPickItems[0])

        const result = await portalSelectionService.selectPortal()

        expect(mockStorageService.storeSelectedPortal).toHaveBeenCalledWith({
          id: '1',
          name: 'Portal 1',
          displayName: 'Portal 1 Display',
          description: 'Test Portal 1',
          origin: 'https://portal1.example.com',
          canonicalDomain: 'portal1.example.com',
        })

        expect(mockShowInformationMessage).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.PORTAL_SELECTED('Portal 1 Display', 'https://portal1.example.com'),
        )

        expect(result).toEqual({
          id: '1',
          name: 'Portal 1',
          displayName: 'Portal 1 Display',
          description: 'Test Portal 1',
          origin: 'https://portal1.example.com',
          canonicalDomain: 'portal1.example.com',
        })
      })

      it('should clear token and show error on 401 API error', async () => {
        const apiError = new ApiError('Unauthorized', 'trace-123', 401)

        mockStorageService.getToken = vi.fn().mockResolvedValueOnce(testTokens.valid)
        mockApiService.fetchAllPortals.mockRejectedValueOnce(apiError)

        const { showApiError } = await import('../utils/error-handling')

        const result = await portalSelectionService.selectPortal()

        expect(mockStorageService.clearToken).toHaveBeenCalledWith()
        expect(showApiError).toHaveBeenCalledWith(
          PORTAL_SELECTION_MESSAGES.LOAD_PORTALS_FAILED,
          apiError,
          mockContext,
        )
        expect(result).toBeUndefined()
      })
    })
  })
})
