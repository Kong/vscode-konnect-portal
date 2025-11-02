import type * as vscode from 'vscode'

/** Log levels for the debug logging utility */
export enum LogLevel {
  LOG = 'log',
  WARN = 'warn',
  ERROR = 'error',
}

/** Structured error information for API errors with trace ID support */
export interface ApiErrorInfo {
  /** The main error message */
  message: string
  /** Datadog trace ID for debugging (x-datadog-trace-id header) */
  traceId?: string
  /** HTTP status code if applicable */
  statusCode?: number
}

/** Parameters for the debug logging utility function */
export interface LogParams {
  /** The log level/type (defaults to LOG) */
  type?: LogLevel
  /** Whether to always log regardless of debug setting (defaults to false) */
  force?: boolean
  /** The message to log */
  message: string
  /** Additional data to log */
  data?: unknown
}

/**
 * Configuration interface for the Portal Preview extension
 */
export interface PortalPreviewConfig {
  autoOpen: boolean
  updateDelay: number
  readyTimeout: number
  debug: boolean
  showMDCRecommendation: boolean
  pagesDirectory: string
  snippetsDirectory: string
}

/**
 * Base interface for all webview messages
 */
interface BaseWebviewMessage {
  type: string
}

/**
 * Message to update content in the webview
 */
export interface WebviewUpdateContentMessage extends BaseWebviewMessage {
  type: 'webview:update:content'
  content: string
  config: PortalPreviewConfig
  portalConfig: {
    origin: string
  }
  previewId: string
  path?: string
  snippetName?: string
}

/**
 * Message to update configuration in the webview
 */
export interface WebviewUpdateConfigMessage extends BaseWebviewMessage {
  type: 'webview:update:config'
  config: PortalPreviewConfig
}

/**
 * Message to show loading state in the webview
 */
export interface WebviewLoadingMessage extends BaseWebviewMessage {
  type: 'webview:loading'
  loading: boolean
}

/**
 * Message to refresh the webview
 */
export interface WebviewRefreshMessage extends BaseWebviewMessage {
  type: 'webview:refresh'
  content: string
  config: PortalPreviewConfig
  previewId: string
  path?: string
  snippetName?: string
}

/**
 * Message to navigate to a different page in the webview
 */
export interface WebviewNavigateMessage extends BaseWebviewMessage {
  type: 'webview:navigate'
  config: PortalPreviewConfig
  portalConfig: {
    origin: string
  }
  previewId: string
  path: string
}

/**
 * Message to report an error from the webview
 */
export interface WebviewErrorMessage extends BaseWebviewMessage {
  type: 'webview:error'
  error: string
  errorType?: 'timeout' | 'invalid-url' | 'load-failed' | 'general'
}

/**
 * Message to report a warning from the webview
 */
export interface WebviewWarningMessage extends BaseWebviewMessage {
  type: 'webview:warning'
  warning: string
  warningType?: 'timeout' | 'general'
}

/**
 * Message to request content from the extension
 */
export interface WebviewRequestContentMessage extends BaseWebviewMessage {
  type: 'webview:request:content'
}

/**
 * Discriminated union of all webview message types
 */
export type WebviewMessage =
  | WebviewUpdateContentMessage
  | WebviewUpdateConfigMessage
  | WebviewLoadingMessage
  | WebviewRefreshMessage
  | WebviewNavigateMessage
  | WebviewErrorMessage
  | WebviewWarningMessage
  | WebviewRequestContentMessage

/**
 * Preview panel state
 */
export interface PreviewPanelState {
  panel?: vscode.WebviewPanel
  isVisible: boolean
  currentDocument?: vscode.TextDocument
  lastContent?: string
}
