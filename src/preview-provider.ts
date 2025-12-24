import {
  ViewColumn,
  window,
  commands,
  env,
  Uri,
  workspace,
} from 'vscode'
import type { ExtensionContext, TextDocument, Disposable } from 'vscode'
import { basename, join } from 'path'
import { randomUUID } from 'uncrypto'
import type {
  PortalPreviewConfig,
  WebviewMessage,
  PreviewPanelState,
  WebviewRefreshMessage,
  WebviewLoadingMessage,
  WebviewUpdateContentMessage,
  WebviewNavigateMessage,
} from './types'
import type { PortalStorageService } from './storage'
import type { StoredPortalConfig } from './types/konnect'
import { getConfiguration } from './extension'
import { debug } from './utils/debug'
import { updatePreviewContext } from './utils/vscode-context'
import { WebviewTimeoutActions, TokenConfigurationActions } from './types/ui-actions'
import {
  generateWebviewHTML,
  loadWebviewCSS,
  loadWebviewJS,
} from './utils/webview'
import { getDocumentPathInfo } from './utils/page-path'

/** Manages the preview webview panel and handles content updates */
export class PreviewProvider implements Disposable {
  /** The webview panel type identifier */
  private static readonly viewType = 'portalPreview'

  /** Current state of the preview panel including visibility and active document */
  private panelState: PreviewPanelState = { isVisible: false }

  /** Timeout handle for debounced content updates */
  private updateTimeout: NodeJS.Timeout | undefined

  /** Collection of disposable resources to clean up */
  private disposables: Disposable[] = []

  /** Unique identifier for this preview instance */
  private previewId: string

  /** Tracks whether snippets have been injected for the current iframe instance */
  private snippetsInjected: boolean = false

  /**
   * Creates a new PreviewProvider instance
   * @param context VS Code extension context for accessing resources
   * @param storageService Service for managing portal configuration storage
   */
  constructor(
    private readonly context: ExtensionContext,
    private readonly storageService: PortalStorageService,
  ) {
    this.previewId = randomUUID()
  }

  /**
   * Opens a preview panel for the given document
   * Handles portal configuration check and auto-setup workflow
   */
  public async openPreview(document: TextDocument): Promise<void> {
    const config = getConfiguration()

    // First check if token is configured
    const hasToken = await this.storageService.hasValidToken()
    if (!hasToken) {
      // No token configured, show token configuration message
      const selection = await window.showWarningMessage(
        'No Konnect token configured. Please configure your Personal Access Token to continue.',
        TokenConfigurationActions.CONFIGURE_TOKEN,
        TokenConfigurationActions.LEARN_MORE,
      )

      if (selection === TokenConfigurationActions.CONFIGURE_TOKEN) {
        await commands.executeCommand('kong.konnect.devPortal.configureToken')
      } else if (selection === TokenConfigurationActions.LEARN_MORE) {
        await env.openExternal(Uri.parse('https://developer.konghq.com/konnect-api/#personal-access-tokens'))
      }
      return
    }

    // Token is configured, now check if we have a valid portal selected
    const portalConfig = await this.storageService.getSelectedPortal()
    if (!portalConfig) {
      // Token is configured but no portal selected, auto-trigger portal selection
      await commands.executeCommand('kong.konnect.devPortal.selectPortal')
      return
    }

    if (this.panelState.panel) {
      // Panel exists, just reveal it
      this.panelState.panel.reveal(ViewColumn.Beside)
      await this.updateContent(document)
    } else {
      // Create new panel
      await this.createWebviewPanel(document, config, portalConfig)
    }

    this.panelState.currentDocument = document
    this.panelState.isVisible = true
  }

  /** Checks if there is an active preview panel */
  public hasActivePreview(): boolean {
    return !!(this.panelState.panel && this.panelState.isVisible)
  }

