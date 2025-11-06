import {
  ViewColumn,
  window,
  commands,
  env,
  Uri,
} from 'vscode'
import type { ExtensionContext, TextDocument, Disposable } from 'vscode'
import { basename } from 'path'
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
import type { PortalStorageService } from './konnect/storage'
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
      void window
        .showWarningMessage(
          'No Konnect token configured. Please configure your Personal Access Token to continue.',
          TokenConfigurationActions.CONFIGURE_TOKEN,
          TokenConfigurationActions.LEARN_MORE,
        )
        .then((selection) => {
          if (selection === TokenConfigurationActions.CONFIGURE_TOKEN) {
            commands.executeCommand('kong.konnect.portal.configureToken')
          } else if (selection === TokenConfigurationActions.LEARN_MORE) {
            env.openExternal(Uri.parse('https://developer.konghq.com/konnect-api/#personal-access-tokens'))
          }
        })
      return
    }

    // Token is configured, now check if we have a valid portal selected
    const portalConfig = await this.storageService.getSelectedPortal()
    if (!portalConfig) {
      // Token is configured but no portal selected, auto-trigger portal selection
      await commands.executeCommand('kong.konnect.portal.selectPortal')
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

  /** Sends the current document content to the webview */
  private sendCurrentContent(): void {
    if (!this.panelState.panel || !this.panelState.currentDocument) {
      debug.log('Cannot send current content - no panel or document available')
      return
    }

    const config = getConfiguration()

    // Force update by clearing lastContent so sendContentUpdate doesn't skip
    this.panelState.lastContent = undefined

    this.sendContentUpdate(this.panelState.currentDocument, config)
    // Content will be updated by sendContentUpdate, so no need to manually restore lastContent
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
    }, config.updateDelay)
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
      ViewColumn.Beside,
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
    void this.sendContentUpdate(document, config, true)
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
            void window
              .showWarningMessage(
                `Portal Preview: ${message.warning}`,
                WebviewTimeoutActions.OPEN_SETTINGS,
                WebviewTimeoutActions.REFRESH_PREVIEW,
              )
              .then((selection) => {
                if (selection === WebviewTimeoutActions.OPEN_SETTINGS) {
                  commands.executeCommand('workbench.action.openSettings', 'portalPreview')
                } else if (selection === WebviewTimeoutActions.REFRESH_PREVIEW) {
                  commands.executeCommand('kong.konnect.portal.refreshPreview')
                }
              })
          } else {
            window.showWarningMessage(`Portal Preview: ${message.warning}`)
          }
        }
        break
      case 'webview:request:content':
        // Portal is ready and requesting the current content
        this.sendCurrentContent()
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
