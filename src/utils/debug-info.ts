import * as vscode from 'vscode'

/** Standard debug information structure for the extension */
interface StandardDebugInfo {
  /** Error or event message */
  message: string
  /** Extension name from package.json */
  extension_name: string
  /** Extension version from package.json */
  version: string
  /** UTC timestamp in ISO format */
  timestamp: string
  /** Additional context-specific data */
  [key: string]: unknown
}

/**
 * Creates standardized debug information for the extension
 * @param message The main message or error description
 * @param context VS Code extension context for package info
 * @param additionalData Optional additional debug data
 * @returns Standardized debug info object
 */
export function createDebugInfo(
  message: string,
  context?: vscode.ExtensionContext,
  additionalData?: Record<string, unknown>,
): StandardDebugInfo {
  const baseInfo: StandardDebugInfo = {
    message,
    extension_name: context?.extension?.packageJSON?.name || 'unknown',
    version: context?.extension?.packageJSON?.version || 'unknown',
    timestamp: new Date().toISOString(),
  }

  // Merge additional data if provided
  if (additionalData) {
    return { ...baseInfo, ...additionalData }
  }

  return baseInfo
}

/**
 * Creates debug info and formats it as JSON string for copying
 * @param message The main message or error description
 * @param context VS Code extension context for package info
 * @param additionalData Optional additional debug data
 * @returns Formatted debug info string
 */
export function createDebugInfoText(
  message: string,
  context?: vscode.ExtensionContext,
  additionalData?: Record<string, unknown>,
): string {
  const debugInfo = createDebugInfo(message, context, additionalData)
  return JSON.stringify(debugInfo, null, 2)
}

/**
 * Copies debug info to clipboard and shows confirmation
 * @param message The main message or error description
 * @param context VS Code extension context for package info
 * @param additionalData Optional additional debug data
 */
export async function copyDebugInfoToClipboard(
  message: string,
  context?: vscode.ExtensionContext,
  additionalData?: Record<string, unknown>,
): Promise<void> {
  try {
    const debugText = createDebugInfoText(message, context, additionalData)
    await vscode.env.clipboard.writeText(debugText)
    vscode.window.showInformationMessage('Debug information copied to clipboard')
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to copy debug information: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
