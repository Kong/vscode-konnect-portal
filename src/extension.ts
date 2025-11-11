import {
  commands,
  window,
  workspace,
  extensions,
  env,
  Uri,
} from 'vscode'
import type { Terminal } from 'vscode'
import type { ExtensionContext, TextDocument } from 'vscode'
import { PreviewProvider } from './preview-provider'
import type { PortalPreviewConfig } from './types'
import { debug } from './utils/debug'
import { updatePreviewContext } from './utils/vscode-context'
import { PortalStorageService } from './storage'
import { PortalSelectionService } from './portal-selection'
import { KonnectApiService } from './konnect/api'
import { showApiError } from './utils/error-handling'
import {
  PortalSelectionActions,
  TokenConfigurationActions,
  CredentialActions,
  MDCExtensionActions,
} from './types/ui-actions'
import { CONFIG_SECTION } from './constants/config'
import { KONGCTL_TERMINAL_NAME } from './constants/kongctl'
import { checkAndNotifyKongctlAvailability, showKongctlAvailableMessage, showKongctlDiagnostics } from './kongctl/feedback'
import { installKongctlWithFeedback } from './kongctl/install'
import { checkKongctlAvailable } from './kongctl/status'

/** Global instance of the preview provider for managing webview panels */
let previewProvider: PreviewProvider | undefined

/** Global instance of the storage service for managing credentials and portal config */
let storageService: PortalStorageService | undefined

/** Global instance of the portal selection service for managing portal selection workflow */
let portalSelectionService: PortalSelectionService | undefined


/** Global reference to the extension context for accessing extension resources */
let extensionContext: ExtensionContext | undefined

/** Global instance of the kongctl terminal for reuse */
let kongctlTerminal: Terminal | undefined

/**
 * Gets or creates the shared kongctl terminal instance
 * @param env Optional environment variables to set for the terminal
 * @returns The kongctl terminal instance
 */
export function getOrCreateKongctlTerminal(env?: Record<string, string | undefined>): Terminal {
  let recreate = false
  if (kongctlTerminal) {
    // If terminal is disposed, recreate
    try {
      // If terminal is disposed, VS Code throws on .name
      if (kongctlTerminal.name !== KONGCTL_TERMINAL_NAME) {
        recreate = true
      }
    } catch {
      recreate = true
    }
  }

  if (!kongctlTerminal || recreate) {
    if (kongctlTerminal) {
      try {
        kongctlTerminal.dispose()
      } catch {
        // Ignore errors on dispose
      }
    }
    kongctlTerminal = window.createTerminal({
      name: KONGCTL_TERMINAL_NAME,
      shellPath: process.env.SHELL || undefined,
      env,
    })
  }

  return kongctlTerminal
}



/** Updates the VS Code context to reflect preview state */
function updatePreviewContextFromProvider(): void {
  const hasActivePreview = previewProvider?.hasActivePreview() ?? false
  updatePreviewContext(hasActivePreview)
}

/**
 * Checks if there's an active document that can be previewed
 * @returns true if there's an active markdown or MDC document, false otherwise
 */
