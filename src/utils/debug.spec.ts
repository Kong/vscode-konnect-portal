import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { workspace } from 'vscode'
import type { WorkspaceConfiguration } from 'vscode'
import { debugLog, debug } from './debug'
import { LogLevel } from '../types'

// Mock VS Code module - only what this test file needs
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
}))

describe('debug', () => {
  // Mock console methods
  let consoleSpy: {
    log: any
    warn: any
    error: any
  }

  /** Create a complete WorkspaceConfiguration mock with all required properties */
  const createWorkspaceConfigMock = (debugValue: unknown = false): WorkspaceConfiguration => ({
    get: vi.fn((key: string, defaultValue?: unknown) => {
      if (key === 'debug') return debugValue
      return defaultValue
    }),
    has: vi.fn(() => true),
    inspect: vi.fn(() => ({ key: '', defaultValue: undefined })),
    update: vi.fn().mockResolvedValue(undefined),
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Spy on console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }

    // Default mock configuration - debug disabled
    vi.mocked(workspace.getConfiguration).mockReturnValue(
      createWorkspaceConfigMock(false),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('debugLog', () => {
    describe('when debug mode is disabled', () => {
      it('should not log normal messages', () => {
        debugLog({ message: 'Test message' })

        expect(consoleSpy.log).not.toHaveBeenCalled()
        expect(consoleSpy.warn).not.toHaveBeenCalled()
        expect(consoleSpy.error).not.toHaveBeenCalled()
      })

      it('should log forced messages', () => {
        debugLog({ message: 'Forced message', force: true })

        expect(consoleSpy.log).toHaveBeenCalledWith('[Portal Preview] Forced message')
      })

      it('should log forced messages with data', () => {
        const testData = { error: 'details' }
        debugLog({ message: 'Forced message', data: testData, force: true })

        expect(consoleSpy.log).toHaveBeenCalledWith('[Portal Preview] Forced message', testData)
      })
    })

    describe('when debug mode is enabled', () => {
      beforeEach(() => {
        // Enable debug mode
        vi.mocked(workspace.getConfiguration).mockReturnValue({
          get: vi.fn((key: string, defaultValue?: unknown) => {
            if (key === 'debug') return true
            return defaultValue
          }),
        } as any)
      })

      it('should log normal log messages', () => {
        debugLog({ message: 'Debug message' })

        expect(consoleSpy.log).toHaveBeenCalledWith('[Portal Preview] Debug message')
      })

      it('should log warning messages', () => {
        debugLog({ type: LogLevel.WARN, message: 'Warning message' })

        expect(consoleSpy.warn).toHaveBeenCalledWith('[Portal Preview] Warning message')
      })

      it('should log error messages', () => {
        debugLog({ type: LogLevel.ERROR, message: 'Error message' })

        expect(consoleSpy.error).toHaveBeenCalledWith('[Portal Preview] Error message')
      })

      it('should log messages with additional data', () => {
        const testData = { userId: 'test-user', action: 'test-action' }
        debugLog({ message: 'Message with data', data: testData })

        expect(consoleSpy.log).toHaveBeenCalledWith('[Portal Preview] Message with data', testData)
      })

      it('should handle undefined log type as default log', () => {
        debugLog({ message: 'Default type message' })

        expect(consoleSpy.log).toHaveBeenCalledWith('[Portal Preview] Default type message')
      })

      it('should call workspace.getConfiguration with correct parameter', () => {
        debugLog({ message: 'Test message' })

        expect(vi.mocked(workspace.getConfiguration)).toHaveBeenCalledWith('portalPreview')
      })
    })

    describe('log types', () => {
      beforeEach(() => {
        // Enable debug mode for these tests
        vi.mocked(workspace.getConfiguration).mockReturnValue({
          get: vi.fn(() => true),
          has: vi.fn(() => true),
          inspect: vi.fn(() => ({ key: '', defaultValue: undefined })),
          update: vi.fn().mockResolvedValue(undefined),
        })
      })

      it('should use console.log for LOG type', () => {
        debugLog({ type: LogLevel.LOG, message: 'Log message' })

        expect(consoleSpy.log).toHaveBeenCalledWith('[Portal Preview] Log message')
        expect(consoleSpy.warn).not.toHaveBeenCalled()
        expect(consoleSpy.error).not.toHaveBeenCalled()
      })

      it('should use console.warn for WARN type', () => {
        debugLog({ type: LogLevel.WARN, message: 'Warn message' })

        expect(consoleSpy.warn).toHaveBeenCalledWith('[Portal Preview] Warn message')
        expect(consoleSpy.log).not.toHaveBeenCalled()
        expect(consoleSpy.error).not.toHaveBeenCalled()
      })

      it('should use console.error for ERROR type', () => {
        debugLog({ type: LogLevel.ERROR, message: 'Error message' })

        expect(consoleSpy.error).toHaveBeenCalledWith('[Portal Preview] Error message')
        expect(consoleSpy.log).not.toHaveBeenCalled()
        expect(consoleSpy.warn).not.toHaveBeenCalled()
      })
    })
  })

  describe('debug convenience functions', () => {
    beforeEach(() => {
      // Enable debug mode for these tests
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as any)
    })

    describe('debug.log', () => {
      it('should log with LOG type and default force=false', () => {
        debug.log('Test log message')

        expect(consoleSpy.log).toHaveBeenCalledWith('[Portal Preview] Test log message')
      })

      it('should log with additional data', () => {
        const testData = { key: 'value' }
        debug.log('Log with data', testData)

        expect(consoleSpy.log).toHaveBeenCalledWith('[Portal Preview] Log with data', testData)
      })

      it('should respect force parameter', () => {
        // Disable debug mode
        vi.mocked(workspace.getConfiguration).mockReturnValue(
          createWorkspaceConfigMock(false),
        )

        debug.log('Forced log', undefined, true)

        expect(consoleSpy.log).toHaveBeenCalledWith('[Portal Preview] Forced log')
      })
    })

    describe('debug.warn', () => {
      it('should log with WARN type and default force=false', () => {
        debug.warn('Test warning')

        expect(consoleSpy.warn).toHaveBeenCalledWith('[Portal Preview] Test warning')
      })

      it('should log with additional data', () => {
        const testData = { warning: 'details' }
        debug.warn('Warning with data', testData)

        expect(consoleSpy.warn).toHaveBeenCalledWith('[Portal Preview] Warning with data', testData)
      })

      it('should respect force parameter', () => {
        // Disable debug mode
        vi.mocked(workspace.getConfiguration).mockReturnValue(
          createWorkspaceConfigMock(false),
        )

        debug.warn('Forced warning', undefined, true)

        expect(consoleSpy.warn).toHaveBeenCalledWith('[Portal Preview] Forced warning')
      })
    })

    describe('debug.error', () => {
      it('should log with ERROR type and default force=true', () => {
        // Disable debug mode - errors should still show due to force=true default
        vi.mocked(workspace.getConfiguration).mockReturnValue(
          createWorkspaceConfigMock(false),
        )

        debug.error('Test error')

        expect(consoleSpy.error).toHaveBeenCalledWith('[Portal Preview] Test error')
      })

      it('should log with additional data', () => {
        const testData = { error: 'stack trace' }
        debug.error('Error with data', testData)

        expect(consoleSpy.error).toHaveBeenCalledWith('[Portal Preview] Error with data', testData)
      })

      it('should allow overriding force parameter to false', () => {
        // Disable debug mode
        vi.mocked(workspace.getConfiguration).mockReturnValue(
          createWorkspaceConfigMock(false),
        )

        debug.error('Non-forced error', undefined, false)

        expect(consoleSpy.error).not.toHaveBeenCalled()
      })
    })
  })

  describe('configuration integration', () => {
    it('should handle missing debug configuration gracefully', () => {
      // Mock getConfiguration to return undefined for debug setting
      vi.mocked(workspace.getConfiguration).mockReturnValue(
        createWorkspaceConfigMock(undefined),
      )

      debugLog({ message: 'Test message' })

      expect(consoleSpy.log).not.toHaveBeenCalled()
    })

    it('should use default false value when debug setting is undefined', () => {
      // Mock configuration.get to be called with default value
      const mockGet = vi.fn((key: string, defaultValue?: unknown) => defaultValue)
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: mockGet,
        has: vi.fn(() => true),
        inspect: vi.fn(() => ({ key: '', defaultValue: undefined })),
        update: vi.fn().mockResolvedValue(undefined),
      })

      debugLog({ message: 'Test message' })

      expect(mockGet).toHaveBeenCalledWith('debug', false)
      expect(consoleSpy.log).not.toHaveBeenCalled()
    })
  })
})
