import {
  commands,
  window,
  workspace,
  extensions,
} from 'vscode'
import type { ExtensionContext, TextDocument } from 'vscode'
import { PreviewProvider } from './preview-provider'
import type { PortalPreviewConfig } from './types'
import { debug } from './utils/debug'
import { updatePreviewContext } from './utils/vscode-context'
import { PortalStorageService } from './konnect/storage'
import { PortalSelectionService } from './konnect/portal-selection'
import { KonnectApiService } from './konnect/api'
import { showApiError } from './utils/error-handling'
import {
  PortalSelectionActions,
  TokenConfigurationActions,
  CredentialActions,
  MDCExtensionActions,
} from './types/ui-actions'

/** Global instance of the preview provider for managing webview panels */
let previewProvider: PreviewProvider | undefined

/** Global instance of the storage service for managing credentials and portal config */
let storageService: PortalStorageService | undefined

/** Global instance of the portal selection service for managing portal selection workflow */
let portalSelectionService: PortalSelectionService | undefined

/** Global reference to the extension context for accessing extension resources */
let extensionContext: ExtensionContext | undefined

/** Updates the VS Code context to reflect preview state */
function updatePreviewContextFromProvider(): void {
  const hasActivePreview = previewProvider?.hasActivePreview() ?? false
  updatePreviewContext(hasActivePreview)
}

/**
 * Checks if the MDC extension is installed and shows helpful message if not
 * @returns true if MDC extension is available, false otherwise
 */
async function checkMDCExtension(): Promise<boolean> {
  const mdcExtension = extensions.getExtension('Nuxt.mdc')

  if (!mdcExtension) {
    debug.log('MDC extension not found, Portal Preview will work with reduced functionality for .mdc files')
    return false
  }

  if (!mdcExtension.isActive) {
    debug.log('MDC extension found but not active, attempting to activate')
    try {
      await mdcExtension.activate()
      debug.log('MDC extension activated successfully')
    } catch (error) {
      debug.error('Failed to activate MDC extension:', error)
    }
  }

  return true
}

/** Shows a helpful notification about MDC extension for .mdc files */
function showMDCExtensionRecommendation(): void {
  void window
    .showInformationMessage(
      'For the best experience with MDC syntax, we recommend installing the MDC - Markdown Components extension.',
      MDCExtensionActions.INSTALL_EXTENSION,
      MDCExtensionActions.DONT_SHOW_AGAIN,
    )
    .then((selection) => {
      if (selection === MDCExtensionActions.INSTALL_EXTENSION) {
        commands.executeCommand('workbench.extensions.search', 'Nuxt.mdc')
      } else if (selection === MDCExtensionActions.DONT_SHOW_AGAIN) {
        // Store preference to not show again
        const config = workspace.getConfiguration('portalPreview')
        config.update('showMDCRecommendation', false, true)
      }
    })
}

/**
 * Activates the Portal Preview extension
 * Initializes services, registers commands, and sets up event listeners
 * @param context VS Code extension context for accessing extension resources
 */
