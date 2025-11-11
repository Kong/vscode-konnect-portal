import * as vscode from 'vscode'
import { checkKongctlAvailable } from './status'
import { updateKongctlContext, getOrCreateKongctlTerminal } from '../extension'
import { KongctlInstallActions } from '../types/ui-actions'

/**
 * Attempts to install kongctl using brew if available, otherwise guides user to manual installation.
 * Shows success or error messages with appropriate actions.
 */
export async function installKongctlWithFeedback(context?: vscode.ExtensionContext) {
  // Check if we can use brew for automatic installation (macOS with brew installed)
  if (process.platform === 'darwin') {
    // Check if brew is available
    const brewAvailable = await checkHomebrewStatus()
    if (brewAvailable) {
      await installWithHomebrew(context)

      // Check if kongctl became available after user interaction
      await checkInstallationStatus(context)
      return
    }
  }

  // For all other cases (Linux, Windows, or macOS without brew), show manual installation instructions
  const result = await vscode.window.showInformationMessage(
    'Automatic installation is not available for your system. Please install kongctl manually.',
    KongctlInstallActions.VIEW_INSTALL_INSTRUCTIONS,
  )

  if (result === KongctlInstallActions.VIEW_INSTALL_INSTRUCTIONS) {
    vscode.env.openExternal(vscode.Uri.parse('https://github.com/Kong/kongctl?tab=readme-ov-file#installation'))
  }
}

/**
 * Check if homebrew is available on the system
 */
async function checkHomebrewStatus(): Promise<boolean> {
  try {
    const { exec } = await import('child_process')
    return new Promise((resolve) => {
      exec('which brew', (error) => {
        resolve(!error)
      })
    })
  } catch {
    return false
  }
}

/**
 * Install kongctl using brew
 */
async function installWithHomebrew(context?: vscode.ExtensionContext) {
  // Get or create the shared kongctl terminal to show the command execution
  const kongctlTerminal = getOrCreateKongctlTerminal()
  kongctlTerminal.show(true)

  // Show immediate feedback
  vscode.window.showInformationMessage('Installing kongctl with brew...')

  // Create a promise that resolves when the terminal process completes
  const processCompletion = new Promise<number>((resolve) => {
    // Listen for terminal process end events
    const processEndListener = vscode.window.onDidEndTerminalShellExecution((event) => {
      if (event.terminal === kongctlTerminal) {
        processEndListener.dispose()
        resolve(event.exitCode ?? -1)
      }
    })

    // Also listen for terminal close as a fallback
    const terminalCloseListener = vscode.window.onDidCloseTerminal((closedTerminal) => {
      if (closedTerminal === kongctlTerminal) {
        terminalCloseListener.dispose()
        processEndListener.dispose()
        resolve(closedTerminal.exitStatus?.code ?? -1)
      }
    })
  })

  // Send the brew install command to the terminal
  const installCommand = 'brew install --cask kong/kongctl/kongctl'
  kongctlTerminal.sendText(installCommand, true)

  // Await the process completion
  const exitCode = await processCompletion

  // Show appropriate message based on exit code
  if (exitCode === 0) {
    vscode.window.showInformationMessage('Installation command completed successfully. Checking kongctl status...')
  } else {
    vscode.window.showWarningMessage(`Installation command completed with exit code ${exitCode}. Checking if kongctl is available...`)
  }

  // Always check installation status after command completes
  await checkInstallationStatus(context)
}

/**
 * Check if kongctl installation was successful and show appropriate feedback
 */
async function checkInstallationStatus(context?: vscode.ExtensionContext) {
  const available = await checkKongctlAvailable()

  // Update the VS Code context to show/hide commands based on availability
  await updateKongctlContext()

  if (available) {
    vscode.window.showInformationMessage('kongctl was installed successfully! The CLI commands are now available.')
  } else {
    const result = await vscode.window.showErrorMessage(
      'kongctl does not appear to be installed or available in your PATH. If the installation is still in progress, you can check status later using the "Check Status" command.',
      KongctlInstallActions.INSTALLATION_INSTRUCTIONS,
      KongctlInstallActions.CHECK_STATUS_NOW,
    )
    if (result === KongctlInstallActions.INSTALLATION_INSTRUCTIONS) {
      vscode.env.openExternal(vscode.Uri.parse('https://github.com/Kong/kongctl?tab=readme-ov-file#installation'))
    } else if (result === KongctlInstallActions.CHECK_STATUS_NOW) {
      // Trigger another status check
      await checkInstallationStatus(context)
    }
  }
}
