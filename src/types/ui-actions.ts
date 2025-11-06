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
  CANCEL = 'Cancel',
}

/**
 * Actions for credential clearing confirmation
 */
export enum CredentialActions {
  DELETE_TOKEN = 'Delete Access Token',
  CANCEL = 'Cancel',
}

/**
 * Actions for MDC extension recommendation
 */
export enum MDCExtensionActions {
  INSTALL_EXTENSION = 'Install MDC Extension',
  DONT_SHOW_AGAIN = "Don't Show Again",
  CANCEL = 'Cancel',
}

/**
 * Actions for token update prompts
 */
export enum TokenUpdateActions {
  UPDATE_TOKEN = 'Update Token',
  SELECT_PORTAL = 'Select Portal',
  LATER = 'Later',
}

/**
 * Generic confirmation actions
 */
export enum ConfirmationActions {
  YES = 'Yes',
  NO = 'No',
  OK = 'OK',
  CANCEL = 'Cancel',
}

/**
 * Actions for portal setup prompts in preview provider
 */
export enum PortalSetupActions {
  CONFIGURE_TOKEN = 'Configure Konnect Personal Access Token (PAT)',
  SELECT_PORTAL = 'Select Portal',
  CANCEL = 'Cancel',
}

/**
 * Actions for webview timeout warnings
 */
export enum WebviewTimeoutActions {
  OPEN_SETTINGS = 'Open Settings',
  REFRESH_PREVIEW = 'Refresh Portal Preview',
  CANCEL = 'Cancel',
}

/**
 * Actions for kongctl installation prompts
 */
export enum KongctlInstallActions {
  LEARN_MORE = 'Learn More',
  CONFIGURE_PATH = 'Configure Path',
}