  /** Switches the preview to show a different document */
  public async switchDocument(document: TextDocument): Promise<void> {
    if (!this.hasActivePreview()) {
      return
    }

    debug.log('Switching preview to new document:', document.fileName)

    // Update the current document reference
    this.panelState.currentDocument = document

    // Update the panel title to reflect the new document
    if (this.panelState.panel) {
      this.panelState.panel.title = `Portal Preview - ${basename(document.fileName)}`
    }

    // Get current configuration
    const config = getConfiguration()

    // Check if pages directory is configured and send navigation message if needed
    if (config.pagesDirectory && config.pagesDirectory.trim() !== '') {
      await this.sendNavigateMessage(document, config)

      // Send content update after 500ms delay
      setTimeout(async () => {
        await this.updateContent(document)
      }, 500)
    } else {
      // No pages directory configured, use regular update behavior
      await this.updateContent(document)
    }
  }

  /** Refreshes the preview by reloading the iframe, or opens preview if not already open */
  public refreshPreview(): void {
    // If no active preview panel, try to open one with the current active document
    if (!this.panelState.panel || !this.panelState.isVisible) {
      const activeEditor = window.activeTextEditor
      if (activeEditor) {
        this.openPreview(activeEditor.document)
        return
      } else {
        window.showWarningMessage('No active document to preview. Open a Markdown or MDC file first.')
        return
      }
    }

    // Get current document content to send after refresh
    const currentDocument = this.panelState.currentDocument
    if (!currentDocument) {
      window.showWarningMessage('No active document to refresh preview.')
      return
    }

    const content = currentDocument.getText().trim()
    const config = getConfiguration()
    const pathInfo = getDocumentPathInfo(currentDocument, config.pagesDirectory, config.snippetsDirectory)

    // Check for error condition and abort if present
    if (pathInfo.type === 'error') {
      debug.log('Cannot refresh preview due to error:', pathInfo.errorMessage)
      return
    }

    // Reset snippets flag since refresh will reload the iframe
    this.snippetsInjected = false

    const message: WebviewRefreshMessage = {
      type: 'webview:refresh',
      content,
      config,
      previewId: this.previewId,
      path: pathInfo.path,
      snippetName: pathInfo.snippetName,
    }

    this.panelState.panel.webview.postMessage(message)
  }

  /**
   * Recursively reads all .md and .mdc files from a directory
   */
  private async readAllSnippets(dirPath: string): Promise<Array<{ name: string, content: string }>> {
    const snippets: Array<{ name: string, content: string }> = []

    const readDir = async (path: string) => {
      try {
        const entries = await workspace.fs.readDirectory(Uri.file(path))

        for (const [name, type] of entries) {
          const fullPath = join(path, name)

          if (type === 2) {
            // Directory - recurse
            await readDir(fullPath)
          } else if (type === 1 && /\.(md|mdc)$/i.test(name)) {
            // File - read it
            const content = await workspace.fs.readFile(Uri.file(fullPath))
            const text = Buffer.from(content).toString('utf8').trim()
            const snippetName = name.replace(/\.(md|mdc)$/i, '').replace(/[^\w-]/g, '')

            if (snippetName && text) {
              snippets.push({ name: snippetName, content: text })
            }
          }
        }
      } catch {
        // Ignore errors for individual directories
      }
    }

    await readDir(dirPath)
    return snippets
  }

  /**
   * Injects all snippets from snippets directory into the iframe with delays between each
   * Called once when iframe becomes ready
   */
  private async injectAllSnippets(): Promise<void> {
    debug.log('injectAllSnippets called')

    // Only inject once per iframe instance
    if (this.snippetsInjected) {
      debug.log('Snippets already injected for this iframe instance, skipping')
      return
    }

    const config = getConfiguration()

    if (!config.snippetsDirectory || !this.panelState.panel) {
      debug.log('No snippets directory or panel available')
      return
    }

    const portalConfig = await this.storageService.getSelectedPortal()
    if (!portalConfig) {
      debug.log('No portal config available')
      return
    }

    const workspaceFolders = workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      debug.log('No workspace folders')
      return
    }

    const snippetsPath = join(workspaceFolders[0].uri.fsPath, config.snippetsDirectory.trim())

