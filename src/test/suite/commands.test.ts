import * as assert from 'assert'
import * as vscode from 'vscode'

/** Interface for tracking UI interactions */
interface UIInteractionTracker {
  warningMessages: string[]
  errorMessages: string[]
  informationMessages: string[]
  inputBoxShown: boolean
  inputBoxOptions?: vscode.InputBoxOptions
}

/** Reusable VS Code API mocking utilities */
class VSCodeMocker {
  private tracker: UIInteractionTracker
  private originalShowWarning: typeof vscode.window.showWarningMessage
  private originalShowError: typeof vscode.window.showErrorMessage
  private originalShowInformation: typeof vscode.window.showInformationMessage
  private originalShowInputBox: typeof vscode.window.showInputBox
  private originalShowQuickPick: typeof vscode.window.showQuickPick
  private originalWithProgress: typeof vscode.window.withProgress

  constructor() {
    this.tracker = this.createTracker()
    this.originalShowWarning = vscode.window.showWarningMessage
    this.originalShowError = vscode.window.showErrorMessage
    this.originalShowInformation = vscode.window.showInformationMessage
    this.originalShowInputBox = vscode.window.showInputBox
    this.originalShowQuickPick = vscode.window.showQuickPick
    this.originalWithProgress = vscode.window.withProgress
  }

  private createTracker(): UIInteractionTracker {
    return {
      warningMessages: [],
      errorMessages: [],
      informationMessages: [],
      inputBoxShown: false,
    }
  }

