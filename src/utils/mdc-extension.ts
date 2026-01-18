import {
  commands,
  window,
  workspace,
  extensions,
} from 'vscode'
import { debug } from './debug'
import { MDCExtensionActions } from '../types/ui-actions'
import { CONFIG_SECTION } from '../constants/config'

/**
 * The ID of the MDC extension
 */
const MDC_EXTENSION_ID = 'Nuxt.mdc'

/**
 * Syncs MDC extension settings with the portal origin
 * Configures component metadata URL and enables completions
 * @param origin - The portal origin URL (e.g., https://example.com)
 */
export async function syncMDCSettings(origin: string): Promise<void> {
  try {
    const config = workspace.getConfiguration()
    const componentMetadataURL = `${origin}/api/components/mdc`

    debug.log('Syncing MDC extension settings:', {
      componentMetadataURL,
      enableCompletions: true,
    })

    await config.update('mdc.componentMetadataURL', componentMetadataURL, true)
    await config.update('mdc.enableComponentMetadataCompletions', true, true)

    debug.log('MDC extension settings synced successfully')
  } catch (error) {
    debug.error('Failed to sync MDC extension settings:', error)
    // Silent failure - don't block portal selection if settings update fails
  }
}

/**
 * Checks if the MDC extension is installed and active
 * @returns true if MDC extension is available, false otherwise
 */
export async function checkMDCExtension(): Promise<boolean> {
  const mdcExtension = extensions.getExtension(MDC_EXTENSION_ID)

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

/**
 * Shows a helpful notification about MDC extension
 * @param origin - Optional portal origin to enable component completions configuration
 */
export async function showMDCExtensionRecommendation(origin?: string): Promise<void> {
  const message = origin
    ? 'Installing the MDC extension will enable component auto-completions for your portal content.'
    : 'For the best experience with MDC syntax, we recommend installing the MDC - Markdown Components extension.'

  const selection = await window.showInformationMessage(
    message,
    MDCExtensionActions.INSTALL_EXTENSION,
    MDCExtensionActions.DONT_SHOW_AGAIN,
  )

  if (selection === MDCExtensionActions.INSTALL_EXTENSION) {
    // If origin is provided, sync settings immediately before opening marketplace
    if (origin) {
      await syncMDCSettings(origin)
    }

    await commands.executeCommand('workbench.extensions.search', MDC_EXTENSION_ID)
  } else if (selection === MDCExtensionActions.DONT_SHOW_AGAIN) {
    // Store preference to not show again
    const config = workspace.getConfiguration(CONFIG_SECTION)
    await config.update('showMDCRecommendation', false, true)
  }
}

/**
 * Check MDC extension and show recommendation if needed
 * Used for general file opening (not portal-specific)
 */
export async function checkAndShowMDCRecommendation(): Promise<void> {
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
 * Checks if MDC extension is installed and syncs settings, or prompts for installation
 * Used when portal is selected to configure component completions
 * @param origin - The portal origin URL
 */
export async function checkAndPromptMDCExtensionForPortal(origin: string): Promise<void> {
  try {
    const hasMDCExtension = await checkMDCExtension()

    if (hasMDCExtension) {
      // Extension is installed, sync settings silently
      await syncMDCSettings(origin)
    } else {
      // Extension not installed, check if we should prompt
      const config = workspace.getConfiguration(CONFIG_SECTION)
      const showRecommendation = config.get<boolean>('showMDCRecommendation', true)

      if (showRecommendation) {
        await showMDCExtensionRecommendation(origin)
      }
    }
  } catch (error) {
    debug.error('Failed to check MDC extension or sync settings for portal:', error)
    // Silent failure - don't block portal selection
  }
}
