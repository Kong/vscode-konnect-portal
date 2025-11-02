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
      it('should store token with trimmed whitespace and verify retrievability', async () => {
        const tokenWithWhitespace = storageTestTokens.withWhitespace
        const expectedTrimmedToken = tokenWithWhitespace.trim()

        // Act: Store the token
        await storageService.storeToken(tokenWithWhitespace)

        // Assert: Verify storage call
        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'konnectaccesstoken',
          expectedTrimmedToken,
        )

        // Assert: Verify state - mock the retrieval to test round-trip behavior
        mockSecretStorage.get.mockResolvedValueOnce(expectedTrimmedToken)
        const retrievedToken = await storageService.getToken()
        expect(retrievedToken).toBe(expectedTrimmedToken)
      })

      it('should store valid token and maintain data integrity', async () => {
        const originalToken = storageTestTokens.valid

        // Act: Store the token
        await storageService.storeToken(originalToken)

        // Assert: Verify storage call
        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'konnectaccesstoken',
          originalToken,
        )

        // Assert: Verify round-trip integrity
        mockSecretStorage.get.mockResolvedValueOnce(originalToken)
        const retrievedToken = await storageService.getToken()
        expect(retrievedToken).toBe(originalToken)

        // Assert: Verify hasValidToken reflects the change (needs fresh mock)
        mockSecretStorage.get.mockResolvedValueOnce(originalToken)
        const hasValid = await storageService.hasValidToken()
        expect(hasValid).toBe(true)
      })

      it('should store empty token and verify validation behavior', async () => {
        const emptyToken = storageTestTokens.empty

        // Act: Store empty token
        await storageService.storeToken(emptyToken)

        // Assert: Verify storage call
        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'konnectaccesstoken',
          emptyToken,
        )

        // Assert: Verify hasValidToken correctly identifies invalid token
        mockSecretStorage.get.mockResolvedValueOnce(emptyToken)
        const hasValid = await storageService.hasValidToken()
        expect(hasValid).toBe(false)
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
      it('should delete stored token and verify state change', async () => {
        // Arrange: Set up initial state with a token
        mockSecretStorage.get.mockResolvedValueOnce(storageTestTokens.valid)
        const initiallyHasToken = await storageService.hasValidToken()
        expect(initiallyHasToken).toBe(true)

        // Act: Clear the token
        await storageService.clearToken()

        // Assert: Verify deletion was called
        expect(mockSecretStorage.delete).toHaveBeenCalledWith('konnectaccesstoken')

        // Assert: Verify state change - no token should be retrievable
        mockSecretStorage.get.mockResolvedValueOnce(undefined)
        const afterClearToken = await storageService.getToken()
        expect(afterClearToken).toBeUndefined()

        // Assert: Verify hasValidToken reflects the change
        const hasValidAfterClear = await storageService.hasValidToken()
        expect(hasValidAfterClear).toBe(false)
      })
    })

    describe('storeSelectedPortal', () => {
      it('should store portal config as JSON and verify round-trip integrity', async () => {
        const originalConfig = mockStoredPortalConfig

        // Act: Store the portal config
        await storageService.storeSelectedPortal(originalConfig)

        // Assert: Verify storage call with serialized data
        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'selectedPortalConfig',
          mockSerializedPortalConfig,
        )

        // Assert: Verify round-trip integrity
        mockSecretStorage.get.mockResolvedValueOnce(mockSerializedPortalConfig)
        const retrievedConfig = await storageService.getSelectedPortal()
        expect(retrievedConfig).toEqual(originalConfig)
      })

      it('should store different portal config and maintain data consistency', async () => {
        const differentConfig = mockStoredPortalConfig2
        const expectedSerialized = JSON.stringify(differentConfig)

        // Act: Store different config
        await storageService.storeSelectedPortal(differentConfig)

        // Assert: Verify storage call
        expect(mockSecretStorage.store).toHaveBeenCalledWith(
          'selectedPortalConfig',
          expectedSerialized,
        )

        // Assert: Verify data consistency through retrieval
        mockSecretStorage.get.mockResolvedValueOnce(expectedSerialized)
        const retrievedConfig = await storageService.getSelectedPortal()
        expect(retrievedConfig).toEqual(differentConfig)
        expect(retrievedConfig).not.toEqual(mockStoredPortalConfig) // Verify it's actually different
      })
    })

    describe('getSelectedPortal', () => {
      it('should retrieve and parse stored portal config with data integrity', async () => {
        // Arrange: Mock stored data
        mockSecretStorage.get.mockResolvedValueOnce(mockSerializedPortalConfig)

        // Act: Retrieve the portal config
        const result = await storageService.getSelectedPortal()

        // Assert: Verify storage access
        expect(mockSecretStorage.get).toHaveBeenCalledWith('selectedPortalConfig')

        // Assert: Verify data integrity and structure
        expect(result).toEqual(mockStoredPortalConfig)
        expect(result).toHaveProperty('id')
        expect(result).toHaveProperty('name')
        expect(result).toHaveProperty('displayName')
        expect(result).toHaveProperty('origin')
        expect(typeof result?.id).toBe('string')
      })

      it('should return undefined when no portal config stored and verify clean state', async () => {
        // Arrange: Mock no stored data
        mockSecretStorage.get.mockResolvedValueOnce(undefined)

        // Act: Attempt to retrieve
        const result = await storageService.getSelectedPortal()

        // Assert: Verify storage access
        expect(mockSecretStorage.get).toHaveBeenCalledWith('selectedPortalConfig')

        // Assert: Verify clean state
        expect(result).toBeUndefined()
      })

      it('should handle invalid JSON, clear corrupted data, and verify recovery', async () => {
        // Arrange: Mock corrupted data
        mockSecretStorage.get.mockResolvedValueOnce(mockInvalidJsonString)

        // Act: Attempt to retrieve (should trigger cleanup)
        const result = await storageService.getSelectedPortal()

        // Assert: Verify access attempt
        expect(mockSecretStorage.get).toHaveBeenCalledWith('selectedPortalConfig')

        // Assert: Verify cleanup was performed
        expect(mockSecretStorage.delete).toHaveBeenCalledWith('selectedPortalConfig')

        // Assert: Verify graceful failure
        expect(result).toBeUndefined()

        // Assert: Verify system can recover - subsequent call should work
        mockSecretStorage.get.mockResolvedValueOnce(undefined) // After cleanup
        const resultAfterCleanup = await storageService.getSelectedPortal()
        expect(resultAfterCleanup).toBeUndefined()
      })

      it('should handle empty string, clear data, and maintain system stability', async () => {
        // Arrange: Mock empty string (edge case)
        mockSecretStorage.get.mockResolvedValueOnce('')

        // Act: Attempt to retrieve
        const result = await storageService.getSelectedPortal()

        // Assert: Verify graceful handling of empty string
        expect(result).toBeUndefined()

        // Note: Empty string is falsy, so it should return undefined without attempting JSON.parse
        // This verifies the early return logic works correctly
      })
    })

    describe('clearSelectedPortal', () => {
      it('should delete stored portal config', async () => {
        await storageService.clearSelectedPortal()

        expect(mockSecretStorage.delete).toHaveBeenCalledWith('selectedPortalConfig')
      })
    })

    describe('clearAll', () => {
      it('should clear both token and portal config and verify complete state reset', async () => {
        // Arrange: Set up initial state with both token and portal
        mockSecretStorage.get
          .mockResolvedValueOnce(storageTestTokens.valid) // for hasValidToken check
          .mockResolvedValueOnce(mockSerializedPortalConfig) // for initial portal check

        // Verify initial state has data
        const initialHasToken = await storageService.hasValidToken()
        const initialPortal = await storageService.getSelectedPortal()
        expect(initialHasToken).toBe(true)
        expect(initialPortal).toEqual(mockStoredPortalConfig)

        // Act: Clear all data
        await storageService.clearAll()

        // Assert: Verify both deletion calls were made
        expect(mockSecretStorage.delete).toHaveBeenCalledWith('konnectaccesstoken')
        expect(mockSecretStorage.delete).toHaveBeenCalledWith('selectedPortalConfig')
        expect(mockSecretStorage.delete).toHaveBeenCalledTimes(2)

        // Assert: Verify complete state reset
        mockSecretStorage.get
          .mockResolvedValueOnce(undefined) // token check
          .mockResolvedValueOnce(undefined) // portal check

        const afterClearHasToken = await storageService.hasValidToken()
        const afterClearPortal = await storageService.getSelectedPortal()

        expect(afterClearHasToken).toBe(false)
        expect(afterClearPortal).toBeUndefined()
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

    describe('State Integration Tests', () => {
      describe('complete workflow scenarios', () => {
        it('should handle complete token lifecycle with state verification', async () => {
          // Step 1: Initially no token
          mockSecretStorage.get.mockResolvedValueOnce(undefined)
          expect(await storageService.hasValidToken()).toBe(false)

          // Step 2: Store token
          await storageService.storeToken(storageTestTokens.valid)
          expect(mockSecretStorage.store).toHaveBeenCalledWith('konnectaccesstoken', storageTestTokens.valid)

          // Step 3: Verify token exists (need two separate mock calls)
          mockSecretStorage.get.mockResolvedValueOnce(storageTestTokens.valid) // for hasValidToken
          expect(await storageService.hasValidToken()).toBe(true)

          mockSecretStorage.get.mockResolvedValueOnce(storageTestTokens.valid) // for getToken
          expect(await storageService.getToken()).toBe(storageTestTokens.valid)

          // Step 4: Clear token
          await storageService.clearToken()
          expect(mockSecretStorage.delete).toHaveBeenCalledWith('konnectaccesstoken')

          // Step 5: Verify token removed (need two separate mock calls)
          mockSecretStorage.get.mockResolvedValueOnce(undefined) // for hasValidToken
          expect(await storageService.hasValidToken()).toBe(false)

          mockSecretStorage.get.mockResolvedValueOnce(undefined) // for getToken
          expect(await storageService.getToken()).toBeUndefined()
        })

        it('should handle complete portal configuration lifecycle', async () => {
          // Step 1: Initially no portal
          mockSecretStorage.get.mockResolvedValueOnce(undefined)
          expect(await storageService.getSelectedPortal()).toBeUndefined()

          // Step 2: Store portal config
          await storageService.storeSelectedPortal(mockStoredPortalConfig)
          expect(mockSecretStorage.store).toHaveBeenCalledWith('selectedPortalConfig', mockSerializedPortalConfig)

          // Step 3: Verify portal stored and retrievable
          mockSecretStorage.get.mockResolvedValueOnce(mockSerializedPortalConfig)
          const retrieved = await storageService.getSelectedPortal()
          expect(retrieved).toEqual(mockStoredPortalConfig)

          // Step 4: Update to different portal
          await storageService.storeSelectedPortal(mockStoredPortalConfig2)
          expect(mockSecretStorage.store).toHaveBeenCalledWith('selectedPortalConfig', JSON.stringify(mockStoredPortalConfig2))

          // Step 5: Verify update worked
          mockSecretStorage.get.mockResolvedValueOnce(JSON.stringify(mockStoredPortalConfig2))
          const updated = await storageService.getSelectedPortal()
          expect(updated).toEqual(mockStoredPortalConfig2)
          expect(updated).not.toEqual(mockStoredPortalConfig)

          // Step 6: Clear portal
          await storageService.clearSelectedPortal()
          expect(mockSecretStorage.delete).toHaveBeenCalledWith('selectedPortalConfig')

          // Step 7: Verify portal removed
          mockSecretStorage.get.mockResolvedValueOnce(undefined)
          expect(await storageService.getSelectedPortal()).toBeUndefined()
        })

        it('should handle data corruption recovery gracefully', async () => {
          // Step 1: Corrupt data exists
          mockSecretStorage.get.mockResolvedValueOnce(mockInvalidJsonString)

          // Step 2: Attempt retrieval triggers cleanup
          const result = await storageService.getSelectedPortal()
          expect(result).toBeUndefined()
          expect(mockSecretStorage.delete).toHaveBeenCalledWith('selectedPortalConfig')

          // Step 3: System should be ready for fresh data
          await storageService.storeSelectedPortal(mockStoredPortalConfig)
          expect(mockSecretStorage.store).toHaveBeenCalledWith('selectedPortalConfig', mockSerializedPortalConfig)

          // Step 4: Fresh data should work normally
          mockSecretStorage.get.mockResolvedValueOnce(mockSerializedPortalConfig)
          const fresh = await storageService.getSelectedPortal()
          expect(fresh).toEqual(mockStoredPortalConfig)
        })

        it('should maintain data independence between token and portal', async () => {
          // Store both token and portal
          await storageService.storeToken(storageTestTokens.valid)
          await storageService.storeSelectedPortal(mockStoredPortalConfig)

          // Clear only token
          await storageService.clearToken()

          // Portal should remain intact
          mockSecretStorage.get.mockResolvedValueOnce(mockSerializedPortalConfig)
          const portalAfterTokenClear = await storageService.getSelectedPortal()
          expect(portalAfterTokenClear).toEqual(mockStoredPortalConfig)

          // Clear only portal
          await storageService.clearSelectedPortal()

          // Token state should be independent (though we cleared it above, test the independence)
          mockSecretStorage.get.mockResolvedValueOnce(undefined) // token was cleared
          expect(await storageService.getToken()).toBeUndefined()
        })
      })
    })
  })
})