function hasActivePreviewableDocument(): boolean {
  const activeEditor = window.activeTextEditor
  return activeEditor && (
    activeEditor.document.languageId === 'markdown' ||
    activeEditor.document.languageId === 'md' ||
    activeEditor.document.languageId === 'mdc' ||
    activeEditor.document.fileName.endsWith('.mdc') ||
    activeEditor.document.fileName.endsWith('.md')
  ) || false
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
async function showMDCExtensionRecommendation(): Promise<void> {
  const selection = await window.showInformationMessage(
    'For the best experience with MDC syntax, we recommend installing the MDC - Markdown Components extension.',
    MDCExtensionActions.INSTALL_EXTENSION,
    MDCExtensionActions.DONT_SHOW_AGAIN,
  )

  if (selection === MDCExtensionActions.INSTALL_EXTENSION) {
    await commands.executeCommand('workbench.extensions.search', 'Nuxt.mdc')
  } else if (selection === MDCExtensionActions.DONT_SHOW_AGAIN) {
    // Store preference to not show again
    const config = workspace.getConfiguration(CONFIG_SECTION)
    await config.update('showMDCRecommendation', false, true)
  }
}

/** Initialize kongctl context with proper error handling */
function initializeKongctlContext(): void {
  updateKongctlContext().catch((error) => {
    console.error('Failed to initialize kongctl context:', error)
  })
}

/** Check MDC extension and show recommendation if needed */
async function checkAndShowMDCRecommendation(): Promise<void> {
  try {
    const hasMDCExtension = await checkMDCExtension()
    if (!hasMDCExtension) {
      // Show recommendation for both MDC and Markdown files to enhance syntax highlighting
      const config = workspace.getConfiguration(CONFIG_SECTION)
      const showRecommendation = config.get<boolean>('showMDCRecommendation', true)
      if (showRecommendation) {
        await showMDCExtensionRecommendation()
      }
    }
  } catch (error) {
    console.error('Failed to check MDC extension or show recommendation:', error)
  }
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
    'kong.konnect.devPortal.openPreview',
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
    'kong.konnect.devPortal.refreshPreview',
    () => {
      previewProvider?.refreshPreview()
      updatePreviewContextFromProvider()
    },
  )

  // Register Konnect token commands
  const configureTokenCommand = commands.registerCommand(
    'kong.konnect.devPortal.configureToken',
    async () => {
      try {
        const token = await window.showInputBox({
          placeHolder: 'Enter your Konnect Personal Access Token',
          prompt: 'Please enter your Konnect Personal Access Token (PAT)',
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

        // Check if there's an active document that can be previewed
        if (hasActivePreviewableDocument()) {
          // Automatically open preview for the active document
          debug.log('Auto-opening preview for active document after token configuration')
          await commands.executeCommand('kong.konnect.devPortal.openPreview')
          return
        }

        // No active document to preview, prompt user to select portal
        const selectPortal = await window.showInformationMessage(
          'Token configured! Would you like to select a portal now?',
          PortalSelectionActions.SELECT_PORTAL,
          PortalSelectionActions.LATER,
        )

        if (selectPortal === PortalSelectionActions.SELECT_PORTAL) {
          // Use the dedicated selectPortal command for consistency
          await commands.executeCommand('kong.konnect.devPortal.selectPortal')
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        window.showErrorMessage(`Failed to configure token: ${errorMessage}`)
      }
    },
  )

  const selectPortalCommand = commands.registerCommand(
    'kong.konnect.devPortal.selectPortal',
    async () => {
      try {
        if (!await storageService?.hasValidToken()) {
          const action = await window.showWarningMessage(
            'No Konnect token configured. Please configure your Personal Access Token to continue.',
            TokenConfigurationActions.CONFIGURE_TOKEN,
            TokenConfigurationActions.LEARN_MORE,
          )
          if (action === TokenConfigurationActions.CONFIGURE_TOKEN) {
            await commands.executeCommand('kong.konnect.devPortal.configureToken')
          } else if (action === TokenConfigurationActions.LEARN_MORE) {
            await env.openExternal(Uri.parse('https://developer.konghq.com/konnect-api/#personal-access-tokens'))
          }
          return
        }

        // Get the currently selected portal before selection
        const previousPortal = await storageService?.getSelectedPortal()

        // Perform portal selection
        const selectedPortal = await portalSelectionService?.selectPortal()

        // If a portal was successfully selected, handle the update
        if (selectedPortal) {
          const isDifferentPortal = !previousPortal ||
            previousPortal.id !== selectedPortal.id ||
            previousPortal.origin !== selectedPortal.origin

          if (previewProvider?.hasActivePreview()) {
            // If there's already an active preview, update it with the new portal
            if (isDifferentPortal) {
              debug.log('Portal selection changed, reloading webview with new portal:', {
                previousPortal: previousPortal?.displayName || 'none',
                newPortal: selectedPortal.displayName,
              })

              // Update the webview configuration to use the new portal
              const config = getConfiguration()
              await previewProvider.updateConfiguration(config)
            }
          } else {
            // No active preview, check if there's an active document that can be previewed
            if (hasActivePreviewableDocument()) {
              // Automatically open preview for the active document
              debug.log('Auto-opening preview for active document after portal selection')
              await commands.executeCommand('kong.konnect.devPortal.openPreview')
            }
          }
        }
      } catch (error) {
        await showApiError('Failed to select portal', error, extensionContext)
      }
    },
  )

  const deleteTokenCommand = commands.registerCommand(
    'kong.konnect.devPortal.deleteToken',
    async () => {
      try {
        const confirm = await window.showWarningMessage(
          'This will remove your stored Konnect token and portal selection. Are you sure?',
          { modal: true },
          CredentialActions.DELETE_TOKEN,
        )

        if (confirm === CredentialActions.DELETE_TOKEN) {
          await storageService?.clearAll()
          window.showInformationMessage('All credentials cleared successfully.')
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        window.showErrorMessage(`Failed to clear credentials: ${errorMessage}`)
      }
    },
  )

  // Register kongctl status check command
  const checkKongctlStatusCommand = commands.registerCommand(
    'kong.konnect.kongctl.checkStatus',
    async () => {
      try {
        const isAvailable = await checkAndNotifyKongctlAvailability()
        // Update context after checking status
        await commands.executeCommand('setContext', 'kong.konnect.kongctl.available', isAvailable)
        if (isAvailable) {
          await showKongctlAvailableMessage()
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        window.showErrorMessage(`Failed to check kongctl status: ${errorMessage}`)
      }
    },
  )

  // Register kongctl diagnostics command
  const showKongctlDiagnosticsCommand = commands.registerCommand(
    'kong.konnect.kongctl.showDiagnostics',
    async () => {
      try {
        await showKongctlDiagnostics()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        window.showErrorMessage(`Failed to show kongctl diagnostics: ${errorMessage}`)
      }
    },
  )

  // Register kongctl install command
  const installKongctlCommand = commands.registerCommand(
    'kong.konnect.kongctl.install',
    async () => {
      await installKongctlWithFeedback(extensionContext)
    },
  )

  // Register kongctl run command
  const runKongctlCommand = commands.registerCommand(
    'kong.konnect.kongctl.run',
    async () => {
      const commandPattern = new RegExp(/^kongctl\s*/i)

      // Prompt user for kongctl arguments
      const userInput = await window.showInputBox({
        prompt: 'Enter kongctl command arguments',
        placeHolder: 'api get /v3/portals --output json',
        validateInput: (value) => {
          if (value.trim().startsWith('kongctl')) {
            return 'Please enter only the command arguments, "kongctl" will be prefixed automatically'
          }

          return value.trim().replace(commandPattern, '') ? undefined : 'Command arguments cannot be empty'
        },
      })
      if (!userInput) return

      // Build the full command with kongctl prefix
      const fullCommand = `kongctl ${userInput.trim().replace(commandPattern, '')}`

      // Get stored token if available and include in environment
      const env = { ...process.env }
      try {
        if (storageService && await storageService.hasValidToken()) {
          const token = await storageService.getToken()
          if (token) {
            env.KONGCTL_DEFAULT_KONNECT_PAT = token
          }
        }
      } catch {
        // Silently continue without token if there's an error
      }

      // Get or create the shared kongctl terminal
      const terminal = getOrCreateKongctlTerminal(env)
      terminal.show(true)
      terminal.sendText(fullCommand, true)
    },
  )

  // Listen for configuration changes
  const configChangeListener = workspace.onDidChangeConfiguration(
    async (event) => {
      try {
        if (event.affectsConfiguration(CONFIG_SECTION)) {
          const config = getConfiguration()
          debug.log('Portal Preview configuration changed:', config)
          await previewProvider?.updateConfiguration(config)
        }

        // Update kongctl context if kongctl configuration changed
        if (event.affectsConfiguration('kong.konnect.kongctl')) {
          await updateKongctlContext()
        }
      } catch (error) {
        console.error('Failed to handle configuration change:', error)
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
          if (config.autoOpenPreview) {
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
    deleteTokenCommand,
    checkKongctlStatusCommand,
    showKongctlDiagnosticsCommand,
    installKongctlCommand,
    runKongctlCommand,
    configChangeListener,
    documentChangeListener,
    editorChangeListener,
  )


  // Set initial kongctl context
  initializeKongctlContext()

  // Auto-open for active editor if autoOpenPreview is enabled
  const activeEditor = window.activeTextEditor
  if (activeEditor && isMarkdownOrMDC(activeEditor.document)) {
    const config = getConfiguration()
    if (config.autoOpenPreview) {
      // Fire-and-forget auto-open with proper error handling
      previewProvider.openPreview(activeEditor.document).catch((error) => {
        console.error('Failed to auto-open preview:', error)
      })
    }
  }
}

/**
 * Updates the kongctl context to show/hide commands based on CLI availability
 */
export async function updateKongctlContext(): Promise<void> {
  try {
    const isAvailable = await checkKongctlAvailable()
    await commands.executeCommand('setContext', 'kong.konnect.kongctl.available', isAvailable)
  } catch {
    await commands.executeCommand('setContext', 'kong.konnect.kongctl.available', false)
  }
}

/**
 * Deactivates the Portal Preview extension
 * Cleans up resources but preserves stored credentials and data
 * Note: Use "Konnect Portal: Clear Credentials" command to manually clear stored data
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
    checkAndShowMDCRecommendation()
    return true // Allow preview for both file types regardless of MDC extension
  }

  return false
}

/**
 * Gets the current extension configuration
 * @returns The current portal preview configuration
 */
export function getConfiguration(): PortalPreviewConfig {
  const config = workspace.getConfiguration(CONFIG_SECTION)

  return {
    autoOpenPreview: config.get<boolean>('autoOpenPreview', false),
    previewUpdateDelay: config.get<number>('previewUpdateDelay', 500),
    readyTimeout: config.get<number>('readyTimeout', 5000),
    debug: config.get<boolean>('debug', false),
    showMDCRecommendation: config.get<boolean>('showMDCRecommendation', true),
    pagesDirectory: config.get<string>('pagesDirectory', 'pages'),
    snippetsDirectory: config.get<string>('snippetsDirectory', 'snippets'),
  }
}
