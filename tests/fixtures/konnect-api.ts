/**
 * Test fixtures for Konnect API tests
 */

import type { KonnectPortal, KonnectPortalsResponse } from '../../src/types/konnect'

/**
 * Mock portal data for testing
 */
export const mockPortal1: KonnectPortal = {
  id: '1',
  name: 'Portal 1',
  display_name: 'Portal 1 Display',
  description: 'Test Portal 1',
  default_domain: 'portal1.example.com',
  canonical_domain: 'portal1.example.com',
  authentication_enabled: true,
  rbac_enabled: false,
  auto_approve_developers: false,
  auto_approve_applications: false,
  default_api_visibility: 'public',
  default_page_visibility: 'public',
  default_application_auth_strategy_id: null,
  labels: {},
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

export const mockPortal2: KonnectPortal = {
  id: '2',
  name: 'Portal 2',
  display_name: 'Portal 2 Display',
  description: 'Test Portal 2',
  default_domain: 'portal2.example.com',
  canonical_domain: 'portal2.example.com',
  authentication_enabled: true,
  rbac_enabled: false,
  auto_approve_developers: false,
  auto_approve_applications: false,
  default_api_visibility: 'public',
  default_page_visibility: 'public',
  default_application_auth_strategy_id: null,
  labels: {},
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

/**
 * Array of mock portals for testing
 */
export const mockPortals: KonnectPortal[] = [mockPortal1, mockPortal2]

/**
 * Single page response with both portals
 */
export const mockSinglePageResponse: KonnectPortalsResponse = {
  data: mockPortals,
  meta: {
    page: {
      total: 2,
      size: 10,
      number: 1,
    },
  },
}

/**
 * First page of paginated response
 */
export const mockPaginatedPage1Response: KonnectPortalsResponse = {
  data: [mockPortal1],
  meta: {
    page: {
      total: 2,
      size: 1,
      number: 1,
      next: 'https://us.api.konghq.com/v3/portals?page=2',
    },
  },
}

/**
 * Second page of paginated response
 */
export const mockPaginatedPage2Response: KonnectPortalsResponse = {
  data: [mockPortal2],
  meta: {
    page: {
      total: 2,
      size: 1,
      number: 2,
    },
  },
}

/**
 * Empty response for timeout tests
 */
export const mockEmptyResponse: KonnectPortalsResponse = {
  data: [],
  meta: {
    page: {
      total: 0,
      size: 10,
      number: 1,
    },
  },
}

/**
 * Test tokens for API testing
 */
export const testTokens = {
  valid: 'kpat_test_token_123456789',
  validLong: 'kpat_1234567890abcdefghijk',
  invalidPrefix: 'token_1234567890abcdefghijk',
  short: 'kpat_short',
  withWhitespace: '  kpat_1234567890abcdefghijk  ',
  empty: '',
  whitespaceOnly: '   ',
}

/**
 * Mock headers for error responses
 */
export const mockErrorHeaders = {
  withTraceId: new Map([['x-datadog-trace-id', 'trace-123']]),
  empty: new Map(),
}

/**
 * Error response payloads
 */
export const mockErrorResponses = {
  customMessage: {
    message: 'Custom error message',
  },
  empty: {},
}
