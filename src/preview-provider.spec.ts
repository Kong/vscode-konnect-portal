import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ExtensionContext, TextDocument, WebviewPanel, Webview } from 'vscode'

// Mock all VS Code APIs at module level
vi.mock('vscode', () => ({
  ViewColumn: {
    Beside: 2,
  },
  window: {
    createWebviewPanel: vi.fn(),
    showWarningMessage: vi.fn(),
    activeTextEditor: null,
  },
  commands: {
    executeCommand: vi.fn(),
  },
}))

// Mock other dependencies
vi.mock('./utils/debug', () => ({
  debug: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('./utils/vscode-context', () => ({
  updatePreviewContext: vi.fn(),
}))

vi.mock('./utils/webview', () => ({
  generateWebviewHTML: vi.fn().mockReturnValue('<html>test</html>'),
  loadWebviewCSS: vi.fn().mockReturnValue('/* css */'),
  loadWebviewJS: vi.fn().mockReturnValue('// js'),
}))

vi.mock('./utils/page-path', () => ({
  getDocumentPathInfo: vi.fn(),
}))

vi.mock('./extension', () => ({
  getConfiguration: vi.fn(),
}))

vi.mock('uncrypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-123'),
}))

// Import after mocks
import { window, commands, ViewColumn } from 'vscode'
import { PreviewProvider } from './preview-provider'
import { debug } from './utils/debug'
import { updatePreviewContext } from './utils/vscode-context'
import { getDocumentPathInfo } from './utils/page-path'
import { getConfiguration } from './extension'
import { randomUUID } from 'uncrypto'
import type { PortalStorageService } from './konnect/storage'
import type { PortalPreviewConfig } from './types'
import type { StoredPortalConfig } from './types/konnect'
import { PortalSetupActions } from './types/ui-actions'