export function activate(context: ExtensionContext) {
  debug.log('Portal Preview extension is now active.', undefined, true)

  // Store context for use in error handling
  extensionContext = context

  // Initialize services
  storageService = new PortalStorageService(context)
  portalSelectionService = new PortalSelectionService(storageService, context)

  // Register the preview provider
  previewProvider = new PreviewProvider(context, storageService)

  // Register preview commands
  const openPreviewCommand = commands.registerCommand(
    'portalPreview.openPreview',
    async () => {
      const activeEditor = window.activeTextEditor
      if (!activeEditor) {
        window.showWarningMessage('No active editor found')
        return
      }

      if (!isMarkdownOrMDC(activeEditor.document)) {
        window.showWarningMessage(
          'Portal Preview only supports Markdown (.md) and MDC (.mdc) files',
        )
        return
      }

      await previewProvider?.openPreview(activeEditor.document)
      updatePreviewContextFromProvider()
    },
  )

  const refreshPreviewCommand = commands.registerCommand(
    'portalPreview.refreshPreview',
    () => {
      previewProvider?.refreshPreview()
      updatePreviewContextFromProvider()
    },
  )

  // Register Konnect token commands
  const configureTokenCommand = commands.registerCommand(
    'portalPreview.configureToken',
    async () => {
      try {
        const token = await window.showInputBox({
          placeHolder: 'Enter your Konnect Personal Access Token',
          prompt: 'Please enter your Konnect Personal Access Token to connect to your portals',
          password: true,
          validateInput: (value) => {
            if (!value?.trim()) {
              return 'Token cannot be empty'
            }
            if (!KonnectApiService.validateTokenFormat(value)) {
              return 'Invalid token format. Konnect PATs should start with "kpat_"'
            }
            return undefined
          },
        })

        if (!token) {
          return
        }

        await storageService?.storeToken(token)
        window.showInformationMessage('Konnect token configured successfully!')

        // Prompt user to select portal after successful token configuration
        const selectPortal = await window.showInformationMessage(
          'Token configured! Would you like to select a portal now?',
          PortalSelectionActions.SELECT_PORTAL,
          PortalSelectionActions.LATER,
        )

        if (selectPortal === PortalSelectionActions.SELECT_PORTAL) {
          // Get the currently selected portal before selection
          const previousPortal = await storageService?.getSelectedPortal()

          // Perform portal selection
          const selectedPortal = await portalSelectionService?.selectPortal()

          // If a portal was successfully selected and it's different from the previous one,
          // reload the webview to use the new portal
          if (selectedPortal && previewProvider?.hasActivePreview()) {
            const isDifferentPortal = !previousPortal ||
              previousPortal.id !== selectedPortal.id ||
              previousPortal.origin !== selectedPortal.origin

            if (isDifferentPortal) {
              debug.log('Portal selection changed, reloading webview with new portal:', {
                previousPortal: previousPortal?.displayName || 'none',
                newPortal: selectedPortal.displayName,
              })

              // Update the webview configuration to use the new portal
              const config = getConfiguration()
              await previewProvider.updateConfiguration(config)
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        window.showErrorMessage(`Failed to configure token: ${errorMessage}`)
      }
    },
  )

  const selectPortalCommand = commands.registerCommand(
    'portalPreview.selectPortal',
    async () => {
      try {
        if (!await storageService?.hasValidToken()) {
          const configureToken = await window.showWarningMessage(
            'No Konnect token configured. Please configure your Personal Access Token to continue.',
            TokenConfigurationActions.CONFIGURE_TOKEN,
          )
          if (configureToken === TokenConfigurationActions.CONFIGURE_TOKEN) {
            await commands.executeCommand('portalPreview.configureToken')
          }
          return
        }

        // Get the currently selected portal before selection
        const previousPortal = await storageService?.getSelectedPortal()

        // Perform portal selection
        const selectedPortal = await portalSelectionService?.selectPortal()

        // If a portal was successfully selected and it's different from the previous one,
        // reload the webview to use the new portal
        if (selectedPortal && previewProvider?.hasActivePreview()) {
          const isDifferentPortal = !previousPortal ||
            previousPortal.id !== selectedPortal.id ||
            previousPortal.origin !== selectedPortal.origin

          if (isDifferentPortal) {
            debug.log('Portal selection changed, reloading webview with new portal:', {
              previousPortal: previousPortal?.displayName || 'none',
              newPortal: selectedPortal.displayName,
            })

            // Update the webview configuration to use the new portal
            const config = getConfiguration()
            await previewProvider.updateConfiguration(config)
          }
        }
      } catch (error) {
        await showApiError('Failed to select portal', error, extensionContext)
      }
    },
  )

  const clearCredentialsCommand = commands.registerCommand(
    'portalPreview.clearCredentials',
    async () => {
      try {
        const confirm = await window.showWarningMessage(
          'This will remove your stored Konnect token and portal selection. Are you sure?',
          { modal: true },
          CredentialActions.CLEAR_CREDENTIALS,
        )

        if (confirm === CredentialActions.CLEAR_CREDENTIALS) {
          await storageService?.clearAll()
          window.showInformationMessage('All credentials cleared successfully.')
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        window.showErrorMessage(`Failed to clear credentials: ${errorMessage}`)
      }
    },
  )

  // Listen for configuration changes
  const configChangeListener = workspace.onDidChangeConfiguration(
    async (event) => {
      if (event.affectsConfiguration('portalPreview')) {
        const config = getConfiguration()
        debug.log('Portal Preview configuration changed:', config)
        await previewProvider?.updateConfiguration(config)
      }
    },
  )

  // Listen for document changes
  const documentChangeListener = workspace.onDidChangeTextDocument(
    async (event) => {
      if (isMarkdownOrMDC(event.document)) {
        await previewProvider?.updateContent(event.document)
      }
    },
  )

  // Listen for active editor changes
  const editorChangeListener = window.onDidChangeActiveTextEditor(
    async (editor) => {
      if (editor && isMarkdownOrMDC(editor.document)) {
        // User switched to a different Markdown/MDC file

        // If there's already an active preview, switch to the new document
        if (previewProvider?.hasActivePreview()) {
          await previewProvider.switchDocument(editor.document)
        } else {
          // No active preview, check if we should auto-open for this new document
          const config = getConfiguration()
          if (config.autoOpen) {
            await previewProvider?.openPreview(editor.document)
          }
        }
      }
      // Note: We don't need to handle non-MDC/Markdown files as the preview
      // will remain open with the last viewed document
    },
  )

  // Register all disposables with the extension context
  context.subscriptions.push(
    openPreviewCommand,
    refreshPreviewCommand,
    configureTokenCommand,
    selectPortalCommand,
    clearCredentialsCommand,
    configChangeListener,
    documentChangeListener,
    editorChangeListener,
  )

  // Auto-open for active editor if autoOpen is enabled
  const activeEditor = window.activeTextEditor
  if (activeEditor && isMarkdownOrMDC(activeEditor.document)) {
    const config = getConfiguration()
    if (config.autoOpen) {
      void previewProvider.openPreview(activeEditor.document)
    }
  }
}

/**
 * Deactivates the Portal Preview extension
 * Cleans up resources but preserves stored credentials and data
 * Note: Use "Portal Preview: Clear Credentials" command to manually clear stored data
 */
export function deactivate() {
  // Dispose of preview provider and clean up resources
  previewProvider?.dispose()

  // Clear global references
  previewProvider = undefined
  storageService = undefined
  portalSelectionService = undefined
  extensionContext = undefined

  debug.log('Portal Preview extension is now deactivated.')
}

/**
 * Checks if the document is a Markdown or MDC file and shows MDC extension recommendation if needed
 * @param document - The VS Code document to check
 * @returns true if the document is a supported file type, false otherwise
 */
function isMarkdownOrMDC(document: TextDocument): boolean {
  const language = document.languageId
  const fileName = document.fileName.toLowerCase()

  debug.log('Checking file type:', {
    fileName: document.fileName,
    languageId: language,
    fileExtension: fileName.substring(fileName.lastIndexOf('.')),
  })

  const isMDCFile = fileName.endsWith('.mdc') || language === 'mdc'
  const isMarkdownFile = fileName.endsWith('.md') || language === 'markdown' || language === 'md'

  // For supported file types, check if we should recommend the MDC extension
  if (isMDCFile || isMarkdownFile) {
    // Check for MDC extension asynchronously but don't block file type determination
    void checkMDCExtension().then((hasMDCExtension) => {
      if (!hasMDCExtension) {
        // Show recommendation for both MDC and Markdown files to enhance syntax highlighting
        const config = workspace.getConfiguration('portalPreview')
        const showRecommendation = config.get<boolean>('showMDCRecommendation', true)
        if (showRecommendation) {
          showMDCExtensionRecommendation()
        }
      }
    })
    return true // Allow preview for both file types regardless of MDC extension
  }

  return false
}

/**
 * Gets the current extension configuration
 * @returns The current portal preview configuration
 */
export function getConfiguration(): PortalPreviewConfig {
  const config = workspace.getConfiguration('portalPreview')

  return {
    autoOpen: config.get<boolean>('autoOpen', false),
    updateDelay: config.get<number>('updateDelay', 500),
    readyTimeout: config.get<number>('readyTimeout', 5000),
    debug: config.get<boolean>('debug', false),
    showMDCRecommendation: config.get<boolean>('showMDCRecommendation', true),
    pagesDirectory: config.get<string>('pagesDirectory', 'pages'),
    snippetsDirectory: config.get<string>('snippetsDirectory', 'snippets'),
  }
}
