import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { window, commands } from 'vscode'
import type { ExtensionContext } from 'vscode'
import { showApiError } from './error-handling'
import { ApiError } from '../konnect/api'
import { copyDebugInfoToClipboard } from './debug-info'

// Mock the debug-info module
vi.mock('./debug-info', () => ({
  copyDebugInfoToClipboard: vi.fn(),
}))

describe('error-handling', () => {
  let mockWindow: any
  let mockCommands: any
  let mockContext: ExtensionContext

  beforeEach(() => {
    vi.clearAllMocks()

    // Get mocked modules from global setup
    mockWindow = vi.mocked(window)
    mockCommands = vi.mocked(commands)

    // Create a mock extension context
    mockContext = {
      extension: {
        packageJSON: { version: '1.0.0' },
      },
    } as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('showApiError', () => {
    describe('when error is an ApiError', () => {
      describe('for 401 unauthorized errors', () => {
        it('should show error with Update Token and Copy Debug Info actions', async () => {
          const apiError = new ApiError('Unauthorized access', 'trace-123', 401)
          const prefix = 'Failed to load portals'

          mockWindow.showErrorMessage.mockResolvedValue(undefined)

          await showApiError(prefix, apiError, mockContext)

          expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
            'Failed to load portals: Unauthorized access',
            'Update Token',
            'Copy Debug Info',
          )
        })

        it('should execute configure token command when Update Token is selected', async () => {
          const apiError = new ApiError('Unauthorized access', 'trace-123', 401)
          const prefix = 'Authentication failed'

          mockWindow.showErrorMessage.mockResolvedValue('Update Token')
          mockCommands.executeCommand.mockResolvedValue(undefined)

          await showApiError(prefix, apiError, mockContext)

          expect(mockCommands.executeCommand).toHaveBeenCalledWith('portalPreview.configureToken')
        })

        it('should copy debug info when Copy Debug Info is selected', async () => {
          const apiError = new ApiError('Unauthorized access', 'trace-123', 401)
          const prefix = 'Authentication failed'

          mockWindow.showErrorMessage.mockResolvedValue('Copy Debug Info')

          await showApiError(prefix, apiError, mockContext)

          expect(copyDebugInfoToClipboard).toHaveBeenCalledWith(
            'Unauthorized access',
            mockContext,
            {
              status_code: 401,
              trace_id: 'trace-123',
            },
          )
        })
      })

      describe('for non-401 API errors', () => {
        it('should show error with only Copy Debug Info action', async () => {
          const apiError = new ApiError('Server error', 'trace-456', 500)
          const prefix = 'Failed to fetch data'

          mockWindow.showErrorMessage.mockResolvedValue(undefined)

          await showApiError(prefix, apiError, mockContext)

          expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
            'Failed to fetch data: Server error',
            'Copy Debug Info',
          )
        })

        it('should copy debug info when Copy Debug Info is selected', async () => {
          const apiError = new ApiError('Server error', 'trace-456', 500)
          const prefix = 'Failed to fetch data'

          mockWindow.showErrorMessage.mockResolvedValue('Copy Debug Info')

          await showApiError(prefix, apiError, mockContext)

          expect(copyDebugInfoToClipboard).toHaveBeenCalledWith(
            'Server error',
            mockContext,
            {
              status_code: 500,
              trace_id: 'trace-456',
            },
          )
        })

        it('should handle API error without trace ID', async () => {
          const apiError = new ApiError('Network error', undefined, 400)
          const prefix = 'Request failed'

          mockWindow.showErrorMessage.mockResolvedValue('Copy Debug Info')

          await showApiError(prefix, apiError, mockContext)

          expect(copyDebugInfoToClipboard).toHaveBeenCalledWith(
            'Network error',
            mockContext,
            {
              status_code: 400,
              trace_id: undefined,
            },
          )
        })

        it('should handle API error without status code', async () => {
          const apiError = new ApiError('Connection failed', 'trace-789')
          const prefix = 'Network error'

          mockWindow.showErrorMessage.mockResolvedValue('Copy Debug Info')

          await showApiError(prefix, apiError, mockContext)

          expect(copyDebugInfoToClipboard).toHaveBeenCalledWith(
            'Connection failed',
            mockContext,
            {
              status_code: undefined,
              trace_id: 'trace-789',
            },
          )
        })
      })

      it('should handle when user dismisses the error dialog', async () => {
        const apiError = new ApiError('Test error', 'trace-123', 401)
        const prefix = 'Test prefix'

        mockWindow.showErrorMessage.mockResolvedValue(undefined)

        await showApiError(prefix, apiError, mockContext)

        expect(mockCommands.executeCommand).not.toHaveBeenCalled()
        expect(copyDebugInfoToClipboard).not.toHaveBeenCalled()
      })
    })

    describe('when error is a regular Error', () => {
      it('should show simple error message without actions', async () => {
        const error = new Error('File not found')
        const prefix = 'Failed to read file'

        await showApiError(prefix, error, mockContext)

        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          'Failed to read file: File not found',
        )
        expect(mockCommands.executeCommand).not.toHaveBeenCalled()
        expect(copyDebugInfoToClipboard).not.toHaveBeenCalled()
      })

      it('should work without extension context', async () => {
        const error = new Error('Generic error')
        const prefix = 'Operation failed'

        await showApiError(prefix, error)

        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          'Operation failed: Generic error',
        )
      })
    })

    describe('when error is not an Error object', () => {
      it('should handle string errors', async () => {
        const error = 'Something went wrong'
        const prefix = 'Unexpected error'

        await showApiError(prefix, error, mockContext)

        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          'Unexpected error: Unknown error occurred',
        )
      })

      it('should handle null/undefined errors', async () => {
        const prefix = 'Null error'

        await showApiError(prefix, null, mockContext)

        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          'Null error: Unknown error occurred',
        )

        await showApiError(prefix, undefined, mockContext)

        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          'Null error: Unknown error occurred',
        )
      })

      it('should handle object errors', async () => {
        const error = { code: 'ERR001', details: 'Custom error object' }
        const prefix = 'Object error'

        await showApiError(prefix, error, mockContext)

        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          'Object error: Unknown error occurred',
        )
      })
    })

    describe('error handling edge cases', () => {
      it('should propagate errors when command execution fails', async () => {
        const apiError = new ApiError('Unauthorized', 'trace-123', 401)
        const prefix = 'Auth error'

        mockWindow.showErrorMessage.mockResolvedValue('Update Token')
        mockCommands.executeCommand.mockRejectedValue(new Error('Command failed'))

        // Should propagate the command execution error
        await expect(showApiError(prefix, apiError, mockContext)).rejects.toThrow('Command failed')
      })

      it('should propagate errors when copyDebugInfoToClipboard fails', async () => {
        const apiError = new ApiError('Test error', 'trace-123', 500)
        const prefix = 'Test'

        mockWindow.showErrorMessage.mockResolvedValue('Copy Debug Info')
        vi.mocked(copyDebugInfoToClipboard).mockRejectedValue(new Error('Clipboard failed'))

        // Should propagate the clipboard operation error
        await expect(showApiError(prefix, apiError, mockContext)).rejects.toThrow('Clipboard failed')
      })
    })

    describe('message formatting', () => {
      it('should correctly combine prefix and error message', async () => {
        const error = new Error('Detailed error description')
        const prefix = 'Operation failed'

        await showApiError(prefix, error, mockContext)

        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          'Operation failed: Detailed error description',
        )
      })

      it('should handle empty prefix', async () => {
        const error = new Error('Error message')
        const prefix = ''

        await showApiError(prefix, error, mockContext)

        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          ': Error message',
        )
      })

      it('should handle empty error message', async () => {
        const error = new Error('')
        const prefix = 'Failed to process'

        await showApiError(prefix, error, mockContext)

        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          'Failed to process: ',
        )
      })
    })
  })
})
