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
    const version = versionData.version || 'Unknown'
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

    let versionInfo = 'Unknown'
    let executionError = 'None'

    // Always try to execute to get detailed error info
    const versionResult = await executeKongctl(['version', '--full', '--output', 'json'])
    if (versionResult.success) {
      versionInfo = formatKongctlVersion(versionResult.stdout)
    } else {
      executionError = `Exit code: ${versionResult.exitCode}, Error: ${versionResult.stderr}`
    }

    const diagnosticMessage = `
kongctl Diagnostics:
• Status: ${isAvailable ? '✅ Available' : '❌ Not Available'}
• Configured Path: ${diagnostics.configuredPath}
• Found in PATH: ${diagnostics.foundInPath || 'Not found'}
• File Stats: ${diagnostics.fileStats ? `Exists: ${diagnostics.fileStats.exists}, Size: ${diagnostics.fileStats.size} bytes` : 'N/A'}
• Version: ${versionInfo}
• Execution Error: ${executionError}
• PATH Environment: ${diagnostics.pathEnv.substring(0, 200)}${diagnostics.pathEnv.length > 200 ? '...' : ''}
• PATH Directories (${diagnostics.pathDirectories.length} total):
${diagnostics.pathDirectories.slice(0, 10).map(dir => `  - ${dir}`).join('\n')}${diagnostics.pathDirectories.length > 10 ? '\n  ...' : ''}
`.trim()

    await vscode.window.showInformationMessage(
      'kongctl Diagnostics',
      { modal: true, detail: diagnosticMessage },
      'OK',
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    vscode.window.showErrorMessage(`Failed to get kongctl diagnostics: ${errorMessage}`)
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

    if (config.path !== 'kongctl') {
      // User has configured a custom path but it's not working
      vscode.window.showErrorMessage(
        `kongctl not found at configured path: ${config.path}. Please check your configuration.`,
      )
    } else {
      // kongctl not found in PATH
      await showKongctlNotAvailableDialog()
    }
  }

  return isAvailable
}

/**
 * Show success message when kongctl is detected, including version information
 */
export async function showKongctlAvailableMessage(): Promise<void> {
  const config = getKongctlConfig()
  const pathInfo = config.path === 'kongctl' ? 'from PATH' : `at ${config.path}`

  try {
    const versionResult = await executeKongctl(['version', '--full', '--output', 'json'])
    const versionInfo = versionResult.success ? formatKongctlVersion(versionResult.stdout) : 'Version unknown'

    vscode.window.showInformationMessage(
      `kongctl CLI detected ${pathInfo}. Kong Konnect CLI features are now available.`,
      { modal: true, detail: `Version Information:\n${versionInfo}` },
      'OK',
    )
  } catch {
    // Fallback to simple message if version check fails
    vscode.window.showInformationMessage(
      `kongctl CLI detected ${pathInfo}. Kong Konnect CLI features are now available.`,
    )
  }
}
