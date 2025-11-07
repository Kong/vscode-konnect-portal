import * as vscode from 'vscode'
import { checkKongctlAvailable, getKongctlConfig, getKongctlDiagnostics, executeKongctl } from './index'
import { KongctlInstallActions } from '../types/ui-actions'

/**
 * Format kongctl version JSON output for display
 * @param jsonOutput - Raw JSON output from kongctl version --full --output json
 * @returns Formatted version string for display
 */
function formatKongctlVersion(jsonOutput: string): string {
  try {
    const versionData = JSON.parse(jsonOutput)
    const version = versionData.version || 'Version: Unknown'
    const commit = versionData.commit ? versionData.commit.substring(0, 8) : 'Unknown'
    const date = versionData.date ? new Date(versionData.date).toLocaleDateString() : 'Unknown'

    return `Version: ${version}\nCommit: ${commit}\nBuild Date: ${date}`
  } catch {
    // If JSON parsing fails, return the raw output
    return jsonOutput
  }
}

/**
 * Show detailed diagnostic information about kongctl availability
 */
export async function showKongctlDiagnostics(): Promise<void> {
  try {
    const diagnostics = await getKongctlDiagnostics()
    const isAvailable = await checkKongctlAvailable()

    let versionInfo = 'Version: Unknown'
    let executionError = 'None'

    // Always try to execute to get detailed error info
    const versionResult = await executeKongctl(['version', '--full', '--output', 'json'], {})
    if (versionResult.success) {
      versionInfo = formatKongctlVersion(versionResult.stdout)
    } else {
      executionError = `\nExit code: ${versionResult.exitCode} \nError: ${versionResult.stderr}`
    }

    const diagnosticMessage = `
• Status: ${isAvailable ? 'Available' : 'Not Available'}
• Configured Path: '${diagnostics.configuredPath || 'kongctl'}'
${diagnostics.foundInPath ? `• Found in PATH: '${diagnostics.foundInPath}'` : '• Could not determine if kongctl is installed'}
• ${versionInfo}
${executionError ? `• Execution Error: ${executionError}` : '• No errors'}
`.trim()

    await vscode.window.showInformationMessage(
      'kongctl',
      { modal: true, detail: diagnosticMessage },
      'OK',
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    vscode.window.showErrorMessage(`Failed to get kongctl diagnostics: ${errorMessage}`)
  }
}

/**
 * Show feedback to user when kongctl is not found at configured path
 * Provides options to configure path or learn more about installation
 */
export async function showKongctlNotFoundAtPathDialog(configuredPath: string): Promise<void> {
  // Check if user has actually configured a custom path vs using default
  const config = vscode.workspace.getConfiguration('kong.konnect.kongctl')
  const userConfiguredPath = config.get<string>('path', '')

  let message: string
  if (userConfiguredPath && userConfiguredPath.trim() !== '') {
    // User has explicitly configured a path
    message = `kongctl not found at configured path: ${configuredPath}. Please check your configuration or install kongctl.`
  } else {
    // User is using default PATH lookup
    message = 'kongctl not found in your PATH. Please check your configuration or install kongctl.'
  }

  const result = await vscode.window.showErrorMessage(
    message,
    KongctlInstallActions.CONFIGURE_PATH,
    KongctlInstallActions.LEARN_MORE,
  )

  switch (result) {
    case KongctlInstallActions.CONFIGURE_PATH:
      await vscode.commands.executeCommand('workbench.action.openSettings', 'kong.konnect.kongctl.path')
      break
    case KongctlInstallActions.LEARN_MORE:
      await vscode.env.openExternal(vscode.Uri.parse('https://github.com/Kong/kongctl'))
      break
  }
}

/**
 * Show feedback to user when kongctl is not available
 * Provides options to learn more about installation or configure path
 */
export async function showKongctlNotAvailableDialog(): Promise<void> {
  const result = await vscode.window.showWarningMessage(
    'kongctl CLI is not available. You can install it to enable additional Kong Konnect features.',
    KongctlInstallActions.LEARN_MORE,
    KongctlInstallActions.CONFIGURE_PATH,
  )

  switch (result) {
    case KongctlInstallActions.LEARN_MORE:
      await vscode.env.openExternal(vscode.Uri.parse('https://github.com/Kong/kongctl#installation'))
      break
    case KongctlInstallActions.CONFIGURE_PATH:
      await vscode.commands.executeCommand('workbench.action.openSettings', 'kong.konnect.kongctl.path')
      break
  }
}

/**
 * Check kongctl availability and show appropriate feedback
 * @returns Promise resolving to true if kongctl is available
 */
export async function checkAndNotifyKongctlAvailability(): Promise<boolean> {
  const isAvailable = await checkKongctlAvailable()

  if (!isAvailable) {
    const config = getKongctlConfig()
    // Show the appropriate dialog based on configuration
    await showKongctlNotFoundAtPathDialog(config.path)
  }

  return isAvailable
}

/**
 * Show success message when kongctl is detected, including version information
 */
export async function showKongctlAvailableMessage(): Promise<void> {
  try {
    const versionResult = await executeKongctl(['version', '--full', '--output', 'json'], {})
    const versionInfo = versionResult.success ? formatKongctlVersion(versionResult.stdout) : 'Version unknown'

    vscode.window.showInformationMessage(
      'kongctl: The Kong Konnect CLI',
      { modal: true, detail: versionInfo },
      'OK',
    )
  } catch {
    // Fallback to simple message if version check fails
    vscode.window.showInformationMessage(
      'kongctl: The Kong Konnect CLI',
    )
  }
}