    try {
      const snippets = await this.readAllSnippets(snippetsPath)
      debug.log(`Found ${snippets.length} snippets to inject`)

      for (const snippet of snippets) {
        const message: WebviewUpdateContentMessage = {
          type: 'webview:update:content',
          content: snippet.content,
          config,
          portalConfig: { origin: portalConfig.origin },
          previewId: this.previewId,
          snippetName: snippet.name,
        }

        this.panelState.panel.webview.postMessage(message)

        // Small delay to allow iframe to process
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      debug.log('All snippets injected successfully')
      this.snippetsInjected = true
    } catch (error) {
      debug.log('Error injecting snippets:', error)
    }
  }

  /** Sends the current document content to the webview */
  private async sendCurrentContent(): Promise<void> {
    if (!this.panelState.panel || !this.panelState.currentDocument) {
      debug.log('Cannot send current content - no panel or document available')
      return
    }

    const config = getConfiguration()

    try {
      // Inject snippets first, then send current content
      await this.injectAllSnippets()

      // Force update by clearing lastContent so sendContentUpdate doesn't skip
      this.panelState.lastContent = undefined

      await this.sendContentUpdate(this.panelState.currentDocument, config)

      // Hide loading overlay after snippets and content have been sent
      const loadingMessage: WebviewLoadingMessage = {
        type: 'webview:loading',
        loading: false,
      }
      this.panelState.panel.webview.postMessage(loadingMessage)
    } catch (error) {
      debug.log('Error in sendCurrentContent:', error)
      // Still send current content even if snippets fail
      this.panelState.lastContent = undefined
      await this.sendContentUpdate(this.panelState.currentDocument, config)

      // Hide loading even if there was an error
      const loadingMessage: WebviewLoadingMessage = {
        type: 'webview:loading',
        loading: false,
      }
      this.panelState.panel.webview.postMessage(loadingMessage)
    }
  }

  /** Updates the content displayed in the webview */
  public async updateContent(document: TextDocument): Promise<void> {
    if (!this.panelState.panel || !this.panelState.isVisible) {
      return
    }

    // Check if we still have a valid portal configuration
    const portalConfig = await this.storageService.getSelectedPortal()
    if (!portalConfig) {
      debug.log('Cannot update content - no portal configuration available')
      return
    }

    // Clear existing timeout
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
    }

    const config = getConfiguration()

