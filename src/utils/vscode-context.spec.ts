import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { commands } from 'vscode'
import { updatePreviewContext } from './vscode-context'
import { debug } from './debug'

// Mock the debug module
vi.mock('./debug', () => ({
  debug: {
    log: vi.fn(),
  },
}))

describe('vscode-context', () => {
  let mockCommands: any
  let mockDebug: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Get mocked modules from global setup
    mockCommands = vi.mocked(commands)
    mockDebug = vi.mocked(debug)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('updatePreviewContext', () => {
    it('should set context to true when preview is active', () => {
      mockCommands.executeCommand.mockResolvedValue(undefined)

      updatePreviewContext(true)

      expect(mockCommands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'portalPreview.hasActivePreview',
        true,
      )
      expect(mockDebug.log).toHaveBeenCalledWith(
        'Updated preview context:',
        { hasActivePreview: true },
      )
    })

    it('should set context to false when preview is not active', () => {
      mockCommands.executeCommand.mockResolvedValue(undefined)

      updatePreviewContext(false)

      expect(mockCommands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'portalPreview.hasActivePreview',
        false,
      )
      expect(mockDebug.log).toHaveBeenCalledWith(
        'Updated preview context:',
        { hasActivePreview: false },
      )
    })

    it('should work regardless of command execution result', () => {
      mockCommands.executeCommand.mockResolvedValue('some-result')

      updatePreviewContext(true)

      expect(mockCommands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'portalPreview.hasActivePreview',
        true,
      )
      expect(mockDebug.log).toHaveBeenCalledWith(
        'Updated preview context:',
        { hasActivePreview: true },
      )
    })

    it('should call executeCommand and debug.log in correct order', () => {
      const callOrder: string[] = []

      mockCommands.executeCommand.mockImplementation(() => {
        callOrder.push('executeCommand')
        return Promise.resolve()
      })

      mockDebug.log.mockImplementation(() => {
        callOrder.push('debug.log')
      })

      updatePreviewContext(true)

      expect(callOrder).toEqual(['executeCommand', 'debug.log'])
    })

    it('should handle multiple consecutive calls', () => {
      mockCommands.executeCommand.mockResolvedValue(undefined)

      updatePreviewContext(true)
      updatePreviewContext(false)
      updatePreviewContext(true)

      expect(mockCommands.executeCommand).toHaveBeenCalledTimes(3)
      expect(mockCommands.executeCommand).toHaveBeenNthCalledWith(
        1,
        'setContext',
        'portalPreview.hasActivePreview',
        true,
      )
      expect(mockCommands.executeCommand).toHaveBeenNthCalledWith(
        2,
        'setContext',
        'portalPreview.hasActivePreview',
        false,
      )
      expect(mockCommands.executeCommand).toHaveBeenNthCalledWith(
        3,
        'setContext',
        'portalPreview.hasActivePreview',
        true,
      )

      expect(mockDebug.log).toHaveBeenCalledTimes(3)
      expect(mockDebug.log).toHaveBeenNthCalledWith(
        1,
        'Updated preview context:',
        { hasActivePreview: true },
      )
      expect(mockDebug.log).toHaveBeenNthCalledWith(
        2,
        'Updated preview context:',
        { hasActivePreview: false },
      )
      expect(mockDebug.log).toHaveBeenNthCalledWith(
        3,
        'Updated preview context:',
        { hasActivePreview: true },
      )
    })

    it('should use the correct VS Code context key', () => {
      mockCommands.executeCommand.mockResolvedValue(undefined)

      updatePreviewContext(true)

      // Verify the exact context key used
      const [command, contextKey] = mockCommands.executeCommand.mock.calls[0]
      expect(command).toBe('setContext')
      expect(contextKey).toBe('portalPreview.hasActivePreview')
    })

    it('should log the correct data structure', () => {
      mockCommands.executeCommand.mockResolvedValue(undefined)

      updatePreviewContext(false)

      // Verify the exact structure of logged data
      const [message, data] = mockDebug.log.mock.calls[0]
      expect(message).toBe('Updated preview context:')
      expect(data).toEqual({ hasActivePreview: false })
      expect(Object.keys(data)).toEqual(['hasActivePreview'])
    })
  })
})
