/**
 * Standardized UI action constants for VS Code message dialogs
 *
 * These enums ensure type safety and consistency when showing message dialogs
 * with conditional logic based on user selections.
 *
 * Usage:
 * - Use enum values as button text in showInformationMessage, showWarningMessage, etc.
 * - Use same enum values in conditional logic to avoid string mismatches
 * - Add new enums for each distinct set of dialog actions
 */

/**
 * Actions for portal selection prompts after token configuration
 */
export enum PortalSelectionActions {
  SELECT_PORTAL = 'Select Portal',
  LATER = 'Later',
}

/**
 * Actions for token configuration prompts
 */
export enum TokenConfigurationActions {
  CONFIGURE_TOKEN = 'Configure Konnect Personal Access Token (PAT)',
  LEARN_MORE = 'Learn more',
}

/**
 * Actions for credential clearing confirmation
 */
export enum CredentialActions {
  DELETE_TOKEN = 'Delete Access Token',
}

/**
 * Actions for MDC extension recommendation
 */
export enum MDCExtensionActions {
  INSTALL_EXTENSION = 'Install MDC Extension',
  DONT_SHOW_AGAIN = "Don't Show Again",
}



/**
 * Actions for webview timeout warnings
 */
export enum WebviewTimeoutActions {
  OPEN_SETTINGS = 'Open Settings',
  REFRESH_PREVIEW = 'Refresh Portal Preview',
}

/**
 * Actions for kongctl installation prompts
 */
export enum KongctlInstallActions {
  VIEW_INSTALL_INSTRUCTIONS = 'View Install Instructions',
  INSTALLATION_INSTRUCTIONS = 'Installation Instructions',
  CHECK_STATUS_NOW = 'Check Status Now',
  LEARN_MORE = 'Learn More',
  CONFIGURE_PATH = 'Configure Path',
}
