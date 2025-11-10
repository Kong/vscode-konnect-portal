import * as vscode from 'vscode'
import { createDebugInfoText } from '../utils/debug-info'
import { checkKongctlAvailable } from './status'
import { updateKongctlContext } from '../extension'



/**
 * Attempts to install kongctl using the recommended command for the user's platform.
 * Shows success or error messages with appropriate actions.
 */
export async function installKongctlWithFeedback(context?: vscode.ExtensionContext) {
  // Determine the install command based on platform
  let installCommand: string
  if (process.platform === 'darwin') {
    installCommand = 'brew install --cask kong/kongctl/kongctl'
  } else if (process.platform === 'linux') {
    installCommand = [
      '# Download the latest release from https://github.com/Kong/kongctl/releases',
      'curl -sL https://github.com/Kong/kongctl/releases/latest/download/kongctl_linux_amd64.zip -o kongctl_linux_amd64.zip',
      'unzip kongctl_linux_amd64.zip -d /tmp',
      'sudo cp /tmp/kongctl /usr/local/bin/',
      'rm kongctl_linux_amd64.zip',
    ].join(' && ')
  } else if (process.platform === 'win32') {
    installCommand = 'winget install Kong.kongctl'
  } else {
    vscode.window.showErrorMessage('Unsupported platform for automatic kongctl installation.')
    return
  }

  // Use or create the shared kongctl terminal to show the command execution
  const terminalName = 'kongctl'
  let kongctlTerminal: vscode.Terminal | undefined = undefined
  // Try to find an existing terminal named 'kongctl'
  for (const term of vscode.window.terminals) {
    if (term.name === terminalName) {
      kongctlTerminal = term
      break
    }
  }
  if (!kongctlTerminal) {
    kongctlTerminal = vscode.window.createTerminal({
      name: terminalName,
      shellPath: process.env.SHELL || undefined,
    })
  }
  kongctlTerminal.show(true)

  // Show immediate feedback
  vscode.window.showInformationMessage('Installing kongctl... Please wait for the command to complete.')

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

  // Send the command to the terminal
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
      'Installation Instructions',
      'Check Status Now',
      'Copy Debug Info',
    )
    if (result === 'Installation Instructions') {
      vscode.env.openExternal(vscode.Uri.parse('https://github.com/Kong/kongctl?tab=readme-ov-file#installation'))
    } else if (result === 'Check Status Now') {
      // Trigger another status check
      await checkInstallationStatus(context)
    } else if (result === 'Copy Debug Info') {
      const debugText = createDebugInfoText('kongctl install verification failed', context)
      await vscode.env.clipboard.writeText(debugText)
      vscode.window.showInformationMessage('Debug information copied to clipboard')
    }
  }
}
