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
}

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
}
