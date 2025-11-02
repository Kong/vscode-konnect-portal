/**
 * Centralized messages and assertions for the Konnect extension
 */

/**
 * API-related error messages
 */
export const API_ERROR_MESSAGES = {
  // Authentication errors
  INVALID_TOKEN: 'Invalid or expired Personal Access Token',
  ACCESS_DENIED: 'Access denied',

  // Client errors
  API_NOT_FOUND: 'API endpoint not found',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
  BAD_REQUEST: 'Bad Request',

  // Server errors
  SERVER_ERROR: 'Server error occurred',

  // Network errors
  REQUEST_TIMEOUT: 'Request timeout - please check your connection and try again',
  NETWORK_ERROR: 'Network error',
  UNKNOWN_ERROR: 'Unknown error occurred while fetching portals',

  // Custom messages (used in tests)
  CUSTOM_MESSAGE: 'Custom error message',
} as const

/**
 * Portal selection messages (errors, warnings, success)
 */
export const PORTAL_SELECTION_MESSAGES = {
  // Error messages
  NO_TOKEN: 'No Konnect token found. Please configure your Personal Access Token to continue.',
  LOAD_PORTALS_FAILED: 'Failed to load portals',

  // Warning messages
  NO_PORTALS_WARNING: 'No portals found in your Konnect account. Please create a portal first.',

  // Success messages
  PORTAL_SELECTED: (displayName: string, origin: string) => `Portal "${displayName}" selected. (${origin})`,

  // Progress messages
  LOADING_PORTALS: 'Loading portals from Konnect...',
  FETCHING_PORTAL_LIST: 'Fetching portal list...',
  PREPARING_PORTAL_SELECTION: 'Preparing portal selection...',
  READY_FOR_SELECTION: 'Ready for selection',

  // UI labels and placeholders
  PORTAL_SELECTION_PLACEHOLDER: 'Select a Dev Portal to preview',
  PORTAL_SELECTION_TITLE: 'Portal Selection',
} as const

/**
 * General VS Code context and utility messages
 */
export const VSCODE_MESSAGES = {
  CONTEXT_UPDATE_FAILED: 'Context update failed',
} as const

/**
 * API request configuration and validation messages
 */
export const API_VALIDATION_MESSAGES = {
  KPAT_PREFIX_REQUIRED: 'Token must start with kpat_',
  TOKEN_TOO_SHORT: 'Token is too short',
  TOKEN_INVALID_FORMAT: 'Invalid token format',
} as const

/**
 * File and content processing messages
 */
export const CONTENT_MESSAGES = {
  INVALID_FILE_PATH: 'Invalid file path',
  FILE_NOT_FOUND: 'File not found',
  UNSUPPORTED_FILE_TYPE: 'Unsupported file type',
} as const

/**
 * Test assertion constants
 */
export const TEST_ASSERTIONS = {
  // Progress increments for testing
  PROGRESS_INCREMENTS: {
    FETCH_START: 20,
    PREPARE_SELECTION: 60,
    READY: 20,
  },

  // Quick pick options
  QUICK_PICK_OPTIONS: {
    MATCH_ON_DESCRIPTION: true,
    MATCH_ON_DETAIL: true,
  },

  // Common test values
  MOCK_TIMER_ID: 123,
  DEFAULT_TIMEOUT: 10000,
} as const

/**
 * Error severity levels for testing and logging
 */
export const ERROR_SEVERITY = {
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const

/**
 * HTTP status codes for API testing
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const