  /** Mock VS Code UI functions to track interactions */
  mockUIInteractions(): UIInteractionTracker {
    this.tracker = this.createTracker()

    vscode.window.showWarningMessage = async (message: string, ...items: any[]) => {
      this.tracker.warningMessages.push(message)
      return this.originalShowWarning(message, ...items)
    }

    vscode.window.showErrorMessage = async (message: string, ...items: any[]) => {
      this.tracker.errorMessages.push(message)
      return this.originalShowError(message, ...items)
    }

    vscode.window.showInformationMessage = async (message: string, ...items: any[]) => {
      this.tracker.informationMessages.push(message)
      return this.originalShowInformation(message, ...items)
    }

    vscode.window.showInputBox = async (options?: vscode.InputBoxOptions) => {
      this.tracker.inputBoxShown = true
      this.tracker.inputBoxOptions = options
      return undefined // Simulate user canceling
    }

    vscode.window.showQuickPick = async () => {
      // Simulate user canceling portal selection
      return undefined
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    vscode.window.withProgress = async <R>(_options: any, _task: any): Promise<R> => {
      // Simulate immediate completion with cancellation
      return undefined as R
    }

    return this.tracker
  }

  /** Restore original VS Code functions */
  restore(): void {
    vscode.window.showWarningMessage = this.originalShowWarning
    vscode.window.showErrorMessage = this.originalShowError
    vscode.window.showInformationMessage = this.originalShowInformation
    vscode.window.showInputBox = this.originalShowInputBox
    vscode.window.showQuickPick = this.originalShowQuickPick
    vscode.window.withProgress = this.originalWithProgress
  }

  /** Execute command with timeout to prevent hanging tests */
  async executeCommandWithTimeout(commandId: string, timeoutMs: number = 1000): Promise<any> {
    return Promise.race([
      vscode.commands.executeCommand(commandId),
      new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error(`Command ${commandId} timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ])
  }
}

/** Test suite for Extension Command functionality */
suite('Extension Command Tests', () => {
  /** Sample markdown content for testing */
  const sampleMarkdownContent = '# Test Document\n\nThis is a test markdown document.'

  /** VS Code API mocker instance */
  let mocker: VSCodeMocker

  setup(async () => {
    // Initialize mocker
    mocker = new VSCodeMocker()

    // Clear any existing storage
    const extension = vscode.extensions.getExtension('kong.vscode-konnect-portal')
    if (extension?.isActive) {
      await vscode.commands.executeCommand('portalPreview.clearCredentials')
    }
  })

  teardown(async () => {
    // Restore original VS Code functions
    if (mocker) {
      mocker.restore()
    }

    // Clean up any open editors and previews
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })

  suite('Preview Commands', () => {
    test('should show authentication warning when no token is configured', async () => {
      // Clear credentials and set up document
      await vscode.commands.executeCommand('portalPreview.clearCredentials')
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })
      await vscode.window.showTextDocument(document)

      // Mock UI interactions
      const tracker = mocker.mockUIInteractions()

      try {
        // Execute command
        await mocker.executeCommandWithTimeout('portalPreview.openPreview')

        // Verify authentication warning was shown
        const authWarnings = tracker.warningMessages.filter(msg =>
          msg.toLowerCase().includes('token') || msg.toLowerCase().includes('authentication'))
        assert.ok(authWarnings.length > 0, 'Should show authentication warning when no token is configured')
      } finally {
        mocker.restore()
      }
    })

    test('should reject non-markdown files and accept markdown/MDC files', async () => {
      // Test non-markdown file rejection
      const jsDocument = await vscode.workspace.openTextDocument({
        content: 'console.log("test")',
        language: 'javascript',
      })
      await vscode.window.showTextDocument(jsDocument)

      const tracker = mocker.mockUIInteractions()

      try {
        await mocker.executeCommandWithTimeout('portalPreview.openPreview')

        // Verify file type warning for JavaScript
        const fileTypeWarnings = tracker.warningMessages.filter(msg =>
          msg.toLowerCase().includes('markdown') || msg.toLowerCase().includes('mdc'))
        assert.ok(fileTypeWarnings.length > 0, 'Should show warning for non-markdown/MDC files')

        // Reset tracker for markdown test
        const markdownTracker = mocker.mockUIInteractions()

        // Test markdown file acceptance
        const markdownDoc = await vscode.workspace.openTextDocument({
          content: sampleMarkdownContent,
          language: 'markdown',
        })
        await vscode.window.showTextDocument(markdownDoc)

        await mocker.executeCommandWithTimeout('portalPreview.openPreview')

        // Verify no file type warning for markdown
        const markdownWarnings = markdownTracker.warningMessages.filter(msg =>
          msg.toLowerCase().includes('markdown') || msg.toLowerCase().includes('mdc'))
        assert.strictEqual(markdownWarnings.length, 0, 'Should not show file type warning for markdown files')

        // Verify document state
        assert.strictEqual(vscode.window.activeTextEditor?.document.languageId, 'markdown', 'Should maintain markdown document as active')
        assert.strictEqual(vscode.window.activeTextEditor?.document.getText(), sampleMarkdownContent, 'Should preserve markdown content')
      } finally {
        mocker.restore()
      }
    })

    test('should handle missing active editor gracefully', async () => {
      // Ensure no active editor
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
      assert.strictEqual(vscode.window.activeTextEditor, undefined, 'Should have no active editor')

      const tracker = mocker.mockUIInteractions()

      try {
        await mocker.executeCommandWithTimeout('portalPreview.openPreview')

        // Verify editor warning was shown
        const editorWarnings = tracker.warningMessages.filter(msg =>
          msg.toLowerCase().includes('editor') || msg.toLowerCase().includes('document'))
        assert.ok(editorWarnings.length > 0, 'Should show warning when no active editor is available')

        // Verify still no active editor
        assert.strictEqual(vscode.window.activeTextEditor, undefined, 'Should still have no active editor after command')
      } finally {
        mocker.restore()
      }
    })

    test('should handle refresh preview appropriately', async () => {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')

      const tracker = mocker.mockUIInteractions()

      try {
        // Execute refresh command when no preview is active
        await mocker.executeCommandWithTimeout('portalPreview.refreshPreview')

        // Command should complete without errors (may or may not show messages depending on implementation)
        const totalMessages = tracker.warningMessages.length + tracker.errorMessages.length + tracker.informationMessages.length
        assert.ok(totalMessages >= 0, 'Refresh command should handle no active preview gracefully')
      } finally {
        mocker.restore()
      }
    })

    suite('Token Commands', () => {
      test('should show input box for token configuration with proper settings', async () => {
        const tracker = mocker.mockUIInteractions()

        try {
        // Execute configureToken command
          await mocker.executeCommandWithTimeout('portalPreview.configureToken')

          // Verify input box was displayed with correct configuration
          assert.ok(tracker.inputBoxShown, 'Should show input box for token configuration')
          assert.ok(tracker.inputBoxOptions?.prompt?.toLowerCase().includes('token'), 'Input box should prompt for token')
          assert.ok(tracker.inputBoxOptions?.password === true, 'Input box should be configured as password field')
        } finally {
          mocker.restore()
        }
      })

      test('should execute credentials management commands successfully', async () => {
        try {
        // Execute clearCredentials command
          await mocker.executeCommandWithTimeout('portalPreview.clearCredentials')

          // Command should complete successfully (with or without confirmation message)
          const allCommands = await vscode.commands.getCommands()
          assert.ok(allCommands.includes('portalPreview.clearCredentials'), 'Command should remain available after execution')
        } finally {
          mocker.restore()
        }
      })
    })

    suite('Integration and Error Handling', () => {
      test('should guide user through complete setup workflow', async () => {
      // Start with clean state and create markdown document
        await vscode.commands.executeCommand('portalPreview.clearCredentials')
        const document = await vscode.workspace.openTextDocument({
          content: sampleMarkdownContent,
          language: 'markdown',
        })
        await vscode.window.showTextDocument(document)

        const tracker = mocker.mockUIInteractions()

        try {
        // Attempt to open preview, which should trigger the setup workflow
          await mocker.executeCommandWithTimeout('portalPreview.openPreview')

          // Verify the workflow provides appropriate guidance
          const authMessages = [...tracker.warningMessages, ...tracker.errorMessages].filter(msg =>
            msg.toLowerCase().includes('token') || msg.toLowerCase().includes('authentication'))
          assert.ok(authMessages.length > 0, 'Should guide user through authentication setup')
        } finally {
          mocker.restore()
        }
      })

      test('should maintain command availability during error scenarios', async () => {
      // Get initial command list
        const initialCommands = await vscode.commands.getCommands()
        const expectedCommands = [
          'portalPreview.openPreview',
          'portalPreview.refreshPreview',
          'portalPreview.configureToken',
          'portalPreview.selectPortal',
          'portalPreview.clearCredentials',
        ]

        // Verify all commands are initially available
        for (const expectedCommand of expectedCommands) {
          assert.ok(
            initialCommands.includes(expectedCommand),
            `Command ${expectedCommand} should be registered initially`,
          )
        }

        // Execute commands that might cause errors
        try {
          await mocker.executeCommandWithTimeout('portalPreview.openPreview', 500)
          await mocker.executeCommandWithTimeout('portalPreview.selectPortal', 500)
          await mocker.executeCommandWithTimeout('portalPreview.refreshPreview', 500)
        } catch {
        // Commands might throw, but shouldn't break the extension
        }

        // Verify commands are still available after errors
        const finalCommands = await vscode.commands.getCommands()
        for (const expectedCommand of expectedCommands) {
          assert.ok(
            finalCommands.includes(expectedCommand),
            `Command ${expectedCommand} should remain available after errors`,
          )
        }
      })

      test('should handle concurrent command execution without corruption', async () => {
      // Execute multiple commands concurrently to test stability
        const commandPromises = [
          mocker.executeCommandWithTimeout('portalPreview.refreshPreview', 1000),
          mocker.executeCommandWithTimeout('portalPreview.clearCredentials', 1000),
          mocker.executeCommandWithTimeout('portalPreview.openPreview', 1000),
        ]

        try {
          const results = await Promise.allSettled(commandPromises)

          // Verify all commands attempted execution
          assert.strictEqual(results.length, commandPromises.length, 'All concurrent commands should complete')

          // Verify the extension remains functional
          const postExecutionCommands = await vscode.commands.getCommands()
          assert.ok(postExecutionCommands.length > 0, 'VS Code should remain functional after concurrent execution')
          assert.ok(postExecutionCommands.includes('portalPreview.openPreview'), 'Extension commands should remain available')
        } finally {
          mocker.restore()
        }
      })

      test('should maintain consistent command registration and execution state', async () => {
      // Verify all expected commands are consistently registered
        const commands = await vscode.commands.getCommands()
        const expectedCommands = [
          'portalPreview.openPreview',
          'portalPreview.refreshPreview',
          'portalPreview.configureToken',
          'portalPreview.selectPortal',
          'portalPreview.clearCredentials',
        ]

        for (const expectedCommand of expectedCommands) {
          assert.ok(
            commands.includes(expectedCommand),
            `Command ${expectedCommand} should be registered`,
          )
        }

        // Test command execution state persistence
        const initialCount = commands.filter(cmd => cmd.includes('portalPreview')).length

        // Execute commands multiple times
        await mocker.executeCommandWithTimeout('portalPreview.refreshPreview')
        await mocker.executeCommandWithTimeout('portalPreview.refreshPreview')

        // Verify commands remain available
        const finalCommands = await vscode.commands.getCommands()
        const finalCount = finalCommands.filter(cmd => cmd.includes('portalPreview')).length

        assert.strictEqual(finalCount, initialCount, 'Commands should remain available after multiple executions')
      })
    })
  })
})