    // Debounce content updates
    this.updateTimeout = setTimeout(async () => {
      await this.sendContentUpdate(document, config)
    }, config.previewUpdateDelay)
  }

  /** Updates the configuration in the webview */
  public async updateConfiguration(config: PortalPreviewConfig): Promise<void> {
    if (!this.panelState.panel) {
      return
    }

    // Check if we have a portal configured
    const portalConfig = await this.storageService.getSelectedPortal()

    debug.log('Updating webview configuration:', {
      hasPortal: !!portalConfig,
      portalName: portalConfig?.displayName || 'none',
    })

    // If portal configuration changed, regenerate the entire webview
    if (portalConfig) {
      debug.log('Portal configuration available, regenerating webview content')

      // Clear cached content state since we're regenerating the webview
      this.panelState.lastContent = undefined

      // Regenerate the entire webview HTML with new portal config
      this.panelState.panel.webview.html = this.getWebviewContent(config, portalConfig, this.panelState.currentDocument)

      // If we have a current document, send the content
      if (this.panelState.currentDocument) {
        // Add a small delay to ensure the webview is ready
        setTimeout(() => {
          this.sendContentUpdate(this.panelState.currentDocument!, config, true)
        }, 100)
      }
    } else {
      // No portal configured, show message to user
      debug.log('No portal configuration available')
    }
  }

  /** Creates a new webview panel */
  private async createWebviewPanel(
    document: TextDocument,
    config: PortalPreviewConfig,
    portalConfig: StoredPortalConfig,
  ): Promise<void> {
    const panel = window.createWebviewPanel(
      PreviewProvider.viewType,
      `Portal Preview - ${basename(document.fileName)}`,
      { viewColumn: ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    )

    // Set webview HTML content
    panel.webview.html = this.getWebviewContent(config, portalConfig, document)

    // Handle panel disposal
    panel.onDidDispose(() => {
      this.panelState.panel = undefined
      this.panelState.isVisible = false
      this.panelState.currentDocument = undefined
      this.panelState.lastContent = undefined
      // Reset snippets flag so they'll be injected when panel is reopened
      this.snippetsInjected = false
      // Update VS Code context to reflect that preview is no longer active
      updatePreviewContext(false)
    }, null, this.disposables)

    // Handle panel view state changes (detects when panel is moved between windows)
    panel.onDidChangeViewState((event) => {
      debug.log('Webview panel view state changed - panel may have been moved to new window')

      // When panel becomes active/visible after a view state change, the iframe will reload
      // and the portal will send 'portal:preview:ready' again, triggering our existing content send logic
      // We just need to ensure we have the latest content ready
      if (event.webviewPanel.active && event.webviewPanel.visible && this.panelState.currentDocument) {
        debug.log('Panel is active and visible after view state change - ensuring current content is ready for portal ready signal')
        // The iframe is reloading, so we don't need to send content immediately
        // Just ensure our state is current - content will be sent when portal signals ready
        this.panelState.lastContent = this.panelState.currentDocument.getText().trim()
      }
    }, null, this.disposables)

    // Handle webview messages
    panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        this.handleWebviewMessage(message)
      },
      undefined,
      this.disposables,
    )

    this.panelState.panel = panel

    // Send initial content
    this.sendInitialContent(document, config)
  }

  /** Send initial content with proper error handling */
  private sendInitialContent(document: TextDocument, config: PortalPreviewConfig): void {
    this.sendContentUpdate(document, config, true).catch((error) => {
      console.error('Failed to send initial content:', error)
    })
  }

  /** Handle timeout warning with action buttons */
  private async handleTimeoutWarning(warning: string): Promise<void> {
    try {
      const selection = await window.showWarningMessage(
        `Konnect Portal: ${warning}`,
        WebviewTimeoutActions.OPEN_SETTINGS,
        WebviewTimeoutActions.REFRESH_PREVIEW,
      )

      if (selection === WebviewTimeoutActions.OPEN_SETTINGS) {
        await commands.executeCommand('workbench.action.openSettings', 'kong.konnect.devPortal')
      } else if (selection === WebviewTimeoutActions.REFRESH_PREVIEW) {
        await commands.executeCommand('kong.konnect.devPortal.refreshPreview')
      }
    } catch (error) {
      console.error('Failed to handle timeout warning:', error)
    }
  }

  /** Sends content update to the webview */
  private async sendContentUpdate(document: TextDocument, config: PortalPreviewConfig, isInitialLoad = false): Promise<void> {
    if (!this.panelState.panel) {
      debug.log('Cannot send content update - no panel available')
      return
    }

    // Get the current portal configuration
    const portalConfig = await this.storageService.getSelectedPortal()
    if (!portalConfig) {
      debug.log('Cannot send content update - no portal configuration available')
      return
    }

    const content = document.getText().trim()

    debug.log('Processing content update:', {
      fileName: document.fileName,
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      previewId: this.previewId,
      lastContentLength: this.panelState.lastContent?.length || 0,
    })

    // Only update if content has changed
    if (content === this.panelState.lastContent) {
      return
    }

    this.panelState.lastContent = content

    // Determine document type and calculate appropriate path/snippet info
    const pathInfo = getDocumentPathInfo(document, config.pagesDirectory, config.snippetsDirectory)

    // Check for error condition and abort if present
    if (pathInfo.type === 'error') {
      debug.log('Cannot send content update due to error:', pathInfo.errorMessage)
      return
    }

    // Send loading state only for initial loads
    if (isInitialLoad) {
      const loadingMessage: WebviewLoadingMessage = {
        type: 'webview:loading',
        loading: true,
      }
      this.panelState.panel.webview.postMessage(loadingMessage)
    }

    // Send content update with explicit content and previewId
    const contentUpdateMessage: WebviewUpdateContentMessage = {
      type: 'webview:update:content',
      content, // Ensure content is always included
      config,
      portalConfig: {
        origin: portalConfig.origin,
      },
      previewId: this.previewId, // Ensure previewId is always included
      path: pathInfo.path,
      snippetName: pathInfo.snippetName,
    }

    debug.log('Sending content update to webview:', {
      type: contentUpdateMessage.type,
      contentLength: contentUpdateMessage.content?.length || 0,
      previewId: contentUpdateMessage.previewId,
      path: contentUpdateMessage.path,
      snippetName: contentUpdateMessage.snippetName,
      documentType: pathInfo.type,
      hasConfig: !!contentUpdateMessage.config,
    })

    this.panelState.panel.webview.postMessage(contentUpdateMessage)
  }

  /** Sends a navigation message to the webview without content */
  private async sendNavigateMessage(document: TextDocument, config: PortalPreviewConfig): Promise<void> {
    if (!this.panelState.panel) {
      debug.log('Cannot send navigate message - no panel available')
      return
    }

    // Get the current portal configuration
    const portalConfig = await this.storageService.getSelectedPortal()
    if (!portalConfig) {
      debug.log('Cannot send navigate message - no portal configuration available')
      return
    }

    // Get document path info (path calculation considers both pages and snippets)
    const pathInfo = getDocumentPathInfo(document, config.pagesDirectory, config.snippetsDirectory)

    // Check for error condition and abort if present
    if (pathInfo.type === 'error') {
      debug.log('Cannot send navigate message due to error:', pathInfo.errorMessage)
      return
    }

    debug.log('Sending navigate message to webview:', {
      fileName: document.fileName,
      path: pathInfo.path,
      documentType: pathInfo.type,
      previewId: this.previewId,
    })

    // Send navigation message without content - always use path for navigation
    const navigateMessage: WebviewNavigateMessage = {
      type: 'webview:navigate',
      config,
      portalConfig: {
        origin: portalConfig.origin,
      },
      previewId: this.previewId,
      path: pathInfo.path || '/', // Use default path if none calculated
    }

    this.panelState.panel.webview.postMessage(navigateMessage)
  }

  /**
   * Handles messages received from the webview iframe
   * Processes error reports, warnings, and content requests from the portal
   */
  private handleWebviewMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'webview:error':
        if (message.error) {
          window.showErrorMessage(`Portal Preview Error: ${message.error}`)
        }
        break
      case 'webview:warning':
        if (message.warning) {
          if (message.warningType === 'timeout') {
            // Special handling for timeout warnings with action buttons
            this.handleTimeoutWarning(message.warning)
          } else {
            window.showWarningMessage(`Konnect Portal: ${message.warning}`)
          }
        }
        break
      case 'webview:request:content':
        // Portal is ready and requesting the current content
        this.sendCurrentContent().catch((error) => {
          debug.log('Error sending current content:', error)
        })
        break
      default:
        debug.log('Received unknown message from webview:', message)
        break
    }
  }

  /**
   * Generates the HTML content for the webview
   * @param config Portal preview configuration settings
   * @param portalConfig Portal-specific configuration
   * @param document Optional document to calculate page path for iframe URL
   * @returns Complete HTML content string for the webview
   */
  private getWebviewContent(config: PortalPreviewConfig, portalConfig: StoredPortalConfig, document?: TextDocument): string {
    const cssContent = loadWebviewCSS(this.context.extensionPath)
    const jsContent = loadWebviewJS(this.context.extensionPath, config, this.previewId)

    // Calculate the page path if document is provided
    let path = ''
    if (document) {
      const pathInfo = getDocumentPathInfo(document, config.pagesDirectory, config.snippetsDirectory)
      // Use empty path if there's an error (will show default portal page)
      path = pathInfo.type === 'error' ? '' : (pathInfo.path || '')
    }

    return generateWebviewHTML(this.context.extensionPath, portalConfig, this.previewId, cssContent, jsContent, path)
  }



  /** Disposes of the preview provider and cleans up resources */
  public dispose(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
    }

    if (this.panelState.panel) {
      this.panelState.panel.dispose()
    }

    // Dispose of all disposables
    this.disposables.forEach(disposable => disposable.dispose())
    this.disposables = []
  }
}
