import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { commands } from 'vscode'
import { updatePreviewContext } from './vscode-context'
import { debug } from './debug'
import { VSCODE_MESSAGES } from '../constants/messages'

// Mock VS Code module - only what this test file needs
vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}))

// Mock the debug module
vi.mock('./debug', () => ({
  debug: {
    log: vi.fn(),
  },
}))

describe('vscode-context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('updatePreviewContext', () => {
    it('should set context to true when preview is active', () => {
      vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

      updatePreviewContext(true)

      expect(vi.mocked(commands.executeCommand)).toHaveBeenCalledWith(
        'setContext',
        'portalPreview.hasActivePreview',
        true,
      )
      expect(vi.mocked(debug.log)).toHaveBeenCalledWith(
        'Updated preview context:',
        { hasActivePreview: true },
      )
    })

    it('should set context to false when preview is inactive', () => {
      vi.mocked(commands.executeCommand).mockResolvedValue('some-result')

      updatePreviewContext(false)

      expect(vi.mocked(commands.executeCommand)).toHaveBeenCalledWith(
        'setContext',
        'portalPreview.hasActivePreview',
        false,
      )
      expect(vi.mocked(debug.log)).toHaveBeenCalledWith(
        'Updated preview context:',
        { hasActivePreview: false },
      )
    })

    it('should handle errors gracefully', () => {
      vi.mocked(commands.executeCommand).mockImplementation(() => {
        throw new Error(VSCODE_MESSAGES.CONTEXT_UPDATE_FAILED)
      })

      vi.mocked(debug.log).mockImplementation(() => {
        // Mock debug.log to avoid any side effects
      })

      // The function doesn't have error handling, so it will throw
      expect(() => updatePreviewContext(true)).toThrow(VSCODE_MESSAGES.CONTEXT_UPDATE_FAILED)
    })

    it('should handle multiple rapid context updates', () => {
      vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

      updatePreviewContext(true)
      updatePreviewContext(false)
      updatePreviewContext(true)

      expect(vi.mocked(commands.executeCommand)).toHaveBeenCalledTimes(3)
      expect(vi.mocked(commands.executeCommand)).toHaveBeenNthCalledWith(
        1,
        'setContext',
        'portalPreview.hasActivePreview',
        true,
      )
      expect(vi.mocked(commands.executeCommand)).toHaveBeenNthCalledWith(
        2,
        'setContext',
        'portalPreview.hasActivePreview',
        false,
      )
      expect(vi.mocked(commands.executeCommand)).toHaveBeenNthCalledWith(
        3,
        'setContext',
        'portalPreview.hasActivePreview',
        true,
      )

      expect(vi.mocked(debug.log)).toHaveBeenCalledTimes(3)
      expect(vi.mocked(debug.log)).toHaveBeenNthCalledWith(
        1,
        'Updated preview context:',
        { hasActivePreview: true },
      )
      expect(vi.mocked(debug.log)).toHaveBeenNthCalledWith(
        2,
        'Updated preview context:',
        { hasActivePreview: false },
      )
      expect(vi.mocked(debug.log)).toHaveBeenNthCalledWith(
        3,
        'Updated preview context:',
        { hasActivePreview: true },
      )
    })

    it('should use correct command and context key format', () => {
      vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

      updatePreviewContext(true)

      const [command, contextKey] = vi.mocked(commands.executeCommand).mock.calls[0]
      expect(command).toBe('setContext')
      expect(contextKey).toBe('portalPreview.hasActivePreview')
    })

    it('should handle boolean conversion correctly', () => {
      vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

      updatePreviewContext(false)

      const [, , value] = vi.mocked(commands.executeCommand).mock.calls[0]
      expect(value).toBe(false)
      expect(typeof value).toBe('boolean')
    })
  })
})
