import * as vscode from 'vscode'
import type { ApiErrorInfo } from '../types'
import { ApiError } from '../konnect/api'
import { copyDebugInfoToClipboard } from './debug-info'

/**
 * Shows an error message with an optional copy button for trace IDs
 * @param prefix Error message prefix (e.g., "Failed to load portals")
 * @param error The error that occurred
 * @param context VS Code extension context (optional, for version info)
 */
export async function showApiError(prefix: string, error: unknown, context?: vscode.ExtensionContext): Promise<void> {
  let errorInfo: ApiErrorInfo

  if (error instanceof ApiError) {
    errorInfo = error.toErrorInfo()
  } else if (error instanceof Error) {
    errorInfo = { message: error.message }
  } else {
    errorInfo = { message: 'Unknown error occurred' }
  }

  const fullMessage = `${prefix}: ${errorInfo.message}`

  // For API errors, show context-specific actions
  if (error instanceof ApiError) {
    const actions = []

    // For 401 errors, prioritize token update action
    if (errorInfo.statusCode === 401) {
      actions.push('Update Token')
    }

    // Always provide copy debug info option for API errors
    actions.push('Copy Debug Info')

    const selection = await vscode.window.showErrorMessage(
      fullMessage,
      ...actions,
    )

    if (selection === 'Update Token') {
      // Trigger the configure token command
      await vscode.commands.executeCommand('portalPreview.configureToken')
    } else if (selection === 'Copy Debug Info') {
      await copyDebugInfoToClipboard(
        errorInfo.message,
        context,
        {
          status_code: errorInfo.statusCode,
          trace_id: errorInfo.traceId || undefined,
        },
      )
    }
  } else {
    // For non-API errors, show regular error message
    vscode.window.showErrorMessage(fullMessage)
  }
}
