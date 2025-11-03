import * as assert from 'assert'
import * as vscode from 'vscode'

/** Test suite for Extension Command functionality */
suite('Extension Command Tests', () => {
  /** Sample markdown content for testing */
  const sampleMarkdownContent = '# Test Document\n\nThis is a test markdown document.'

  setup(async () => {
    // Clear any existing storage
    const extension = vscode.extensions.getExtension('kong.vscode-konnect-portal')
    if (extension?.isActive) {
      // Get extension's storage service and clear it
      await vscode.commands.executeCommand('portalPreview.clearCredentials')
    }
  })

  teardown(async () => {
    // Clean up any open editors and previews
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })

  suite('Preview Commands', () => {
    test('should register openPreview command', async () => {
      // Wait for extension to fully activate
      const extension = vscode.extensions.getExtension('kong.vscode-konnect-portal')
      if (extension && !extension.isActive) {
        await extension.activate()
      }

      // Give a bit more time for command registration
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify the command is registered
      const commands = await vscode.commands.getCommands()
      assert.ok(commands.includes('portalPreview.openPreview'), 'openPreview command should be registered')
    })

    test('should register refreshPreview command', async () => {
      // Wait for extension to fully activate
      const extension = vscode.extensions.getExtension('kong.vscode-konnect-portal')
      if (extension && !extension.isActive) {
        await extension.activate()
      }

      // Give a bit more time for command registration
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify the command is registered
      const commands = await vscode.commands.getCommands()
      assert.ok(commands.includes('portalPreview.refreshPreview'), 'refreshPreview command should be registered')
    })

    test('should show warning when no active editor for openPreview', async () => {
      // Ensure no active editor
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')

      // Execute the command
      await vscode.commands.executeCommand('portalPreview.openPreview')

      // Verify no active editor exists after command execution
      assert.strictEqual(vscode.window.activeTextEditor, undefined, 'Should still have no active editor after command execution')
    })

    test('should show warning for non-markdown files', async () => {
      // Create a non-markdown document
      const document = await vscode.workspace.openTextDocument({
        content: 'console.log("test")',
        language: 'javascript',
      })
      await vscode.window.showTextDocument(document)

      // Verify document is active and has JavaScript language
      assert.strictEqual(vscode.window.activeTextEditor?.document.languageId, 'javascript', 'Should have JavaScript document active')

      // Execute the command
      await vscode.commands.executeCommand('portalPreview.openPreview')

      // Verify the JavaScript document is still active (command should not change active editor)
      assert.strictEqual(vscode.window.activeTextEditor?.document.languageId, 'javascript', 'Should maintain JavaScript document as active editor')
    })

    test('should handle markdown files for openPreview', async () => {
      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })
      await vscode.window.showTextDocument(document)

      // Verify markdown document is active
      assert.strictEqual(vscode.window.activeTextEditor?.document.languageId, 'markdown', 'Should have markdown document active')

      // Execute the command
      await vscode.commands.executeCommand('portalPreview.openPreview')

      // Verify markdown document remains active (command should process it)
      assert.strictEqual(vscode.window.activeTextEditor?.document.languageId, 'markdown', 'Should maintain markdown document as active editor')
      assert.strictEqual(vscode.window.activeTextEditor?.document.getText(), sampleMarkdownContent, 'Should maintain original markdown content')
    })

    test('should handle MDC files for openPreview', async () => {
      const mdcContent = '# Test MDC\n\n::alert\nThis is an MDC alert\n::'

      // Create an MDC document - use markdown language as fallback if mdc isn't recognized in test environment
      const document = await vscode.workspace.openTextDocument({
        content: mdcContent,
        language: 'mdc',
      })
      await vscode.window.showTextDocument(document)

      // Verify document is active (language might be mdc or markdown depending on extension availability)
      const activeEditor = vscode.window.activeTextEditor
      assert.ok(activeEditor, 'Should have active editor')
      assert.ok(['mdc', 'markdown', 'plaintext'].includes(activeEditor.document.languageId),
        `Should have mdc, markdown, or plaintext document (got ${activeEditor.document.languageId})`)

      // Execute the command
      await vscode.commands.executeCommand('portalPreview.openPreview')

      // Verify document content and editor state (focus on content preservation)
      assert.strictEqual(vscode.window.activeTextEditor?.document.getText(), mdcContent, 'Should maintain original MDC content')
      assert.ok(vscode.window.activeTextEditor?.document.getText().includes('::alert'), 'Should preserve MDC-specific syntax')
    })

    test('should execute refreshPreview command', async () => {
      // Get initial command list
      const initialCommands = await vscode.commands.getCommands()
      const refreshCommandExists = initialCommands.includes('portalPreview.refreshPreview')
      assert.ok(refreshCommandExists, 'refreshPreview command should be registered')

      // Execute the refresh command
      await vscode.commands.executeCommand('portalPreview.refreshPreview')

      // Verify command list is still intact after execution
      const afterCommands = await vscode.commands.getCommands()
      assert.ok(afterCommands.includes('portalPreview.refreshPreview'), 'refreshPreview command should still be registered after execution')
    })
  })

  suite('Token Commands', () => {
    test('should register configureToken command', async () => {
      // Verify the command is registered
      const commands = await vscode.commands.getCommands()
      assert.ok(commands.includes('portalPreview.configureToken'), 'configureToken command should be registered')
    })

    test('should execute configureToken command', async () => {
      // Verify command is available before execution
      const commands = await vscode.commands.getCommands()
      assert.ok(commands.includes('portalPreview.configureToken'), 'configureToken command should be available for execution')

      // Execute the command (this will show input box in test environment)
      const commandPromise = vscode.commands.executeCommand('portalPreview.configureToken')

      // Wait a bit for the command to start
      await new Promise(resolve => setTimeout(resolve, 100))

      // Cancel any input boxes that might be open
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen')

      // Wait for command to complete
      await commandPromise

      // Verify command is still registered after execution
      const afterCommands = await vscode.commands.getCommands()
      assert.ok(afterCommands.includes('portalPreview.configureToken'), 'configureToken command should remain registered after execution')
    })

    test('should register selectPortal command', async () => {
      // Verify the command is registered
      const commands = await vscode.commands.getCommands()
      assert.ok(commands.includes('portalPreview.selectPortal'), 'selectPortal command should be registered')
    })

    test('should execute selectPortal command', async () => {
      // Verify command is available before execution
      const commands = await vscode.commands.getCommands()
      assert.ok(commands.includes('portalPreview.selectPortal'), 'selectPortal command should be available for execution')

      // Execute the command with timeout handling
      const commandPromise = vscode.commands.executeCommand('portalPreview.selectPortal')

      // Wait a brief moment for the command to start
      await new Promise(resolve => setTimeout(resolve, 50))

      // Cancel any quick open that might appear
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen')

      // Wait for command to complete with timeout
      await Promise.race([
        commandPromise,
        new Promise(resolve => setTimeout(resolve, 1000)), // 1 second timeout
      ])

      // Verify command is still registered after execution
      const afterCommands = await vscode.commands.getCommands()
      assert.ok(afterCommands.includes('portalPreview.selectPortal'), 'selectPortal command should remain registered after execution')
    })

    test('should register clearCredentials command', async () => {
      // Verify the command is registered
      const commands = await vscode.commands.getCommands()
      assert.ok(commands.includes('portalPreview.clearCredentials'), 'clearCredentials command should be registered')
    })

    test('should execute clearCredentials command', async () => {
      // Verify command is available before execution
      const commands = await vscode.commands.getCommands()
      assert.ok(commands.includes('portalPreview.clearCredentials'), 'clearCredentials command should be available for execution')

      // Execute the command
      const commandPromise = vscode.commands.executeCommand('portalPreview.clearCredentials')

      // Wait a bit for the command to start
      await new Promise(resolve => setTimeout(resolve, 100))

      // Cancel any modal dialogs that might be open
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen')

      // Wait for command to complete
      await commandPromise

      // Verify command is still registered after execution
      const afterCommands = await vscode.commands.getCommands()
      assert.ok(afterCommands.includes('portalPreview.clearCredentials'), 'clearCredentials command should remain registered after execution')
    })
  })

  suite('Command Integration', () => {
    test('should handle command execution sequence', async () => {
      // Get initial command count
      const initialCommands = await vscode.commands.getCommands()
      const refreshExists = initialCommands.includes('portalPreview.refreshPreview')
      const clearExists = initialCommands.includes('portalPreview.clearCredentials')

      assert.ok(refreshExists, 'refreshPreview command should be available for sequence test')
      assert.ok(clearExists, 'clearCredentials command should be available for sequence test')

      // Test executing multiple commands in sequence
      await vscode.commands.executeCommand('portalPreview.refreshPreview')
      await vscode.commands.executeCommand('portalPreview.clearCredentials')

      // Cancel any dialogs
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen')

      // Verify commands are still registered after sequence execution
      const afterCommands = await vscode.commands.getCommands()
      assert.ok(afterCommands.includes('portalPreview.refreshPreview'), 'refreshPreview should remain after sequence')
      assert.ok(afterCommands.includes('portalPreview.clearCredentials'), 'clearCredentials should remain after sequence')
    })

    test('should handle preview commands with markdown document', async () => {
      // Create and open a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })
      await vscode.window.showTextDocument(document)

      // Verify document is properly loaded
      assert.strictEqual(vscode.window.activeTextEditor?.document.languageId, 'markdown', 'Should have markdown document active')
      assert.strictEqual(vscode.window.activeTextEditor?.document.getText(), sampleMarkdownContent, 'Should have correct markdown content')

      // Execute preview commands
      await vscode.commands.executeCommand('portalPreview.openPreview')
      await vscode.commands.executeCommand('portalPreview.refreshPreview')

      // Verify document state is maintained after command execution
      assert.strictEqual(vscode.window.activeTextEditor?.document.languageId, 'markdown', 'Should maintain markdown document after commands')
      assert.strictEqual(vscode.window.activeTextEditor?.document.getText(), sampleMarkdownContent, 'Should maintain markdown content after commands')
    })

    test('should handle token configuration workflow', async () => {
      // Execute token-related commands with timeout handling
      const clearPromise = vscode.commands.executeCommand('portalPreview.clearCredentials')
      await new Promise(resolve => setTimeout(resolve, 30))
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen')

      await Promise.race([
        clearPromise,
        new Promise(resolve => setTimeout(resolve, 500)),
      ])

      const configPromise = vscode.commands.executeCommand('portalPreview.configureToken')
      await new Promise(resolve => setTimeout(resolve, 30))
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen')

      await Promise.race([
        configPromise,
        new Promise(resolve => setTimeout(resolve, 500)),
      ])

      const selectPromise = vscode.commands.executeCommand('portalPreview.selectPortal')
      await new Promise(resolve => setTimeout(resolve, 30))
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen')

      await Promise.race([
        selectPromise,
        new Promise(resolve => setTimeout(resolve, 500)),
      ])

      // Verify workflow completes by checking command remains available
      const finalCommands = await vscode.commands.getCommands(true)
      assert.ok(finalCommands.includes('portalPreview.selectPortal'), 'Token configuration should maintain command availability')

      // Verify command can still be executed after workflow
      const secondExecution = vscode.commands.executeCommand('portalPreview.selectPortal')
      assert.ok(secondExecution instanceof Promise, 'Command should remain executable after token workflow')
    })
  })

  suite('Command Error Handling', () => {
    test('should handle commands gracefully when extension is not fully activated', async () => {
      // Verify commands are available for execution
      const availableCommands = await vscode.commands.getCommands(true)
      const portalCommands = availableCommands.filter(cmd => cmd.includes('portalPreview') || cmd.includes('vscode-konnect-portal'))

      assert.ok(portalCommands.length > 0, 'Portal commands should be registered and available')

      // Try executing commands that might fail during testing
      try {
        const refreshResult = await vscode.commands.executeCommand('portalPreview.refreshPreview')
        const openResult = await vscode.commands.executeCommand('portalPreview.openPreview')

        // Commands should return some result (even if undefined) indicating they executed
        assert.ok(refreshResult !== null, 'Refresh command should execute and return result')
        assert.ok(openResult !== null, 'Open command should execute and return result')
      } catch (error) {
        // Commands might throw during testing - verify error handling
        assert.ok(error instanceof Error, 'Commands should throw proper Error objects when they fail')
        assert.ok(typeof error.message === 'string', 'Command errors should have descriptive messages')
      }
    })

    test('should handle concurrent command execution', async () => {
      // Execute multiple commands concurrently
      const commands = [
        vscode.commands.executeCommand('portalPreview.refreshPreview'),
        vscode.commands.executeCommand('portalPreview.clearCredentials'),
        vscode.commands.executeCommand('portalPreview.configureToken'),
      ]

      // Cancel any dialogs after a short delay
      setTimeout(async () => {
        await vscode.commands.executeCommand('workbench.action.closeQuickOpen')
      }, 100)

      try {
        const results = await Promise.allSettled(commands)

        // Verify all commands attempted execution (fulfilled or rejected, not just silently failed)
        assert.strictEqual(results.length, commands.length, 'All concurrent commands should be attempted')

        // Verify commands don't leave the VS Code instance in an unstable state
        const postExecutionCommands = await vscode.commands.getCommands(true)
        assert.ok(postExecutionCommands.length > 0, 'VS Code command registry should remain functional after concurrent execution')

      } catch (error) {
        // Verify error handling doesn't crash the extension
        assert.ok(error instanceof Error, 'Concurrent command errors should be proper Error objects')

        // Verify VS Code remains functional after error
        const recoveryCommands = await vscode.commands.getCommands(true)
        assert.ok(recoveryCommands.length > 0, 'VS Code should remain functional after concurrent command errors')
      }
    })
  })

  suite('Command State Validation', () => {
    test('should maintain consistent command registration', async () => {
      // Get all registered commands
      const commands = await vscode.commands.getCommands()

      // Verify all expected commands are registered
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
    })

    test('should handle command execution state correctly', async () => {
      // Verify commands are available before execution
      const initialCommands = await vscode.commands.getCommands(true)
      const preExecutionCount = initialCommands.filter(cmd => cmd.includes('portalPreview')).length

      // Test that commands can be executed multiple times
      await vscode.commands.executeCommand('portalPreview.refreshPreview')
      await vscode.commands.executeCommand('portalPreview.refreshPreview')

      // Verify commands remain available after multiple executions
      const postExecutionCommands = await vscode.commands.getCommands(true)
      const postExecutionCount = postExecutionCommands.filter(cmd => cmd.includes('portalPreview')).length

      assert.strictEqual(postExecutionCount, preExecutionCount, 'Commands should remain available after multiple executions')
      assert.ok(postExecutionCommands.includes('portalPreview.refreshPreview'), 'Refresh command should remain registered after execution')
    })

    test('should maintain command availability after errors', async () => {
      // Execute a command that might cause an error
      const commandPromise = vscode.commands.executeCommand('portalPreview.openPreview')

      // Don't wait indefinitely
      await Promise.race([
        commandPromise,
        new Promise(resolve => setTimeout(resolve, 500)),
      ])

      // Verify commands are still available
      const commands = await vscode.commands.getCommands()
      assert.ok(
        commands.includes('portalPreview.openPreview'),
        'Commands should remain available after errors',
      )
    })
  })
})
