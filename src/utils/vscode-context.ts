import { commands } from 'vscode'
import { debug } from './debug'

/** Updates the VS Code context to reflect preview state */
export function updatePreviewContext(hasActivePreview: boolean): void {
  commands.executeCommand('setContext', 'portalPreview.hasActivePreview', hasActivePreview)
  debug.log('Updated preview context:', { hasActivePreview })
}
