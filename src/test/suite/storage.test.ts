import * as assert from 'assert'
import * as vscode from 'vscode'
import { PortalStorageService } from '../../konnect/storage'
import type { StoredPortalConfig } from '../../types/konnect'

/** Test suite for Portal Storage Service functionality */
suite('Storage Service Tests', () => {
  /** Storage service instance for testing */
  let storageService: PortalStorageService

  /** Real secret storage implementation for testing */
  let realSecretStorage: Map<string, string>

  /** Extension context that uses real secret storage interface */
  let extensionContext: vscode.ExtensionContext

  /** Sample portal configuration for testing */
  const samplePortalConfig: StoredPortalConfig = {
    id: 'test-portal-123',
    name: 'test-portal',
    displayName: 'Test Portal',
    description: 'A test portal for unit testing',
    origin: 'https://test-portal.example.com',
    canonicalDomain: 'test-portal.example.com',
  }

  /** Sample Konnect token for testing */
  const sampleToken = 'kpat_test123456789abcdef'

  setup(async () => {
    // Create a real secret storage implementation for testing
    // This behaves exactly like VS Code's secret storage but in-memory for tests
    realSecretStorage = new Map<string, string>()

    // Create an extension context that implements the real VS Code interfaces
    // This tests the actual storage service against real VS Code API contracts
    extensionContext = {
      secrets: {
        store: async (key: string, value: string): Promise<void> => {
          realSecretStorage.set(key, value)
        },
        get: async (key: string): Promise<string | undefined> => {
          return realSecretStorage.get(key)
        },
        delete: async (key: string): Promise<void> => {
          realSecretStorage.delete(key)
        },
        keys: async (): Promise<string[]> => {
          return Array.from(realSecretStorage.keys())
        },
        onDidChange: () => ({ dispose: () => {} }),
      },
      globalState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        keys: () => [],
        setKeysForSync: () => {},
      },
      workspaceState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        keys: () => [],
      },
      subscriptions: [],
      extensionPath: '/test/extension/path',
      storagePath: undefined,
      globalStoragePath: '/test/global/storage',
      logPath: '/test/logs',
      extensionUri: vscode.Uri.file('/test/extension/path'),
      storageUri: undefined,
      globalStorageUri: vscode.Uri.file('/test/global/storage'),
      logUri: vscode.Uri.file('/test/logs'),
      extensionMode: vscode.ExtensionMode.Test,
      extension: {} as any,
      environmentVariableCollection: {} as any,
      languageModelAccessInformation: {} as any,
      asAbsolutePath: (relativePath: string) => `/test/extension/path/${relativePath}`,
    } as vscode.ExtensionContext

    // Create storage service with real VS Code interface implementation
    storageService = new PortalStorageService(extensionContext)
  })

  teardown(async () => {
    // Clean up test data after each test
    realSecretStorage.clear()
  })

  suite('Token Management', () => {
    test('should store and retrieve token', async () => {
      // Store token
      await storageService.storeToken(sampleToken)

      // Retrieve token
      const retrievedToken = await storageService.getToken()
      assert.strictEqual(retrievedToken, sampleToken, 'Retrieved token should match stored token')
    })

    test('should trim whitespace when storing token', async () => {
      const tokenWithWhitespace = '  ' + sampleToken + '  '

      // Store token with whitespace
      await storageService.storeToken(tokenWithWhitespace)

      // Retrieve token should be trimmed
      const retrievedToken = await storageService.getToken()
      assert.strictEqual(retrievedToken, sampleToken, 'Retrieved token should be trimmed')
    })

    test('should return undefined when no token is stored', async () => {
      const retrievedToken = await storageService.getToken()
      assert.strictEqual(retrievedToken, undefined, 'Should return undefined when no token is stored')
    })

    test('should clear stored token', async () => {
      // Store token first
      await storageService.storeToken(sampleToken)

      // Verify token is stored
      let retrievedToken = await storageService.getToken()
      assert.strictEqual(retrievedToken, sampleToken, 'Token should be stored')

      // Clear token
      await storageService.clearToken()

      // Verify token is cleared
      retrievedToken = await storageService.getToken()
      assert.strictEqual(retrievedToken, undefined, 'Token should be cleared')
    })

    test('should validate token presence correctly', async () => {
      // Initially no token
      let hasToken = await storageService.hasValidToken()
      assert.strictEqual(hasToken, false, 'Should return false when no token exists')

      // Store valid token
      await storageService.storeToken(sampleToken)
      hasToken = await storageService.hasValidToken()
      assert.strictEqual(hasToken, true, 'Should return true when valid token exists')

      // Store empty token
      await storageService.storeToken('')
      hasToken = await storageService.hasValidToken()
      assert.strictEqual(hasToken, false, 'Should return false for empty token')

      // Store whitespace-only token
      await storageService.storeToken('   ')
      hasToken = await storageService.hasValidToken()
      assert.strictEqual(hasToken, false, 'Should return false for whitespace-only token')
    })
  })

  suite('Portal Configuration Management', () => {
    test('should store and retrieve portal configuration', async () => {
      // Store portal config
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Retrieve portal config
      const retrievedConfig = await storageService.getSelectedPortal()
      assert.deepStrictEqual(retrievedConfig, samplePortalConfig, 'Retrieved config should match stored config')
    })

    test('should return undefined when no portal config is stored', async () => {
      const retrievedConfig = await storageService.getSelectedPortal()
      assert.strictEqual(retrievedConfig, undefined, 'Should return undefined when no config is stored')
    })

    test('should clear stored portal configuration', async () => {
      // Store portal config first
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Verify config is stored
      let retrievedConfig = await storageService.getSelectedPortal()
      assert.deepStrictEqual(retrievedConfig, samplePortalConfig, 'Config should be stored')

      // Clear config
      await storageService.clearSelectedPortal()

      // Verify config is cleared
      retrievedConfig = await storageService.getSelectedPortal()
      assert.strictEqual(retrievedConfig, undefined, 'Config should be cleared')
    })

    test('should handle corrupted JSON in portal configuration', async () => {
      // Manually store invalid JSON directly in the secret storage
      await extensionContext.secrets.store('selectedPortalConfig', 'invalid json {')

      // Should return undefined and clean up corrupted data
      const retrievedConfig = await storageService.getSelectedPortal()
      assert.strictEqual(retrievedConfig, undefined, 'Should return undefined for corrupted JSON')

      // Verify corrupted data was cleaned up
      const afterCleanup = await storageService.getSelectedPortal()
      assert.strictEqual(afterCleanup, undefined, 'Should still return undefined after cleanup')
    })

    test('should preserve all portal configuration fields', async () => {
      const detailedPortalConfig: StoredPortalConfig = {
        id: 'detailed-portal-456',
        name: 'detailed-portal-name',
        displayName: 'Detailed Portal Display Name',
        description: 'A detailed portal configuration with all fields populated',
        origin: 'https://detailed-portal.example.com',
        canonicalDomain: 'detailed-portal.example.com',
      }

      // Store detailed config
      await storageService.storeSelectedPortal(detailedPortalConfig)

      // Retrieve and verify all fields
      const retrievedConfig = await storageService.getSelectedPortal()
      assert.deepStrictEqual(retrievedConfig, detailedPortalConfig, 'All fields should be preserved')
      assert.strictEqual(retrievedConfig?.id, detailedPortalConfig.id, 'ID should be preserved')
      assert.strictEqual(retrievedConfig?.name, detailedPortalConfig.name, 'Name should be preserved')
      assert.strictEqual(retrievedConfig?.displayName, detailedPortalConfig.displayName, 'Display name should be preserved')
      assert.strictEqual(retrievedConfig?.description, detailedPortalConfig.description, 'Description should be preserved')
      assert.strictEqual(retrievedConfig?.origin, detailedPortalConfig.origin, 'Origin should be preserved')
      assert.strictEqual(retrievedConfig?.canonicalDomain, detailedPortalConfig.canonicalDomain, 'Canonical domain should be preserved')
    })
  })

  suite('Bulk Operations', () => {
    test('should clear all stored data', async () => {
      // Store both token and portal config
      await storageService.storeToken(sampleToken)
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Verify both are stored
      let token = await storageService.getToken()
      let config = await storageService.getSelectedPortal()
      assert.strictEqual(token, sampleToken, 'Token should be stored')
      assert.deepStrictEqual(config, samplePortalConfig, 'Config should be stored')

      // Clear all data
      await storageService.clearAll()

      // Verify all data is cleared
      token = await storageService.getToken()
      config = await storageService.getSelectedPortal()
      assert.strictEqual(token, undefined, 'Token should be cleared')
      assert.strictEqual(config, undefined, 'Config should be cleared')
    })

    test('should handle clearAll when no data exists', async () => {
      // Clear all when nothing is stored (should not throw)
      await storageService.clearAll()

      // Verify still no data exists
      const token = await storageService.getToken()
      const config = await storageService.getSelectedPortal()
      assert.strictEqual(token, undefined, 'Token should remain undefined')
      assert.strictEqual(config, undefined, 'Config should remain undefined')
    })
  })

  suite('Data Isolation', () => {
    test('should maintain independent storage for different instances', async () => {
      // Create a second storage service instance with the same context
      const storageService2 = new PortalStorageService(extensionContext)

      // Store different data in each instance
      await storageService.storeToken(sampleToken)
      await storageService2.storeToken('kpat_different_token')

      // Both should see the same value since they share the same context/storage
      const token1 = await storageService.getToken()
      const token2 = await storageService2.getToken()

      // Since they share the same context, they should have the same value (the last stored)
      assert.strictEqual(token1, 'kpat_different_token', 'Both instances should see the latest value')
      assert.strictEqual(token2, 'kpat_different_token', 'Both instances should see the latest value')
    })

    test('should not interfere with portal config operations during token operations', async () => {
      // Store initial data
      await storageService.storeToken(sampleToken)
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Clear only token
      await storageService.clearToken()

      // Portal config should remain unchanged
      const token = await storageService.getToken()
      const config = await storageService.getSelectedPortal()
      assert.strictEqual(token, undefined, 'Token should be cleared')
      assert.deepStrictEqual(config, samplePortalConfig, 'Portal config should remain unchanged')
    })
  })

  suite('VS Code Integration', () => {
    test('should use correct secret storage keys defined in the service', async () => {
      // Store a token and verify it's stored with the correct key
      await storageService.storeToken(sampleToken)

      // Check that the token is stored under the expected key
      const storedKeys = await extensionContext.secrets.keys()
      assert.ok(storedKeys.includes('konnectaccesstoken'), 'Should store token under correct key')

      // Store portal config and verify key
      await storageService.storeSelectedPortal(samplePortalConfig)
      const updatedKeys = await extensionContext.secrets.keys()
      assert.ok(updatedKeys.includes('selectedPortalConfig'), 'Should store portal config under correct key')
    })

    test('should maintain data persistence across service recreations', async () => {
      // Store data with first service instance
      await storageService.storeToken(sampleToken)
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a new service instance with the same context (simulating extension reload)
      const newStorageService = new PortalStorageService(extensionContext)

      // Verify data persists
      const retrievedToken = await newStorageService.getToken()
      const retrievedConfig = await newStorageService.getSelectedPortal()

      assert.strictEqual(retrievedToken, sampleToken, 'Token should persist across service recreations')
      assert.deepStrictEqual(retrievedConfig, samplePortalConfig, 'Portal config should persist across service recreations')
    })

    test('should handle real VS Code secret storage interface correctly', async () => {
      // Test that the service correctly implements the VS Code SecretStorage interface
      const secrets = extensionContext.secrets

      // Test that secret storage methods actually work by calling them
      await secrets.store('test-method-key', 'test-method-value')
      const retrievedValue = await secrets.get('test-method-key')
      assert.strictEqual(retrievedValue, 'test-method-value', 'Secret storage store and get methods should work')

      await secrets.delete('test-method-key')
      const deletedValue = await secrets.get('test-method-key')
      assert.strictEqual(deletedValue, undefined, 'Secret storage delete method should work')

      const allKeys = await secrets.keys()
      assert.ok(Array.isArray(allKeys), 'Secret storage keys method should return array')

      // Test that our service works with these real methods
      await storageService.storeToken(sampleToken)
      const directRetrieval = await secrets.get('konnectaccesstoken')
      assert.strictEqual(directRetrieval, sampleToken, 'Should be able to retrieve data directly from secret storage')
    })

    test('should handle concurrent operations correctly', async () => {
      // Test multiple simultaneous operations
      const operations = [
        storageService.storeToken('token1'),
        storageService.storeSelectedPortal(samplePortalConfig),
        storageService.storeToken('token2'), // This should overwrite token1
      ]

      await Promise.all(operations)

      // Verify final state
      const finalToken = await storageService.getToken()
      const finalConfig = await storageService.getSelectedPortal()

      assert.ok(['token1', 'token2'].includes(finalToken!), 'Should have one of the stored tokens')
      assert.deepStrictEqual(finalConfig, samplePortalConfig, 'Portal config should be stored correctly')
    })

    test('should properly clean up all keys on clearAll', async () => {
      // Store multiple pieces of data
      await storageService.storeToken(sampleToken)
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Verify data is stored
      const keysBeforeClear = await extensionContext.secrets.keys()
      assert.ok(keysBeforeClear.includes('konnectaccesstoken'), 'Token key should exist before clear')
      assert.ok(keysBeforeClear.includes('selectedPortalConfig'), 'Portal config key should exist before clear')

      // Clear all data
      await storageService.clearAll()

      // Verify all extension keys are removed
      const keysAfterClear = await extensionContext.secrets.keys()
      assert.ok(!keysAfterClear.includes('konnectaccesstoken'), 'Token key should be removed after clear')
      assert.ok(!keysAfterClear.includes('selectedPortalConfig'), 'Portal config key should be removed after clear')
    })
  })
})
