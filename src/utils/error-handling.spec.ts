import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { window, commands } from 'vscode'
import type { ExtensionContext } from 'vscode'
import { showApiError } from './error-handling'
import { ApiError } from '../konnect/api'
import { copyDebugInfoToClipboard } from './debug-info'

// Mock VS Code module - only what this test file needs
vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}))

// Mock the debug-info module
vi.mock('./debug-info', () => ({
  copyDebugInfoToClipboard: vi.fn(),
}))

describe('error-handling', () => {
  let mockContext: ExtensionContext

  beforeEach(() => {
    vi.clearAllMocks()

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

          vi.mocked(window.showErrorMessage).mockResolvedValue(undefined)

          await showApiError(prefix, apiError, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'Failed to load portals: Unauthorized access',
            'Update Token',
            'Copy Debug Info',
          )
        })

        it('should execute configure token command when Update Token is selected', async () => {
          const apiError = new ApiError('Unauthorized access', 'trace-123', 401)
          const prefix = 'Authentication failed'

          vi.mocked(window.showErrorMessage).mockResolvedValue('Update Token' as any)
          vi.mocked(commands.executeCommand).mockResolvedValue(undefined)

          await showApiError(prefix, apiError, mockContext)

          expect(vi.mocked(commands.executeCommand)).toHaveBeenCalledWith('kong.konnect.portal.configureToken')
        })

        it('should copy debug info when Copy Debug Info is selected', async () => {
          const apiError = new ApiError('Unauthorized access', 'trace-123', 401)
          const prefix = 'Test prefix'

          vi.mocked(window.showErrorMessage).mockResolvedValue('Copy Debug Info' as any)

          await showApiError(prefix, apiError, mockContext)

          expect(vi.mocked(copyDebugInfoToClipboard)).toHaveBeenCalledWith(
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
        it('should show error with Copy Debug Info action only', async () => {
          const apiError = new ApiError('Server error', 'trace-456', 500)
          const prefix = 'Failed to fetch data'

          vi.mocked(window.showErrorMessage).mockResolvedValue(undefined)

          await showApiError(prefix, apiError, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'Failed to fetch data: Server error',
            'Copy Debug Info',
          )
        })

        it('should copy debug info when Copy Debug Info is selected', async () => {
          const apiError = new ApiError('Server error', 'trace-456', 500)
          const prefix = 'Request failed'

          vi.mocked(window.showErrorMessage).mockResolvedValue('Copy Debug Info' as any)

          await showApiError(prefix, apiError, mockContext)

          expect(vi.mocked(copyDebugInfoToClipboard)).toHaveBeenCalledWith(
            'Server error',
            mockContext,
            {
              status_code: 500,
              trace_id: 'trace-456',
            },
          )
        })
      })

      describe('for API errors with trace ID', () => {
        it('should copy debug info when Copy Debug Info is selected', async () => {
          const apiError = new ApiError('Bad request', 'trace-789', 400)
          const prefix = 'Validation failed'

          vi.mocked(window.showErrorMessage).mockResolvedValue('Copy Debug Info' as any)

          await showApiError(prefix, apiError, mockContext)

          expect(vi.mocked(copyDebugInfoToClipboard)).toHaveBeenCalledWith(
            'Bad request',
            mockContext,
            {
              status_code: 400,
              trace_id: 'trace-789',
            },
          )
        })
      })

      describe('for API errors without trace ID', () => {
        it('should copy debug info when Copy Debug Info is selected', async () => {
          const apiError = new ApiError('Network error')
          const prefix = 'Connection failed'

          vi.mocked(window.showErrorMessage).mockResolvedValue('Copy Debug Info' as any)

          await showApiError(prefix, apiError, mockContext)

          expect(vi.mocked(copyDebugInfoToClipboard)).toHaveBeenCalledWith(
            'Network error',
            mockContext,
            {
              status_code: undefined,
              trace_id: undefined,
            },
          )
        })
      })
    })

    describe('when error is a regular Error', () => {
      it('should not execute commands or copy debug info', async () => {
        const error = new Error('File not found')
        const prefix = 'Failed to read file'

        vi.mocked(window.showErrorMessage).mockResolvedValue(undefined)

        await showApiError(prefix, error, mockContext)

        expect(vi.mocked(commands.executeCommand)).not.toHaveBeenCalled()
      })

      describe('with simple error messages', () => {
        it('should show basic error message for file system errors', () => {
          const error = new Error('ENOENT: no such file or directory')
          const prefix = 'File operation failed'

          showApiError(prefix, error, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'File operation failed: ENOENT: no such file or directory',
          )
        })

        it('should show basic error message for network errors', () => {
          const error = new Error('Network timeout')
          const prefix = 'Request failed'

          showApiError(prefix, error, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'Request failed: Network timeout',
          )
        })

        it('should show basic error message for validation errors', () => {
          const error = new Error('Invalid configuration')
          const prefix = 'Setup failed'

          showApiError(prefix, error, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'Setup failed: Invalid configuration',
          )
        })

        it('should show basic error message for permission errors', () => {
          const error = new Error('Permission denied')
          const prefix = 'Access failed'

          showApiError(prefix, error, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'Access failed: Permission denied',
          )
        })

        it('should show basic error message for parsing errors', () => {
          const error = new Error('JSON parse error')
          const prefix = 'Data processing failed'

          showApiError(prefix, error, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'Data processing failed: JSON parse error',
          )
        })
      })
    })

    describe('when error is neither ApiError nor Error', () => {
      describe('with unknown error types', () => {
        it('should show generic error message for string errors', () => {
          const error = 'Something went wrong'
          const prefix = 'Operation failed'

          showApiError(prefix, error, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'Operation failed: Unknown error occurred',
          )
        })

        it('should show generic error message for object errors', () => {
          const error = { code: 'UNKNOWN', details: 'Unexpected error' }
          const prefix = 'System error'

          showApiError(prefix, error, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'System error: Unknown error occurred',
          )
        })

        it('should show generic error message for null errors', () => {
          const error = null
          const prefix = 'Null error'

          showApiError(prefix, error, mockContext)

          expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
            'Null error: Unknown error occurred',
          )
        })
      })
    })
  })
})
