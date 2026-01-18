import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { commands, window, workspace, extensions } from 'vscode'
import type { WorkspaceConfiguration, Extension } from 'vscode'
import {
  syncMDCSettings,
  checkMDCExtension,
  showMDCExtensionRecommendation,
  checkAndShowMDCRecommendation,
  checkAndPromptMDCExtensionForPortal,
} from './mdc-extension'
import { debug } from './debug'
import { MDCExtensionActions } from '../types/ui-actions'
import { CONFIG_SECTION } from '../constants/config'

// Mock VS Code module
vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  window: {
    showInformationMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(),
  },
  extensions: {
    getExtension: vi.fn(),
  },
}))

// Mock the debug module
vi.mock('./debug', () => ({
  debug: {
    log: vi.fn(),
    error: vi.fn(),
  },
}))

describe('mdc-extension', () => {
  let mockConfig: Partial<WorkspaceConfiguration>

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock configuration
    mockConfig = {
      get: vi.fn((key: string, defaultValue?: any) => {
        if (key === 'showMDCRecommendation') return true
        return defaultValue
      }),
      update: vi.fn().mockResolvedValue(undefined),
      has: vi.fn(() => true),
      inspect: vi.fn(() => ({ key: '', defaultValue: undefined })),
    }

    vi.mocked(workspace.getConfiguration).mockReturnValue(mockConfig as WorkspaceConfiguration)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('syncMDCSettings', () => {
    it('should update mdc.componentMetadataURL with correct URL format', async () => {
      const origin = 'https://example.konghq.com'

      await syncMDCSettings(origin)

      expect(vi.mocked(workspace.getConfiguration)).toHaveBeenCalled()
      expect(mockConfig.update).toHaveBeenCalledWith(
        'mdc.componentMetadataURL',
        'https://example.konghq.com/api/components/mdc',
        true,
      )
    })

    it('should enable component metadata completions', async () => {
      const origin = 'https://example.konghq.com'

      await syncMDCSettings(origin)

      expect(mockConfig.update).toHaveBeenCalledWith(
        'mdc.enableComponentMetadataCompletions',
        true,
        true,
      )
    })

    it('should use global scope for settings updates', async () => {
      const origin = 'https://example.konghq.com'

      await syncMDCSettings(origin)

      // Third parameter should be true for global scope
      const updateCalls = vi.mocked(mockConfig.update!).mock.calls
      expect(updateCalls[0][2]).toBe(true)
      expect(updateCalls[1][2]).toBe(true)
    })

    it('should handle origins without trailing slash', async () => {
      const origin = 'https://example.konghq.com'

      await syncMDCSettings(origin)

      expect(mockConfig.update).toHaveBeenCalledWith(
        'mdc.componentMetadataURL',
        'https://example.konghq.com/api/components/mdc',
        true,
      )
    })

    it('should handle origins with trailing slash', async () => {
      const origin = 'https://example.konghq.com/'

      await syncMDCSettings(origin)

      expect(mockConfig.update).toHaveBeenCalledWith(
        'mdc.componentMetadataURL',
        'https://example.konghq.com//api/components/mdc',
        true,
      )
    })

    it('should log debug messages on success', async () => {
      const origin = 'https://example.konghq.com'

      await syncMDCSettings(origin)

      expect(vi.mocked(debug.log)).toHaveBeenCalledWith('Syncing MDC extension settings:', {
        componentMetadataURL: 'https://example.konghq.com/api/components/mdc',
        enableCompletions: true,
      })
      expect(vi.mocked(debug.log)).toHaveBeenCalledWith('MDC extension settings synced successfully')
    })

    it('should handle errors silently and log them', async () => {
      const origin = 'https://example.konghq.com'
      const error = new Error('Update failed')
      mockConfig.update = vi.fn().mockRejectedValue(error)

      await expect(syncMDCSettings(origin)).resolves.not.toThrow()

      expect(vi.mocked(debug.error)).toHaveBeenCalledWith(
        'Failed to sync MDC extension settings:',
        error,
      )
    })
  })

  describe('checkMDCExtension', () => {
    it('should return true when MDC extension is installed and active', async () => {
      const mockExtension = {
        isActive: true,
        activate: vi.fn(),
      } as unknown as Extension<any>

      vi.mocked(extensions.getExtension).mockReturnValue(mockExtension)

      const result = await checkMDCExtension()

      expect(result).toBe(true)
      expect(extensions.getExtension).toHaveBeenCalledWith('Nuxt.mdc')
      expect(mockExtension.activate).not.toHaveBeenCalled()
    })

    it('should activate extension if installed but not active', async () => {
      const mockExtension = {
        isActive: false,
        activate: vi.fn().mockResolvedValue(undefined),
      } as unknown as Extension<any>

      vi.mocked(extensions.getExtension).mockReturnValue(mockExtension)

      const result = await checkMDCExtension()

      expect(result).toBe(true)
      expect(mockExtension.activate).toHaveBeenCalled()
      expect(vi.mocked(debug.log)).toHaveBeenCalledWith('MDC extension activated successfully')
    })

    it('should return false when MDC extension is not installed', async () => {
      vi.mocked(extensions.getExtension).mockReturnValue(undefined)

      const result = await checkMDCExtension()

      expect(result).toBe(false)
      expect(vi.mocked(debug.log)).toHaveBeenCalledWith(
        'MDC extension not found, Portal Preview will work with reduced functionality for .mdc files',
      )
    })

    it('should handle activation errors gracefully', async () => {
      const activationError = new Error('Activation failed')
      const mockExtension = {
        isActive: false,
        activate: vi.fn().mockRejectedValue(activationError),
      } as unknown as Extension<any>

      vi.mocked(extensions.getExtension).mockReturnValue(mockExtension)

      const result = await checkMDCExtension()

      expect(result).toBe(true) // Still returns true because extension is installed
      expect(vi.mocked(debug.error)).toHaveBeenCalledWith(
        'Failed to activate MDC extension:',
        activationError,
      )
    })
  })

  describe('showMDCExtensionRecommendation', () => {
    it('should show standard message when origin is not provided', async () => {
      vi.mocked(window.showInformationMessage).mockResolvedValue(undefined)

      await showMDCExtensionRecommendation()

      expect(vi.mocked(window.showInformationMessage)).toHaveBeenCalledWith(
        'For the best experience with MDC syntax, we recommend installing the MDC - Markdown Components extension.',
        MDCExtensionActions.INSTALL_EXTENSION,
        MDCExtensionActions.DONT_SHOW_AGAIN,
      )
    })

    it('should show portal-specific message when origin is provided', async () => {
      vi.mocked(window.showInformationMessage).mockResolvedValue(undefined)

      await showMDCExtensionRecommendation('https://example.konghq.com')

      expect(vi.mocked(window.showInformationMessage)).toHaveBeenCalledWith(
        'Installing the MDC extension will enable component auto-completions for your portal content.',
        MDCExtensionActions.INSTALL_EXTENSION,
        MDCExtensionActions.DONT_SHOW_AGAIN,
      )
    })

    it('should sync settings and open marketplace when user clicks Install with origin', async () => {
      const origin = 'https://example.konghq.com'
      vi.mocked(window.showInformationMessage).mockResolvedValue(MDCExtensionActions.INSTALL_EXTENSION as any)
      vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

      await showMDCExtensionRecommendation(origin)

      expect(mockConfig.update).toHaveBeenCalledWith(
        'mdc.componentMetadataURL',
        'https://example.konghq.com/api/components/mdc',
        true,
      )
      expect(mockConfig.update).toHaveBeenCalledWith(
        'mdc.enableComponentMetadataCompletions',
        true,
        true,
      )
      expect(vi.mocked(commands.executeCommand)).toHaveBeenCalledWith(
        'workbench.extensions.search',
        'Nuxt.mdc',
      )
    })

    it('should open marketplace without syncing settings when origin is not provided', async () => {
      vi.mocked(window.showInformationMessage).mockResolvedValue(MDCExtensionActions.INSTALL_EXTENSION as any)
      vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

      await showMDCExtensionRecommendation()

      expect(mockConfig.update).not.toHaveBeenCalled()
      expect(vi.mocked(commands.executeCommand)).toHaveBeenCalledWith(
        'workbench.extensions.search',
        'Nuxt.mdc',
      )
    })

    it('should update showMDCRecommendation setting when user clicks Don\'t Show Again', async () => {
      vi.mocked(window.showInformationMessage).mockResolvedValue(MDCExtensionActions.DONT_SHOW_AGAIN as any)

      await showMDCExtensionRecommendation()

      expect(vi.mocked(workspace.getConfiguration)).toHaveBeenCalledWith(CONFIG_SECTION)
      expect(mockConfig.update).toHaveBeenCalledWith('showMDCRecommendation', false, true)
    })

    it('should do nothing when user dismisses the prompt', async () => {
      vi.mocked(window.showInformationMessage).mockResolvedValue(undefined)

      await showMDCExtensionRecommendation()

      expect(mockConfig.update).not.toHaveBeenCalled()
      expect(vi.mocked(commands.executeCommand)).not.toHaveBeenCalled()
    })
  })

  describe('checkAndShowMDCRecommendation', () => {
    it('should show recommendation when extension is not installed and showMDCRecommendation is true', async () => {
      vi.mocked(extensions.getExtension).mockReturnValue(undefined)
      vi.mocked(window.showInformationMessage).mockResolvedValue(undefined)

      await checkAndShowMDCRecommendation()

      expect(vi.mocked(window.showInformationMessage)).toHaveBeenCalled()
    })

    it('should not show recommendation when extension is installed', async () => {
      const mockExtension = {
        isActive: true,
        activate: vi.fn(),
      } as unknown as Extension<any>

      vi.mocked(extensions.getExtension).mockReturnValue(mockExtension)

      await checkAndShowMDCRecommendation()

      expect(vi.mocked(window.showInformationMessage)).not.toHaveBeenCalled()
    })

    it('should not show recommendation when showMDCRecommendation is false', async () => {
      vi.mocked(extensions.getExtension).mockReturnValue(undefined)
      mockConfig.get = vi.fn((key: string, defaultValue?: any) => {
        if (key === 'showMDCRecommendation') return false
        return defaultValue
      })

      await checkAndShowMDCRecommendation()

      expect(vi.mocked(window.showInformationMessage)).not.toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Check failed')
      vi.mocked(extensions.getExtension).mockImplementation(() => {
        throw error
      })

      await expect(checkAndShowMDCRecommendation()).resolves.not.toThrow()
    })
  })

  describe('checkAndPromptMDCExtensionForPortal', () => {
    const testOrigin = 'https://example.konghq.com'

    it('should sync settings silently when extension is installed', async () => {
      const mockExtension = {
        isActive: true,
        activate: vi.fn(),
      } as unknown as Extension<any>

      vi.mocked(extensions.getExtension).mockReturnValue(mockExtension)

      await checkAndPromptMDCExtensionForPortal(testOrigin)

      expect(mockConfig.update).toHaveBeenCalledWith(
        'mdc.componentMetadataURL',
        'https://example.konghq.com/api/components/mdc',
        true,
      )
      expect(mockConfig.update).toHaveBeenCalledWith(
        'mdc.enableComponentMetadataCompletions',
        true,
        true,
      )
      expect(vi.mocked(window.showInformationMessage)).not.toHaveBeenCalled()
    })

    it('should prompt for installation when extension is not installed and showMDCRecommendation is true', async () => {
      vi.mocked(extensions.getExtension).mockReturnValue(undefined)
      vi.mocked(window.showInformationMessage).mockResolvedValue(undefined)

      await checkAndPromptMDCExtensionForPortal(testOrigin)

      expect(vi.mocked(window.showInformationMessage)).toHaveBeenCalledWith(
        'Installing the MDC extension will enable component auto-completions for your portal content.',
        MDCExtensionActions.INSTALL_EXTENSION,
        MDCExtensionActions.DONT_SHOW_AGAIN,
      )
    })

    it('should not prompt when extension is not installed and showMDCRecommendation is false', async () => {
      vi.mocked(extensions.getExtension).mockReturnValue(undefined)
      mockConfig.get = vi.fn((key: string, defaultValue?: any) => {
        if (key === 'showMDCRecommendation') return false
        return defaultValue
      })

      await checkAndPromptMDCExtensionForPortal(testOrigin)

      expect(vi.mocked(window.showInformationMessage)).not.toHaveBeenCalled()
    })

    it('should handle errors silently and log them', async () => {
      const error = new Error('Check failed')
      vi.mocked(extensions.getExtension).mockImplementation(() => {
        throw error
      })

      await expect(checkAndPromptMDCExtensionForPortal(testOrigin)).resolves.not.toThrow()

      expect(vi.mocked(debug.error)).toHaveBeenCalledWith(
        'Failed to check MDC extension or sync settings for portal:',
        error,
      )
    })

    it('should sync settings and open marketplace when user clicks Install', async () => {
      vi.mocked(extensions.getExtension).mockReturnValue(undefined)
      vi.mocked(window.showInformationMessage).mockResolvedValue(MDCExtensionActions.INSTALL_EXTENSION as any)
      vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

      await checkAndPromptMDCExtensionForPortal(testOrigin)

      expect(mockConfig.update).toHaveBeenCalledWith(
        'mdc.componentMetadataURL',
        'https://example.konghq.com/api/components/mdc',
        true,
      )
      expect(vi.mocked(commands.executeCommand)).toHaveBeenCalledWith(
        'workbench.extensions.search',
        'Nuxt.mdc',
      )
    })
  })
})
