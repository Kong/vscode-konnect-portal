import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ExtensionContext } from 'vscode'
import { PortalStorageService } from './storage'
import {
  mockStoredPortalConfig,
  mockStoredPortalConfig2,
  storageTestTokens,
  mockSerializedPortalConfig,
  mockInvalidJsonString,
  createMockContext,
} from '../../tests/fixtures/konnect-storage'

// Mock vscode module
vi.mock('vscode', () => ({
  // Add any VS Code APIs used by storage service
}))

describe('konnect/storage', () => {
  let storageService: PortalStorageService
  let mockContext: ReturnType<typeof createMockContext>
  let mockSecretStorage: ReturnType<typeof createMockContext>['secrets']

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = createMockContext()
    mockSecretStorage = mockContext.secrets
    storageService = new PortalStorageService(mockContext as unknown as ExtensionContext)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('PortalStorageService', () => {
    describe('constructor', () => {
      it('should create service with context', () => {
        expect(storageService).toBeInstanceOf(PortalStorageService)
      })
    })

    describe('storeToken', () => {
      it('should store token with trimmed whitespace', async () => {
        await storageService.storeToken(storageTestTokens.withWhitespace)

        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'konnectaccesstoken',
          storageTestTokens.withWhitespace.trim(),
        )
      })

      it('should store valid token', async () => {
        await storageService.storeToken(storageTestTokens.valid)

        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'konnectaccesstoken',
          storageTestTokens.valid,
        )
      })

      it('should store empty token', async () => {
        await storageService.storeToken(storageTestTokens.empty)

        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'konnectaccesstoken',
          storageTestTokens.empty,
        )
      })
    })

    describe('getToken', () => {
      it('should retrieve stored token', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(storageTestTokens.valid)

        const result = await storageService.getToken()

        expect(mockSecretStorage.get).toHaveBeenCalledWith('konnectaccesstoken')
        expect(result).toBe(storageTestTokens.valid)
      })

      it('should return undefined when no token stored', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(undefined)

        const result = await storageService.getToken()

        expect(mockSecretStorage.get).toHaveBeenCalledWith('konnectaccesstoken')
        expect(result).toBeUndefined()
      })
    })

    describe('clearToken', () => {
      it('should delete stored token', async () => {
        await storageService.clearToken()

        expect(mockSecretStorage.delete).toHaveBeenCalledWith('konnectaccesstoken')
      })
    })

    describe('storeSelectedPortal', () => {
      it('should store portal config as JSON string', async () => {
        await storageService.storeSelectedPortal(mockStoredPortalConfig)

        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'selectedPortalConfig',
          mockSerializedPortalConfig,
        )
      })

      it('should store different portal config', async () => {
        await storageService.storeSelectedPortal(mockStoredPortalConfig2)

        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'selectedPortalConfig',
          JSON.stringify(mockStoredPortalConfig2),
        )
      })
    })

    describe('getSelectedPortal', () => {
      it('should retrieve and parse stored portal config', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(mockSerializedPortalConfig)

        const result = await storageService.getSelectedPortal()

        expect(mockSecretStorage.get).toHaveBeenCalledWith('selectedPortalConfig')
        expect(result).toEqual(mockStoredPortalConfig)
      })

      it('should return undefined when no portal config stored', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(undefined)

        const result = await storageService.getSelectedPortal()

        expect(mockSecretStorage.get).toHaveBeenCalledWith('selectedPortalConfig')
        expect(result).toBeUndefined()
      })

      it('should handle invalid JSON and clear corrupted data', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(mockInvalidJsonString)

        const result = await storageService.getSelectedPortal()

        expect(mockSecretStorage.get).toHaveBeenCalledWith('selectedPortalConfig')
        expect(mockSecretStorage.delete).toHaveBeenCalledWith('selectedPortalConfig')
        expect(result).toBeUndefined()
      })

      it('should handle empty string and clear corrupted data', async () => {
        mockSecretStorage.get.mockResolvedValueOnce('')

        const result = await storageService.getSelectedPortal()

        expect(result).toBeUndefined()
      })
    })

    describe('clearSelectedPortal', () => {
      it('should delete stored portal config', async () => {
        await storageService.clearSelectedPortal()

        expect(mockSecretStorage.delete).toHaveBeenCalledWith('selectedPortalConfig')
      })
    })

    describe('clearAll', () => {
      it('should clear both token and portal config', async () => {
        await storageService.clearAll()

        expect(mockSecretStorage.delete).toHaveBeenCalledWith('konnectaccesstoken')
        expect(mockSecretStorage.delete).toHaveBeenCalledWith('selectedPortalConfig')
        expect(mockSecretStorage.delete).toHaveBeenCalledTimes(2)
      })
    })

    describe('hasValidToken', () => {
      it('should return true for valid token', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(storageTestTokens.valid)

        const result = await storageService.hasValidToken()

        expect(result).toBe(true)
      })

      it('should return false for undefined token', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(undefined)

        const result = await storageService.hasValidToken()

        expect(result).toBe(false)
      })

      it('should return false for empty token', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(storageTestTokens.empty)

        const result = await storageService.hasValidToken()

        expect(result).toBe(false)
      })

      it('should return false for whitespace-only token', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(storageTestTokens.whitespace)

        const result = await storageService.hasValidToken()

        expect(result).toBe(false)
      })

      it('should return true for token with whitespace that trims to valid content', async () => {
        mockSecretStorage.get.mockResolvedValueOnce(storageTestTokens.withWhitespace)

        const result = await storageService.hasValidToken()

        expect(result).toBe(true)
      })
    })
  })
})