describe('PreviewProvider', () => {
  let previewProvider: PreviewProvider
  let mockContext: ExtensionContext
  let mockStorageService: PortalStorageService
  let mockDocument: TextDocument
  let mockWebviewPanel: WebviewPanel
  let mockWebview: Webview

  const mockConfig: PortalPreviewConfig = {
    autoOpen: true,
    updateDelay: 300,
    readyTimeout: 5000,
    debug: false,
    showMDCRecommendation: true,
    pagesDirectory: 'pages',
    snippetsDirectory: 'snippets',
  }

  const mockPortalConfig: StoredPortalConfig = {
    id: 'portal-123',
    name: 'test-portal',
    displayName: 'Test Portal',
    description: 'Test Portal Description',
    origin: 'https://test-portal.example.com',
    canonicalDomain: 'test-portal.example.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock webview
    mockWebview = {
      postMessage: vi.fn(),
      html: '',
      options: {},
      cspSource: 'test-csp',
      asWebviewUri: vi.fn(),
      onDidReceiveMessage: vi.fn(),
    } as unknown as Webview

    // Create mock webview panel
    mockWebviewPanel = {
      webview: mockWebview,
      title: 'Portal Preview',
      reveal: vi.fn(),
      dispose: vi.fn(),
      onDidDispose: vi.fn(),
      onDidChangeViewState: vi.fn(),
      viewType: 'portalPreview',
      active: true,
      visible: true,
    } as unknown as WebviewPanel

    // Setup VS Code mocks
    vi.mocked(window.createWebviewPanel).mockReturnValue(mockWebviewPanel)
    vi.mocked(window.showWarningMessage).mockResolvedValue(undefined)
    vi.mocked(commands.executeCommand).mockResolvedValue(undefined)
    vi.mocked(getConfiguration).mockReturnValue(mockConfig)
    vi.mocked(getDocumentPathInfo).mockReturnValue({
      type: 'page',
      path: 'test-page',
      snippetName: undefined,
    })

    // Create mock context
    mockContext = {
      extensionPath: '/test/extension/path',
      subscriptions: [],
    } as unknown as ExtensionContext

    // Create mock storage service
    mockStorageService = {
      hasValidToken: vi.fn(),
      getSelectedPortal: vi.fn(),
    } as unknown as PortalStorageService

    // Create mock document
    mockDocument = {
      fileName: 'test.md',
      getText: vi.fn().mockReturnValue('# Test Content'),
      uri: { fsPath: '/test/path/test.md' },
    } as unknown as TextDocument

    // Setup default mock returns
    vi.mocked(mockStorageService.hasValidToken).mockResolvedValue(true)
    vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValue(mockPortalConfig)

    previewProvider = new PreviewProvider(mockContext, mockStorageService)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create instance with unique preview ID', () => {
      expect(randomUUID).toHaveBeenCalled()
      expect(previewProvider).toBeInstanceOf(PreviewProvider)
    })
  })

  describe('openPreview', () => {
    it('should show warning and configure token when no token is configured', async () => {
      vi.mocked(mockStorageService.hasValidToken).mockResolvedValue(false)
      vi.mocked(window.showWarningMessage).mockResolvedValue(PortalSetupActions.CONFIGURE_TOKEN as any)

      await previewProvider.openPreview(mockDocument)

      expect(window.showWarningMessage).toHaveBeenCalledWith(
        'No Konnect token configured. Please configure your Personal Access Token to continue.',
        PortalSetupActions.CONFIGURE_TOKEN,
      )
      expect(commands.executeCommand).toHaveBeenCalledWith('portalPreview.configureToken')
    })

    it('should not execute configure command when user cancels token warning', async () => {
      vi.mocked(mockStorageService.hasValidToken).mockResolvedValue(false)
      vi.mocked(window.showWarningMessage).mockResolvedValue(undefined)

      await previewProvider.openPreview(mockDocument)

      expect(window.showWarningMessage).toHaveBeenCalled()
      expect(commands.executeCommand).not.toHaveBeenCalledWith('portalPreview.configureToken')
    })

    it('should auto-trigger portal selection when token exists but no portal is selected', async () => {
      vi.mocked(mockStorageService.hasValidToken).mockResolvedValue(true)
      vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValue(undefined)

      await previewProvider.openPreview(mockDocument)

      expect(commands.executeCommand).toHaveBeenCalledWith('portalPreview.selectPortal')
    })

    it('should reveal existing panel when one exists', async () => {
      // First call to create panel
      await previewProvider.openPreview(mockDocument)

      // Second call should reveal existing panel
      await previewProvider.openPreview(mockDocument)

      expect(mockWebviewPanel.reveal).toHaveBeenCalledWith(ViewColumn.Beside)
      expect(window.createWebviewPanel).toHaveBeenCalledTimes(1) // Only called once
    })

    it('should create new webview panel when none exists', async () => {
      await previewProvider.openPreview(mockDocument)

      expect(window.createWebviewPanel).toHaveBeenCalledWith(
        'portalPreview',
        'Portal Preview - test.md',
        ViewColumn.Beside,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        }),
      )
    })

    it('should setup panel disposal callback that updates context', async () => {
      await previewProvider.openPreview(mockDocument)

      // Get the onDidDispose callback that was registered
      const onDidDisposeCall = vi.mocked(mockWebviewPanel.onDidDispose).mock.calls[0]
      expect(onDidDisposeCall).toBeDefined()

      // Execute the dispose callback
      const disposeCallback = onDidDisposeCall[0]
      disposeCallback()

      // Should call updatePreviewContext with false
      expect(updatePreviewContext).toHaveBeenCalledWith(false)
    })
  })

  describe('hasActivePreview', () => {
    it('should return false when no panel exists', () => {
      expect(previewProvider.hasActivePreview()).toBe(false)
    })

    it('should return true when panel exists and is visible', async () => {
      await previewProvider.openPreview(mockDocument)

      expect(previewProvider.hasActivePreview()).toBe(true)
    })
  })

  describe('switchDocument', () => {
    beforeEach(async () => {
      // Setup an active preview
      await previewProvider.openPreview(mockDocument)
    })

    it('should do nothing when no active preview exists', async () => {
      // Create a new provider without opening preview
      const newProvider = new PreviewProvider(mockContext, mockStorageService)
      const newDocument = { ...mockDocument, fileName: 'new.md' } as TextDocument

      await newProvider.switchDocument(newDocument)

      expect(debug.log).not.toHaveBeenCalledWith(
        'Switching preview to new document:',
        'new.md',
      )
    })

    it('should update panel title when switching documents', async () => {
      const newDocument = { ...mockDocument, fileName: 'new.md' } as TextDocument

      await previewProvider.switchDocument(newDocument)

      expect(mockWebviewPanel.title).toBe('Portal Preview - new.md')
      expect(debug.log).toHaveBeenCalledWith(
        'Switching preview to new document:',
        'new.md',
      )
    })

    it('should send navigate message when pages directory is configured', async () => {
      const newDocument = { ...mockDocument, fileName: 'new.md' } as TextDocument

      await previewProvider.switchDocument(newDocument)

      // Should call postMessage for navigate
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webview:navigate',
          previewId: 'test-uuid-123',
          path: 'test-page',
        }),
      )
    })

    it('should handle case when pages directory is empty', async () => {
      const configWithoutPages = { ...mockConfig, pagesDirectory: '' }
      vi.mocked(getConfiguration).mockReturnValue(configWithoutPages)

      const newDocument = { ...mockDocument, fileName: 'new.md' } as TextDocument

      await previewProvider.switchDocument(newDocument)

      // Should not send navigate message, just update content
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webview:update:content',
        }),
      )
    })
  })

  describe('refreshPreview', () => {
    it('should show warning when no active document and no active preview', () => {
      previewProvider.refreshPreview()

      expect(window.showWarningMessage).toHaveBeenCalledWith(
        'No active document to preview. Open a Markdown or MDC file first.',
      )
    })

    it('should open preview when no active preview but active editor exists', () => {
      const activeEditor = { document: mockDocument }
      vi.mocked(window).activeTextEditor = activeEditor as any

      const openPreviewSpy = vi.spyOn(previewProvider, 'openPreview')
      previewProvider.refreshPreview()

      expect(openPreviewSpy).toHaveBeenCalledWith(mockDocument)
    })

    it('should send refresh message when active preview exists', async () => {
      await previewProvider.openPreview(mockDocument)

      previewProvider.refreshPreview()

      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webview:refresh',
          content: '# Test Content',
          previewId: 'test-uuid-123',
          path: 'test-page',
        }),
      )
    })

    it('should handle error path info and abort refresh', async () => {
      await previewProvider.openPreview(mockDocument)

      vi.mocked(getDocumentPathInfo).mockReturnValue({
        type: 'error',
        errorMessage: 'Invalid path',
      })

      previewProvider.refreshPreview()

      expect(debug.log).toHaveBeenCalledWith(
        'Cannot refresh preview due to error:',
        'Invalid path',
      )
    })
  })

  describe('updateContent', () => {
    it('should do nothing when no panel exists', async () => {
      await previewProvider.updateContent(mockDocument)

      expect(mockWebview.postMessage).not.toHaveBeenCalled()
    })

    it('should do nothing when no portal configuration is available', async () => {
      await previewProvider.openPreview(mockDocument)
      vi.mocked(mockStorageService.getSelectedPortal).mockResolvedValue(undefined)

      await previewProvider.updateContent(mockDocument)

      expect(debug.log).toHaveBeenCalledWith(
        'Cannot update content - no portal configuration available',
      )
    })

    it('should debounce content updates using configured delay', async () => {
      vi.useFakeTimers()
      await previewProvider.openPreview(mockDocument)

      // Clear previous postMessage calls
      vi.clearAllMocks()

      // Change the document content to ensure it's different
      vi.mocked(mockDocument.getText).mockReturnValue('# Updated Content')

      // Call updateContent
      await previewProvider.updateContent(mockDocument)

      // Should not post message immediately
      expect(mockWebview.postMessage).not.toHaveBeenCalled()

      // Fast-forward time by the update delay
      await vi.advanceTimersByTimeAsync(mockConfig.updateDelay)

      // Now should post message
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webview:update:content',
        }),
      )

      vi.useRealTimers()
    })

    it('should clear existing timeout when called multiple times', async () => {
      vi.useFakeTimers()
      await previewProvider.openPreview(mockDocument)
      vi.clearAllMocks()

      // Create a document with different content for each call
      const doc1 = { ...mockDocument, getText: vi.fn().mockReturnValue('# Content 1') } as TextDocument
      const doc2 = { ...mockDocument, getText: vi.fn().mockReturnValue('# Content 2') } as TextDocument

      // Call updateContent twice in succession with different content
      await previewProvider.updateContent(doc1)
      await previewProvider.updateContent(doc2)

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(mockConfig.updateDelay)

      // Should only post message once (second call cleared first timeout)
      expect(mockWebview.postMessage).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })

  describe('updateConfiguration', () => {
    it('should do nothing when no panel exists', async () => {
      await previewProvider.updateConfiguration(mockConfig)

      expect(debug.log).not.toHaveBeenCalled()
    })

    it('should regenerate webview when portal configuration is available', async () => {
      await previewProvider.openPreview(mockDocument)
      vi.clearAllMocks()

      await previewProvider.updateConfiguration(mockConfig)

      expect(debug.log).toHaveBeenCalledWith('Updating webview configuration:', {
        hasPortal: true,
        portalName: 'Test Portal',
      })
      expect(debug.log).toHaveBeenCalledWith(
        'Portal configuration available, regenerating webview content',
      )
    })
  })

  describe('dispose', () => {
    it('should dispose of all resources and clear state', async () => {
      await previewProvider.openPreview(mockDocument)

      // Mock disposables
      const mockDisposable = { dispose: vi.fn() }
      ;(previewProvider as any).disposables.push(mockDisposable)

      previewProvider.dispose()

      expect(mockDisposable.dispose).toHaveBeenCalled()
      expect(mockWebviewPanel.dispose).toHaveBeenCalled()
    })

    it('should clear update timeout when disposing', async () => {
      vi.useFakeTimers()
      await previewProvider.openPreview(mockDocument)

      // Trigger an update to create a timeout
      await previewProvider.updateContent(mockDocument)

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      previewProvider.dispose()

      expect(clearTimeoutSpy).toHaveBeenCalled()
      vi.useRealTimers()
    })
  })
})
