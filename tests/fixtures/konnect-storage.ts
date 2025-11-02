/**
 * Test fixtures for Konnect storage and portal selection tests
 */

import { vi } from 'vitest'
import type { StoredPortalConfig } from '../../src/types/konnect'

/**
 * Mock stored portal configurations for testing
 */
export const mockStoredPortalConfig: StoredPortalConfig = {
  id: 'portal-123',
  name: 'Test Portal',
  displayName: 'Test Portal Display',
  description: 'A test portal for testing',
  origin: 'https://test-portal.example.com',
  canonicalDomain: 'test-portal.example.com',
}

export const mockStoredPortalConfig2: StoredPortalConfig = {
  id: 'portal-456',
  name: 'Another Portal',
  displayName: 'Another Portal Display',
  description: 'Another test portal',
  origin: 'https://another-portal.example.com',
  canonicalDomain: 'another-portal.example.com',
}

/**
 * Test tokens for storage tests
 */
export const storageTestTokens = {
  valid: 'kpat_valid_token_123456789',
  withWhitespace: '  kpat_token_with_spaces  ',
  empty: '',
  whitespace: '   ',
} as const

/**
 * Mock JSON strings for testing serialization
 */
export const mockSerializedPortalConfig = JSON.stringify(mockStoredPortalConfig)
export const mockInvalidJsonString = '{"invalid":"json"'

/**
 * Mock VS Code context for testing
 */
export const createMockContext = () => ({
  secrets: {
    store: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
  // Add other context properties as needed
  subscriptions: [],
  workspaceState: {
    get: vi.fn(),
    update: vi.fn(),
  },
  globalState: {
    get: vi.fn(),
    update: vi.fn(),
  },
})

/**
 * Mock progress for VS Code withProgress
 */
export const createMockProgress = () => ({
  report: vi.fn(),
})

/**
 * Mock cancellation token for VS Code operations
 */
export const createMockCancellationToken = (isCancelled = false) => ({
  isCancellationRequested: isCancelled,
  onCancellationRequested: vi.fn(),
})

/**
 * Mock quick pick items for portal selection
 */
export const mockQuickPickItems = [
  {
    label: 'Portal 1 Display',
    description: 'Test Portal 1',
    detail: 'portal1.example.com',
    portal: {
      id: '1',
      name: 'Portal 1',
      display_name: 'Portal 1 Display',
      description: 'Test Portal 1',
      canonical_domain: 'portal1.example.com',
    },
  },
  {
    label: 'Portal 2 Display',
    description: 'Test Portal 2',
    detail: 'portal2.example.com',
    portal: {
      id: '2',
      name: 'Portal 2',
      display_name: 'Portal 2 Display',
      description: 'Test Portal 2',
      canonical_domain: 'portal2.example.com',
    },
  },
]
