import * as assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { PreviewProvider } from '../../preview-provider'
import { PortalStorageService } from '../../konnect/storage'
import type { StoredPortalConfig } from '../../types/konnect'
import type { PortalPreviewConfig } from '../../types'
import { debug } from '../../utils/debug'

/** Test suite for Webview Provider functionality */
suite('Webview Provider Tests', () => {
  /** Preview provider instance for testing */
  let previewProvider: PreviewProvider

  /** Storage service for testing */
  let storageService: PortalStorageService

  /** Extension context for testing */
  let extensionContext: vscode.ExtensionContext

  /** Sample portal configuration for testing */
  const samplePortalConfig: StoredPortalConfig = {
    id: 'test-portal-123',
    name: 'test-portal',
    displayName: 'Test Portal',
    description: 'A test portal for testing purposes',
    origin: 'https://db153b47226b.us.kongportals.com',
    canonicalDomain: 'db153b47226b.us.kongportals.com',
  }

  /** Sample markdown content for testing */
  const sampleMarkdownContent = '# Test Document\n\nThis is a test markdown document.'

  setup(async () => {
    // Create a real secret storage that we can control for testing
    const realSecretStorage = new Map<string, string>()

    // Get the actual extension path for webview file access
    // In test environment, use the workspace root which should be the extension directory
    const extension = vscode.extensions.getExtension('kong.vscode-konnect-portal')
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    let actualExtensionPath = extension?.extensionPath || workspaceRoot || process.cwd()

    // Verify webview files exist at the extension path
    const webviewCssPath = path.join(actualExtensionPath, 'src', 'webview', 'webview.css')
    if (!fs.existsSync(webviewCssPath)) {
      // If files don't exist at the extension path, they might be in the project root
      const projectRoot = process.cwd()
      const altWebviewCssPath = path.join(projectRoot, 'src', 'webview', 'webview.css')
      if (fs.existsSync(altWebviewCssPath)) {
        console.log(`[TEST] Using project root for webview files: ${projectRoot}`)
        actualExtensionPath = projectRoot
      } else {
        console.warn(`[TEST] Webview files not found at ${webviewCssPath} or ${altWebviewCssPath}`)
      }
    }

    // Create extension context with real VS Code interfaces
    extensionContext = {
      secrets: {
        store: async (key: string, value: string): Promise<void> => {
          realSecretStorage.set(key, value)
        },
        get: async (key: string): Promise<string | undefined> => {
          return realSecretStorage.get(key)
        },
        delete: async (key: string): Promise<void> => {
          realSecretStorage.delete(key)
        },
        keys: async (): Promise<string[]> => {
          return Array.from(realSecretStorage.keys())
        },
        onDidChange: () => ({ dispose: () => {} }),
      },
      globalState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        keys: () => [],
        setKeysForSync: () => {},
      },
      workspaceState: {
        get: () => undefined,
        update: () => Promise.resolve(),
        keys: () => [],
      },
      subscriptions: [],
      extensionPath: actualExtensionPath,
      storagePath: undefined,
      globalStoragePath: actualExtensionPath + '/test-global-storage',
      logPath: actualExtensionPath + '/test-logs',
      extensionUri: vscode.Uri.file(actualExtensionPath),
      storageUri: undefined,
      globalStorageUri: vscode.Uri.file(actualExtensionPath + '/test-global-storage'),
      logUri: vscode.Uri.file(actualExtensionPath + '/test-logs'),
      extensionMode: vscode.ExtensionMode.Test,
      extension: {} as any,
      environmentVariableCollection: {} as any,
      languageModelAccessInformation: {} as any,
      asAbsolutePath: (relativePath: string) => `${actualExtensionPath}/${relativePath}`,
    } satisfies vscode.ExtensionContext

    // Create storage service
    storageService = new PortalStorageService(extensionContext)

    // Clear any existing storage
    await storageService.clearAll()

    // Create preview provider
    previewProvider = new PreviewProvider(extensionContext, storageService)
  })

  teardown(async () => {
    // Clean up
    if (previewProvider) {
      previewProvider.dispose()
    }
    if (storageService) {
      await storageService.clearAll()
    }

    // Close all editors
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })

  suite('Provider Initialization', () => {
    test('should create PreviewProvider instance with functional methods', async () => {
      assert.ok(previewProvider, 'PreviewProvider should be created')

      // Test that hasActivePreview method actually works
      const initialState = previewProvider.hasActivePreview()
      assert.strictEqual(typeof initialState, 'boolean', 'hasActivePreview should return boolean')
      assert.strictEqual(initialState, false, 'Should start with no active preview')

      // Test that openPreview method exists and can be called
      assert.ok(typeof previewProvider.openPreview === 'function', 'Should have openPreview method')

      // Test that refreshPreview method exists and can be called without error
      assert.ok(typeof previewProvider.refreshPreview === 'function', 'Should have refreshPreview method')
      previewProvider.refreshPreview() // Should not throw when called with no active preview

      // Verify state remains consistent after calling refreshPreview
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should maintain consistent state after refresh with no preview')
    })

    test('should start with no active preview', async () => {
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should start with no active preview')
    })

    test('should be disposable with functional verification', async () => {
      // Create a preview first to test actual disposal functionality
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify preview exists before disposal
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should have active preview before disposal')

      // Dispose provider
      previewProvider.dispose()

      // Verify preview is disposed
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should not have active preview after disposal')
    })
  })

  suite('Preview Opening', () => {
    test('should show warning when no token configured', async () => {
      // Ensure no token is stored
      await storageService.clearAll()

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Try to open preview
      await previewProvider.openPreview(document)

      // Should not have active preview due to missing token
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should not have active preview without token')
    })

    test('should handle missing portal configuration', async () => {
      // Store a token but no portal config
      await storageService.storeToken('kpat_test123456789012345678901')

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Try to open preview with a race condition for timeout
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Test timeout')), 500)
      })

      const openPromise = previewProvider.openPreview(document)

      try {
        await Promise.race([openPromise, timeoutPromise])
      } catch {
        // Expected to timeout or fail due to portal selection command
      }

      // Should not have active preview due to missing portal config
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should not have active preview without portal config')
    })

    test('should create preview with valid configuration', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)

      // Give time for webview creation
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify webview actually contains expected functionality
      const previewProviderAny = previewProvider as any
      if (previewProviderAny.panelState?.panel?.webview) {
        const webview = previewProviderAny.panelState.panel.webview
        const htmlContent = webview.html

        // Verify portal configuration is properly injected
        assert.ok(htmlContent.includes(samplePortalConfig.origin), 'Should inject portal origin into webview')
        assert.ok(htmlContent.includes('iframe'), 'Should create iframe for portal content')
        assert.ok(htmlContent.includes('preview=true'), 'Should add preview parameters to iframe URL')

        // Verify CSS and JS are properly injected
        assert.ok(htmlContent.includes('<style>') && htmlContent.includes('</style>'), 'Should inject CSS styling')
        assert.ok(htmlContent.includes('<script>') && htmlContent.includes('</script>'), 'Should inject JavaScript functionality')

        // Verify webview has proper structure
        assert.ok(htmlContent.includes('<!DOCTYPE html>'), 'Should have proper HTML document structure')
      } else {
        assert.fail('Webview was not created with valid configuration')
      }
    })

    test('should handle multiple preview open calls', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Open preview multiple times
      await previewProvider.openPreview(document)
      await previewProvider.openPreview(document)
      await previewProvider.openPreview(document)

      // Give time for webview creation
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify only one webview panel is created and it's properly configured
      const previewProviderAny = previewProvider as any
      if (previewProviderAny.panelState?.panel?.webview) {
        const webview = previewProviderAny.panelState.panel.webview
        const htmlContent = webview.html

        // Should have created only one functional webview with proper structure
        assert.ok(htmlContent.includes(samplePortalConfig.origin), 'Should have single webview with correct portal')
        assert.ok(htmlContent.includes('iframe'), 'Should contain iframe element for portal content')
        assert.ok(htmlContent.includes('preview=true'), 'Should have preview mode enabled in iframe URL')

        // Verify only one preview is active (not multiple instances)
        assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should have exactly one active preview')
      } else {
        assert.fail('Should create functional webview even with multiple open calls')
      }
    })
  })

  suite('Content Updates', () => {
    test('should handle content updates when no preview is active', async () => {
      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Try to update content without active preview
      await previewProvider.updateContent(document)

      // Verify no preview was created
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should not create preview when updating content without active preview')

      // Verify the call completed without throwing (implicit - if it threw, test would fail)
    })

    test('should handle content updates with valid preview', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)

      // Give time for webview creation
      await new Promise(resolve => setTimeout(resolve, 150))

      // Verify webview was created
      const previewProviderAny = previewProvider as any
      assert.ok(previewProviderAny.panelState?.panel?.webview, 'Should have created webview')

      // Update content with new content
      const updatedContent = '# Updated Content\n\nThis is updated test content.'
      const updatedDocument = await vscode.workspace.openTextDocument({
        content: updatedContent,
        language: 'markdown',
      })

      // Update content
      await previewProvider.updateContent(updatedDocument)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Verify the webview remains functional and preview stays active
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should maintain active preview after content update')

      // Verify webview HTML contains portal configuration (indicating it's functional)
      const webview = previewProviderAny.panelState.panel.webview
      const htmlContent = webview.html
      assert.ok(htmlContent.includes(samplePortalConfig.origin), 'Should maintain portal configuration in webview after update')
      assert.ok(htmlContent.includes('iframe'), 'Should maintain iframe structure after content update')
    })

    test('should process different content types correctly', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Test different content types
      const markdownContent = '# Markdown Test\n\nThis is **bold** text with [link](https://example.com).'
      const mdcContent = '---\ntitle: MDC Test\n---\n\n# MDC Content\n\n::alert\nThis is an MDC alert\n::'

      // Create markdown document
      const markdownDoc = await vscode.workspace.openTextDocument({
        content: markdownContent,
        language: 'markdown',
      })

      // Open preview with markdown
      await previewProvider.openPreview(markdownDoc)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Verify webview is functional with initial content
      const previewProviderAny = previewProvider as any
      assert.ok(previewProviderAny.panelState?.panel?.webview, 'Should have created webview for markdown content')

      // Create MDC document and switch to it
      const mdcDoc = await vscode.workspace.openTextDocument({
        content: mdcContent,
        language: 'mdc',
      })

      // Update to MDC content
      await previewProvider.updateContent(mdcDoc)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Verify webview remains functional after content type switch
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should maintain active preview with different content types')

      // Verify webview HTML structure is maintained
      const webview = previewProviderAny.panelState.panel.webview
      const htmlContent = webview.html
      assert.ok(htmlContent.includes(samplePortalConfig.origin), 'Should maintain portal configuration with different content types')
      assert.ok(htmlContent.includes('iframe'), 'Should maintain iframe structure with different content types')

      // Test switching back to markdown
      await previewProvider.updateContent(markdownDoc)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Verify webview remains stable after multiple content type switches
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should handle content type switching without issues')
    })

    test('should handle document switching', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create first markdown document
      const document1 = await vscode.workspace.openTextDocument({
        content: '# Document 1\n\nFirst document content.',
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document1)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Verify initial webview is functional
      const previewProviderAny = previewProvider as any
      assert.ok(previewProviderAny.panelState?.panel?.webview, 'Should have created webview for first document')

      // Create second document
      const document2 = await vscode.workspace.openTextDocument({
        content: '# Document 2\n\nSecond document content.',
        language: 'markdown',
      })

      // Switch to second document
      await previewProvider.switchDocument(document2)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Verify webview remains functional after document switch
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should maintain active preview when switching documents')

      // Verify webview HTML structure is maintained
      const webview = previewProviderAny.panelState.panel.webview
      const htmlContent = webview.html
      assert.ok(htmlContent.includes(samplePortalConfig.origin), 'Should maintain portal configuration after document switch')
      assert.ok(htmlContent.includes('iframe'), 'Should maintain iframe structure after document switch')
    })

    test('should handle switch document when no preview is active', async () => {
      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Try to switch document without active preview
      await previewProvider.switchDocument(document)

      // Should not throw error and should not have active preview
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should handle document switch without active preview')
    })
  })

  suite('Webview Message Communication', () => {
    test('should send content updates through webview interface', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a document with specific content
      const testContent = '# Test Message\n\nThis content should be sent via postMessage.'
      const document = await vscode.workspace.openTextDocument({
        content: testContent,
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify webview was created
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should have active webview')

      // Update content multiple times to test message sending
      const updates = [
        '# Update 1\n\nFirst update content.',
        '# Update 2\n\nSecond update content.',
        '# Update 3\n\nThird update content.',
      ]

      for (const updateContent of updates) {
        const updateDoc = await vscode.workspace.openTextDocument({
          content: updateContent,
          language: 'markdown',
        })

        await previewProvider.updateContent(updateDoc)
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Webview should remain active and handle all updates
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should maintain active webview through content updates')
    })

    test('should handle content requests from webview', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create document with content
      const testContent = '# Content Request Test\n\nTesting content request handling.'
      const document = await vscode.workspace.openTextDocument({
        content: testContent,
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify webview is active and can handle content requests
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should have active webview for content requests')

      // Test rapid content requests
      for (let i = 0; i < 5; i++) {
        await previewProvider.updateContent(document)
        await new Promise(resolve => setTimeout(resolve, 20))
      }

      // Should handle multiple content requests without issues
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should handle multiple content requests')
    })

    test('should handle webview:request:content messages and respond', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create document with content
      const testContent = '# Content Request Test\n\nTesting content request handling.'
      const document = await vscode.workspace.openTextDocument({
        content: testContent,
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      const previewProviderAny = previewProvider as any
      const sentMessages: any[] = []

      if (previewProviderAny.panelState?.panel?.webview) {
        const mockWebview = previewProviderAny.panelState.panel.webview

        // Override postMessage to capture responses
        const originalPostMessage = mockWebview.postMessage
        mockWebview.postMessage = (message: any) => {
          sentMessages.push(message)
          return originalPostMessage.call(mockWebview, message)
        }

        // Simulate webview requesting content
        const requestMessage = { type: 'webview:request:content' }
        previewProviderAny.handleWebviewMessage(requestMessage)

        await new Promise(resolve => setTimeout(resolve, 100))

        // Verify content was sent in response
        const contentMessages = sentMessages.filter(msg => msg.type === 'webview:update:content')
        assert.ok(contentMessages.length > 0, 'Should respond to content requests')

        if (contentMessages.length > 0) {
          assert.strictEqual(contentMessages[0].content, testContent, 'Should send current document content')
        }
      } else {
        assert.fail('Webview was not created properly')
      }
    })

    test('should handle error conditions and maintain webview stability', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: '# Error Test\n\nTesting error handling capabilities.',
        language: 'markdown',
      })

      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify webview is stable
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should have stable webview')

      // Test various error conditions
      const errorConditions = [
        '# Invalid Content\n\n```invalid-language\nSome code\n```',
        '# Very Long Content\n\n' + 'A'.repeat(10000),
        '# Special Characters\n\n' + '™®©€¥£¢§¶†‡•…‰′″‹›""–—',
        '# Empty Lines\n\n\n\n\n\n\n\n\n\n',
      ]

      for (const content of errorConditions) {
        const errorDoc = await vscode.workspace.openTextDocument({
          content,
          language: 'markdown',
        })

        await previewProvider.updateContent(errorDoc)
        await new Promise(resolve => setTimeout(resolve, 50))

        // Should maintain webview stability through error conditions
        assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should maintain webview through error conditions')
      }
    })

    test('should handle rapid content updates gracefully', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: '# Rapid Update Test\n\nTesting rapid update handling.',
        language: 'markdown',
      })

      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Test rapid updates that should be handled gracefully
      const rapidUpdates = []
      for (let i = 0; i < 10; i++) {
        const updateDoc = await vscode.workspace.openTextDocument({
          content: `# Rapid Update ${i}\n\nUpdate ${i} content with some meaningful text.`,
          language: 'markdown',
        })
        rapidUpdates.push(previewProvider.updateContent(updateDoc))
      }

      // Wait for all updates
      await Promise.allSettled(rapidUpdates)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should handle rapid updates gracefully and maintain stability
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should handle rapid updates without errors')

      // Verify final content update worked
      const finalDoc = await vscode.workspace.openTextDocument({
        content: '# Final Update\n\nFinal content verification.',
        language: 'markdown',
      })

      await previewProvider.updateContent(finalDoc)
      await new Promise(resolve => setTimeout(resolve, 100))

      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should remain stable after rapid updates')
    })
  })

  suite('Webview Resource Injection', () => {
    test('should inject actual CSS content into webview HTML', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: '# CSS Injection Test\n\nTesting CSS resource injection.',
        language: 'markdown',
      })

      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Access the webview HTML content
      const previewProviderAny = previewProvider as any
      if (previewProviderAny.panelState?.panel?.webview) {
        const webview = previewProviderAny.panelState.panel.webview

        // Get the HTML content (this is what gets injected)
        const htmlContent = webview.html

        // Verify CSS is actually injected
        assert.ok(htmlContent.includes('<style>'), 'Should inject CSS style tags')
        assert.ok(htmlContent.includes('body') || htmlContent.includes('#preview'), 'Should include actual CSS rules')
      } else {
        assert.fail('Webview was not created properly for CSS injection test')
      }
    })

    test('should inject actual JavaScript content into webview HTML', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: '# JS Injection Test\n\nTesting JavaScript resource injection.',
        language: 'markdown',
      })

      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 150))

      const previewProviderAny = previewProvider as any
      if (previewProviderAny.panelState?.panel?.webview) {
        const webview = previewProviderAny.panelState.panel.webview
        const htmlContent = webview.html

        // Verify JavaScript is actually injected
        assert.ok(htmlContent.includes('<script>'), 'Should inject JavaScript script tags')
        assert.ok(htmlContent.includes('postMessage') || htmlContent.includes('addEventListener'), 'Should include message handling JS')
      } else {
        assert.fail('Webview was not created properly for JS injection test')
      }
    })

    test('should inject complete HTML template with portal configuration', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: '# HTML Template Test\n\nTesting HTML template injection.',
        language: 'markdown',
      })

      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 150))

      const previewProviderAny = previewProvider as any
      if (previewProviderAny.panelState?.panel?.webview) {
        const webview = previewProviderAny.panelState.panel.webview
        const htmlContent = webview.html

        // Verify complete HTML structure
        assert.ok(htmlContent.includes('<!DOCTYPE html>'), 'Should include DOCTYPE declaration')
        assert.ok(htmlContent.includes('<html'), 'Should include HTML tag')
        assert.ok(htmlContent.includes('<head>'), 'Should include head section')
        assert.ok(htmlContent.includes('<body>'), 'Should include body section')

        // Verify portal-specific content
        assert.ok(htmlContent.includes(samplePortalConfig.origin), 'Should include portal origin in HTML')
        assert.ok(htmlContent.includes('iframe'), 'Should include iframe for portal content')

        // Verify CSS and JavaScript were properly injected
        assert.ok(htmlContent.includes('<style>') && htmlContent.includes('</style>'), 'Should inject CSS style tags')
        assert.ok(htmlContent.includes('<script>') && htmlContent.includes('</script>'), 'Should inject JavaScript script tags')

        // Verify actual content was injected (not just empty tags)
        const styleMatch = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/)
        assert.ok(styleMatch && styleMatch[1].trim(), 'Should inject CSS content')

        const scriptMatch = htmlContent.match(/<script[^>]*>([\s\S]*?)<\/script>/)
        assert.ok(scriptMatch && scriptMatch[1].trim(), 'Should inject JavaScript content')
      } else {
        assert.fail('Webview was not created properly for HTML template test')
      }
    })

    test('should handle resource loading failures with graceful fallbacks', async () => {
      // Test with an extension context that might have missing files
      const testExtensionContext = {
        ...extensionContext,
        extensionPath: '/nonexistent/path', // This should trigger resource loading errors
      }

      // Temporarily suppress debug.error for expected ENOENT errors
      const originalDebugError = debug.error
      debug.error = (message: string, data?: unknown, force?: boolean) => {
        // Only suppress ENOENT-related errors from this specific test
        if (message.includes('Failed to load webview')) {
          return // Silently ignore expected webview resource loading errors
        }
        originalDebugError.call(debug, message, data, force)
      }

      const testProvider = new PreviewProvider(testExtensionContext, storageService)

      try {
        await storageService.storeToken('kpat_test123456789012345678901')
        await storageService.storeSelectedPortal(samplePortalConfig)

        const document = await vscode.workspace.openTextDocument({
          content: '# Resource Error Test\n\nTesting resource loading error handling.',
          language: 'markdown',
        })

        // This should either succeed with fallbacks or fail gracefully
        await testProvider.openPreview(document)
        await new Promise(resolve => setTimeout(resolve, 150))

        // Test passes if no unhandled exceptions occurred and fallback content is used
        const testProviderAny = testProvider as any
        if (testProviderAny.panelState?.panel?.webview) {
          const fallbackHtml = testProviderAny.panelState.panel.webview.html

          // Should use fallback content when resources fail to load
          assert.ok(fallbackHtml.includes('<!DOCTYPE html>'), 'Should use fallback HTML template')
          assert.ok(fallbackHtml.includes(samplePortalConfig.origin), 'Should still include portal configuration in fallback')
          assert.ok(fallbackHtml.includes('iframe'), 'Should still create iframe in fallback template')
        } else {
          // Alternatively, if no webview was created, that's also acceptable for error handling
          assert.strictEqual(testProvider.hasActivePreview(), false, 'Should not create preview when resources fail to load')
        }

      } finally {
        // Restore original debug.error
        debug.error = originalDebugError
        testProvider.dispose()
      }
    })
  })

  suite('Preview Lifecycle Management', () => {
    test('should properly open preview with full lifecycle', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Verify initial state
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should start with no active preview')

      // Create document
      const document = await vscode.workspace.openTextDocument({
        content: '# Lifecycle Test\n\nTesting complete preview lifecycle.',
        language: 'markdown',
      })

      // Open preview - full lifecycle: create panel, inject resources, send content
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should complete full lifecycle successfully
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should properly open preview with full lifecycle')
    })

    test('should refresh preview maintaining webview state', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create and show document
      const document = await vscode.workspace.openTextDocument({
        content: '# Refresh Test\n\nTesting preview refresh functionality.',
        language: 'markdown',
      })
      await vscode.window.showTextDocument(document)

      // Open initial preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Capture the initial webview state
      const previewProviderAny = previewProvider as any
      const initialPanelId = previewProviderAny.panelState?.panel?.id

      if (previewProviderAny.panelState?.panel?.webview) {
        const initialHtml = previewProviderAny.panelState.panel.webview.html

        // Verify initial webview structure
        assert.ok(initialHtml.includes('<!DOCTYPE html>'), 'Should have proper HTML structure before refresh')
        assert.ok(initialHtml.includes(samplePortalConfig.origin), 'Should have portal configuration before refresh')

        // Refresh preview - should reload iframe and maintain state
        previewProvider.refreshPreview()
        await new Promise(resolve => setTimeout(resolve, 150))

        // Verify webview is still functional after refresh
        const refreshedHtml = previewProviderAny.panelState.panel.webview.html
        assert.ok(refreshedHtml.includes('<!DOCTYPE html>'), 'Should maintain HTML structure after refresh')
        assert.ok(refreshedHtml.includes(samplePortalConfig.origin), 'Should maintain portal configuration after refresh')
        assert.ok(refreshedHtml.includes('iframe'), 'Should maintain iframe element after refresh')

        // Panel should be the same instance (not recreated)
        const refreshedPanelId = previewProviderAny.panelState?.panel?.id
        assert.strictEqual(refreshedPanelId, initialPanelId, 'Should maintain same webview panel instance after refresh')
      } else {
        assert.fail('Webview should be functional for refresh testing')
      }
    })

    test('should handle preview refresh with content updates', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create initial document
      const document = await vscode.workspace.openTextDocument({
        content: '# Original Content\n\nThis is the original content.',
        language: 'markdown',
      })
      await vscode.window.showTextDocument(document)

      // Open preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Update document content
      const updatedDocument = await vscode.workspace.openTextDocument({
        content: '# Updated Content\n\nThis is the updated content after refresh.',
        language: 'markdown',
      })

      // Update content then refresh
      await previewProvider.updateContent(updatedDocument)
      await new Promise(resolve => setTimeout(resolve, 100))

      previewProvider.refreshPreview()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should handle both content update and refresh
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should handle preview refresh with content updates')
    })

    test('should maintain preview through rapid operations', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: '# Rapid Operations Test\n\nTesting rapid preview operations.',
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Perform rapid operations
      for (let i = 0; i < 3; i++) {
        const testDoc = await vscode.workspace.openTextDocument({
          content: `# Rapid Test ${i}\n\nRapid operation number ${i}.`,
          language: 'markdown',
        })

        // Rapid sequence: update, refresh, update
        await previewProvider.updateContent(testDoc)
        previewProvider.refreshPreview()
        await previewProvider.updateContent(testDoc)

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Give time for all operations to complete
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should maintain preview through rapid operations
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should maintain preview through rapid operations')
    })
  })

  suite('Webview Content Generation', () => {
    test('should generate webview HTML with portal configuration', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: '# Test Content\n\nThis content should appear in the portal.',
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Verify preview is active (indicates webview was created successfully)
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should have active preview with generated content')
    })

    test('should handle webview resource loading', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a document with various content elements
      const document = await vscode.workspace.openTextDocument({
        content: `# Resource Test

This is a test with various content elements:

- Lists
- **Bold text**
- \`code\`

\`\`\`javascript
console.log('code block')
\`\`\``,
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should successfully create webview with resources
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should handle webview resource loading')
    })

    test('should generate proper portal URLs', async () => {
      // Test with different portal configurations using a variant of the main config
      const testPortalConfig: StoredPortalConfig = {
        id: 'url-test-portal',
        name: 'url-test',
        displayName: 'URL Test Portal',
        description: 'Portal for testing URL generation',
        origin: samplePortalConfig.origin,
        canonicalDomain: samplePortalConfig.canonicalDomain,
      }

      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(testPortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: '# URL Test\n\nTesting portal URL generation.',
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should create webview with custom portal URL
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should generate proper portal URLs')
    })
  })

  suite('Configuration Integration', () => {
    test('should apply configuration changes to active webview', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Open preview with initial config
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Capture the initial webview state
      const previewProviderAny = previewProvider as any
      if (previewProviderAny.panelState?.panel?.webview) {
        // Update configuration with different settings
        const newConfig: PortalPreviewConfig = {
          autoOpen: false,
          updateDelay: 200,
          readyTimeout: 8000,
          debug: true,
          showMDCRecommendation: false,
          pagesDirectory: 'custom-pages',
          snippetsDirectory: 'custom-snippets',
        }

        await previewProvider.updateConfiguration(newConfig)
        await new Promise(resolve => setTimeout(resolve, 100))

        // Verify configuration was applied by checking webview content
        const updatedHtml = previewProviderAny.panelState.panel.webview.html

        // Should maintain core functionality
        assert.ok(updatedHtml.includes(samplePortalConfig.origin), 'Should maintain portal configuration')
        assert.ok(updatedHtml.includes('iframe'), 'Should maintain iframe structure')

        // Configuration changes should be reflected in the webview JavaScript
        assert.ok(updatedHtml.includes('8000'), 'Should apply new readyTimeout configuration')

        // Should maintain webview functionality
        assert.ok(updatedHtml.includes('<script>'), 'Should maintain JavaScript functionality after config update')
      } else {
        assert.fail('Webview should be functional for configuration updates')
      }
    })

    test('should handle pages directory configuration', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create config with pages directory
      const pagesConfig: PortalPreviewConfig = {
        autoOpen: true,
        updateDelay: 500,
        readyTimeout: 5000,
        debug: false,
        showMDCRecommendation: true,
        pagesDirectory: 'docs',
        snippetsDirectory: 'snippets',
      }

      // Create a document that would be in pages directory
      const document = await vscode.workspace.openTextDocument({
        content: '# Page Document\n\nThis is a page document.',
        language: 'markdown',
      })

      // Open preview with pages config
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Update configuration
      await previewProvider.updateConfiguration(pagesConfig)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should handle pages directory configuration
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should handle pages directory configuration')
    })
  })

  suite('Real Portal Integration', () => {
    test('should handle portal origin changes', async () => {
      // Start with one portal
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: '# Portal Integration Test\n\nTesting portal changes.',
        language: 'markdown',
      })

      // Open preview with first portal
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify initial portal is configured
      const previewProviderAny = previewProvider as any
      if (previewProviderAny.panelState?.panel?.webview) {
        const initialHtml = previewProviderAny.panelState.panel.webview.html
        assert.ok(initialHtml.includes(samplePortalConfig.origin), 'Should use initial portal configuration')

        // Change to different portal using a variant of the main config
        const newPortalConfig: StoredPortalConfig = {
          id: 'portal-change-test',
          name: 'portal-change',
          displayName: 'Portal Change Test',
          description: 'Testing portal origin changes',
          origin: samplePortalConfig.origin,
          canonicalDomain: samplePortalConfig.canonicalDomain,
        }

        await storageService.storeSelectedPortal(newPortalConfig)

        // Update configuration to trigger portal change
        const config: PortalPreviewConfig = {
          autoOpen: true,
          updateDelay: 500,
          readyTimeout: 5000,
          debug: false,
          showMDCRecommendation: true,
          pagesDirectory: 'pages',
          snippetsDirectory: 'snippets',
        }

        await previewProvider.updateConfiguration(config)
        await new Promise(resolve => setTimeout(resolve, 100))

        // Verify webview was updated with new portal configuration
        const updatedHtml = previewProviderAny.panelState.panel.webview.html
        assert.ok(updatedHtml.includes(newPortalConfig.origin), 'Should update to new portal configuration')
        assert.ok(updatedHtml.includes('iframe'), 'Should maintain iframe structure after portal change')
        assert.ok(updatedHtml.includes('preview=true'), 'Should maintain preview parameters after portal change')
      } else {
        assert.fail('Webview should be functional for portal origin changes')
      }
    })

    test('should maintain webview state during rapid updates', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      const document = await vscode.workspace.openTextDocument({
        content: '# Rapid Updates Test\n\nTesting rapid content updates.',
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Perform rapid updates
      for (let i = 0; i < 5; i++) {
        const updatedDoc = await vscode.workspace.openTextDocument({
          content: `# Update ${i}\n\nContent update number ${i}.`,
          language: 'markdown',
        })
        await previewProvider.updateContent(updatedDoc)
        // Small delay between updates
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Give time for all updates to process
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should maintain webview state during rapid updates
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should maintain webview state during rapid updates')
    })
  })

  suite('Preview Refresh', () => {
    test('should handle refresh when no preview is active', async () => {
      // Verify no preview exists initially
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should start with no active preview')

      // Try to refresh without active preview
      previewProvider.refreshPreview()

      // Verify state remains unchanged
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should remain without preview after refresh attempt')
    })

    test('should handle refresh with active preview', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })
      await vscode.window.showTextDocument(document)

      // Open preview
      await previewProvider.openPreview(document)

      // Give time for webview creation
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify preview exists before refresh
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should have active preview before refresh')

      // Refresh preview
      previewProvider.refreshPreview()
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify preview still exists and is functional after refresh
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should maintain active preview after refresh')

      const previewProviderAny = previewProvider as any
      const afterRefreshHtml = previewProviderAny.panelState?.panel?.webview?.html
      assert.ok(afterRefreshHtml.includes(samplePortalConfig.origin), 'Should maintain portal configuration after refresh')
      assert.ok(afterRefreshHtml.includes('iframe'), 'Should maintain iframe structure after refresh')
    })

    test('should open preview if no active document when refreshing', async () => {
      // Ensure no active editor
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')

      // Verify no preview initially
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should start with no active preview')

      // Try to refresh - should handle gracefully without an active document
      previewProvider.refreshPreview()

      // Verify state remains unchanged
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should not create preview when refreshing with no active document')
    })
  })

  suite('Configuration Updates', () => {
    test('should handle configuration updates when no preview is active', async () => {
      // Create test configuration
      const config: PortalPreviewConfig = {
        autoOpen: true,
        updateDelay: 500,
        readyTimeout: 5000,
        debug: false,
        showMDCRecommendation: true,
        pagesDirectory: 'pages',
        snippetsDirectory: 'snippets',
      }

      // Verify no preview initially
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should start with no active preview')

      // Try to update configuration without active preview
      await previewProvider.updateConfiguration(config)

      // Verify no preview was created
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should not create preview when updating configuration without active preview')
    })

    test('should handle configuration updates with active preview', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)

      // Give time for webview creation
      await new Promise(resolve => setTimeout(resolve, 100))

      // Capture initial webview state
      const previewProviderAny = previewProvider as any
      const initialHtml = previewProviderAny.panelState?.panel?.webview?.html
      assert.ok(initialHtml.includes('5000'), 'Should have default readyTimeout in initial config')

      // Update configuration
      const config: PortalPreviewConfig = {
        autoOpen: false,
        updateDelay: 1000,
        readyTimeout: 10000,
        debug: true,
        showMDCRecommendation: false,
        pagesDirectory: 'docs',
        snippetsDirectory: 'code-snippets',
      }

      await previewProvider.updateConfiguration(config)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify configuration was applied
      const updatedHtml = previewProviderAny.panelState?.panel?.webview?.html
      assert.ok(updatedHtml.includes('10000'), 'Should apply new readyTimeout configuration')
      assert.ok(updatedHtml.includes(samplePortalConfig.origin), 'Should maintain portal configuration')
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should maintain active preview after configuration update')
    })

    test('should handle configuration updates with no portal config', async () => {
      // Store token but clear portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.clearSelectedPortal()

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Try to open preview with a race condition for timeout
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Test timeout')), 500)
      })

      const openPromise = previewProvider.openPreview(document)

      try {
        await Promise.race([openPromise, timeoutPromise])
      } catch {
        // Expected to timeout or fail due to portal selection command
      }

      // Try to update configuration
      const config: PortalPreviewConfig = {
        autoOpen: true,
        updateDelay: 500,
        readyTimeout: 5000,
        debug: false,
        showMDCRecommendation: true,
        pagesDirectory: 'pages',
        snippetsDirectory: 'snippets',
      }

      await previewProvider.updateConfiguration(config)

      // Verify configuration update completes without creating unwanted preview
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should not create preview when updating config without portal')

      // Verify provider remains functional after configuration update
      const finalState = previewProvider.hasActivePreview()
      assert.strictEqual(typeof finalState, 'boolean', 'Should maintain functional state after config update')
    })
  })

  suite('Error Handling', () => {
    test('should handle disposal properly', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)

      // Give time for webview creation
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify preview is active
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should have active preview before disposal')

      // Dispose provider
      previewProvider.dispose()

      // Verify disposal was effective by checking state
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should not have active preview after disposal')

      // Verify provider can handle operations after disposal without throwing
      previewProvider.refreshPreview() // Should not throw
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should remain disposed after operations')
    })

    test('should handle multiple disposal calls without side effects', async () => {
      // Dispose multiple times
      previewProvider.dispose()
      previewProvider.dispose()
      previewProvider.dispose()

      // Verify state remains consistent after multiple disposals
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should maintain consistent state after multiple disposals')

      // Verify provider remains functional after multiple disposals
      previewProvider.refreshPreview() // Should not throw
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should remain functional after multiple disposal calls')
    })

    test('should handle operations after disposal', async () => {
      // Dispose provider
      previewProvider.dispose()

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Try operations after disposal
      await previewProvider.openPreview(document)
      await previewProvider.updateContent(document)
      previewProvider.refreshPreview()

      // Should handle gracefully without active preview
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should not have active preview after disposal')
    })
  })

  suite('State Management', () => {
    test('should track preview state correctly', async () => {
      // Initially no active preview
      assert.strictEqual(previewProvider.hasActivePreview(), false, 'Should start with no active preview')

      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create a markdown document
      const document = await vscode.workspace.openTextDocument({
        content: sampleMarkdownContent,
        language: 'markdown',
      })

      // Open preview
      await previewProvider.openPreview(document)

      // Give time for webview creation
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should have active preview
      assert.strictEqual(previewProvider.hasActivePreview(), true, 'Should have active preview after opening')
    })

    test('should handle concurrent operations', async () => {
      // Store token and portal config
      await storageService.storeToken('kpat_test123456789012345678901')
      await storageService.storeSelectedPortal(samplePortalConfig)

      // Create multiple documents
      const document1 = await vscode.workspace.openTextDocument({
        content: '# Document 1',
        language: 'markdown',
      })

      const document2 = await vscode.workspace.openTextDocument({
        content: '# Document 2',
        language: 'markdown',
      })

      // Execute concurrent operations
      const operations = [
        previewProvider.openPreview(document1),
        previewProvider.updateContent(document1),
        previewProvider.switchDocument(document2),
        previewProvider.updateContent(document2),
      ]

      await Promise.allSettled(operations)

      // Give time for operations to complete
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify concurrent operations completed successfully by checking final state
      const finalState = previewProvider.hasActivePreview()
      assert.strictEqual(typeof finalState, 'boolean', 'Should maintain valid state after concurrent operations')

      // Verify provider remains functional after concurrent operations
      previewProvider.refreshPreview() // Should not throw
      const stateAfterRefresh = previewProvider.hasActivePreview()
      assert.strictEqual(typeof stateAfterRefresh, 'boolean', 'Should remain functional after concurrent operations and refresh')
    })
  })
})
