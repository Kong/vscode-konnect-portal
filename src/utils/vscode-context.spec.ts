import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { commands } from 'vscode'
import { updatePreviewContext } from './vscode-context'
import { debug } from './debug'

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
        'kong.konnect.portal.hasActivePreview',
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
        'kong.konnect.portal.hasActivePreview',
        false,
      )
      expect(vi.mocked(debug.log)).toHaveBeenCalledWith(
        'Updated preview context:',
        { hasActivePreview: false },
      )
    })

    it('should handle multiple rapid context updates correctly', () => {
      vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

      // Multiple rapid updates
      updatePreviewContext(true)
      updatePreviewContext(false)
      updatePreviewContext(true)

      // Each call sets the correct context value
      expect(vi.mocked(commands.executeCommand)).toHaveBeenCalledWith(
        'setContext',
        'kong.konnect.portal.hasActivePreview',
        true,
      )
      expect(vi.mocked(commands.executeCommand)).toHaveBeenCalledWith(
        'setContext',
        'kong.konnect.portal.hasActivePreview',
        false,
      )

      // Debug logging occurred for each update
      expect(vi.mocked(debug.log)).toHaveBeenCalledWith(
        'Updated preview context:',
        { hasActivePreview: true },
      )
      expect(vi.mocked(debug.log)).toHaveBeenCalledWith(
        'Updated preview context:',
        { hasActivePreview: false },
      )
    })

    it('should use correct command and context key format', () => {
      vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

      updatePreviewContext(true)

      const [command, contextKey] = vi.mocked(commands.executeCommand).mock.calls[0]
      expect(command).toBe('setContext')
      expect(contextKey).toBe('kong.konnect.portal.hasActivePreview')
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
