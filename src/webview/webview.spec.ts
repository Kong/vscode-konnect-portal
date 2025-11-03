import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Use vi.hoisted to ensure mocks are set up before any module imports
const {
  mockVsCodeApiInstance,
  mockLoadingOverlay: globalMockLoadingOverlay,
  mockErrorOverlay: globalMockErrorOverlay,
  mockErrorMessage: globalMockErrorMessage,
  mockErrorCode: globalMockErrorCode,
  mockIframe: globalMockIframe,
} = vi.hoisted(() => {
  const mockVsCodeApiInstance = {
    postMessage: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn(),
  }

  // @ts-ignore - Mock the global acquireVsCodeApi function
  global.acquireVsCodeApi = () => mockVsCodeApiInstance

  // Create mock DOM elements before module loads
  const mockLoadingOverlay = document.createElement('div')
  mockLoadingOverlay.id = 'loading-overlay'
  mockLoadingOverlay.classList.add('hidden')

  const mockErrorOverlay = document.createElement('div')
  mockErrorOverlay.id = 'error-overlay'
  mockErrorOverlay.classList.add('hidden')

  const mockErrorMessage = document.createElement('p')
  mockErrorMessage.id = 'error-message'

  const mockErrorCode = document.createElement('div')
  mockErrorCode.id = 'error-code'
  mockErrorCode.style.display = 'none'

  const mockIframe = document.createElement('iframe') as HTMLIFrameElement
  mockIframe.id = 'portal-preview'
  mockIframe.src = 'https://test-portal.example.com?preview=true&preview_id=test-id'

  // Mock contentWindow
  const mockContentWindow = {
    postMessage: vi.fn(),
  }
  Object.defineProperty(mockIframe, 'contentWindow', {
    value: mockContentWindow,
    writable: true,
    configurable: true,
  })

  // Mock document.getElementById to return our mocked elements
  const originalGetElementById = document.getElementById.bind(document)
  document.getElementById = vi.fn((id: string) => {
    switch (id) {
      case 'loading-overlay':
        return mockLoadingOverlay
      case 'error-overlay':
        return mockErrorOverlay
      case 'error-message':
        return mockErrorMessage
      case 'error-code':
        return mockErrorCode
      case 'portal-preview':
        return mockIframe
      default:
        return originalGetElementById(id)
    }
  })

  return {
    mockVsCodeApiInstance,
    mockLoadingOverlay,
    mockErrorOverlay,
    mockErrorMessage,
    mockErrorCode,
    mockIframe,
  }
})

import {
  showLoading,
  hideLoading,
  showError,
  startReadyTimeout,
  clearReadyTimeout,
  handleContentUpdate,
  handleConfigUpdate,
  handleRefreshPreview,
  handleNavigate,
  handleLoadingState,
} from './webview'

/**
 * Unit tests for webview.ts
 *
 * This file tests the webview functionality which is compiled to JavaScript
 * and embedded in the VS Code webview. Functions are exported from webview.ts
 * specifically for testing and the export statement is stripped when loading
 * into the actual VS Code extension.
 */

/** Mock VS Code API */
let mockVsCodeApi: any
/** Mock DOM elements - use the global ones that were set up before module import */
let mockLoadingOverlay: HTMLElement
let mockErrorOverlay: HTMLElement
let mockErrorMessage: HTMLElement
let mockErrorCode: HTMLElement
let mockIframe: HTMLIFrameElement

// Set up mocks before each test
beforeEach(() => {
  // Mock console methods
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  // Use the global mock instances
  mockVsCodeApi = mockVsCodeApiInstance
  mockLoadingOverlay = globalMockLoadingOverlay
  mockErrorOverlay = globalMockErrorOverlay
  mockErrorMessage = globalMockErrorMessage
  mockErrorCode = globalMockErrorCode
  mockIframe = globalMockIframe

  // Reset the classes to their initial state
  mockLoadingOverlay.classList.add('hidden')
  mockErrorOverlay.classList.add('hidden')
  mockErrorCode.style.display = 'none'

  // Reset mock functions
  vi.mocked(mockVsCodeApi.postMessage).mockClear()
  if (mockIframe.contentWindow) {
    vi.mocked(mockIframe.contentWindow.postMessage).mockClear()
  }

  // Use fake timers for all tests
  vi.useFakeTimers()
})

afterEach(() => {
  // Clear mock call history and restore timers
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('webview', () => {
  describe('Loading overlay functions', () => {
    it('should show loading overlay and hide error overlay', () => {
      showLoading()

      expect(mockLoadingOverlay.classList.contains('hidden')).toBe(false)
      expect(mockErrorOverlay.classList.contains('hidden')).toBe(true)
    })

    it('should hide loading overlay', () => {
      showLoading()
      expect(mockLoadingOverlay.classList.contains('hidden')).toBe(false)

      hideLoading()

      expect(mockLoadingOverlay.classList.contains('hidden')).toBe(true)
    })

    it('should handle missing DOM elements gracefully', () => {
      vi.spyOn(document, 'getElementById').mockReturnValue(null)

      expect(() => {
        showLoading()
        hideLoading()
      }).not.toThrow()
    })
  })

  describe('Error display function', () => {
    it('should display error message and notify VS Code', () => {
      const errorMessage = 'Test error message'
      const errorType = 'test-error'

      showError(errorMessage, errorType)

      expect(mockErrorOverlay.classList.contains('hidden')).toBe(false)
      expect(mockLoadingOverlay.classList.contains('hidden')).toBe(true)
      expect(mockErrorMessage.textContent).toBe(errorMessage)
      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith({
        type: 'webview:error',
        error: errorMessage,
        errorType: errorType,
      })
    })

    it('should show error details when provided', () => {
      const errorDetails = 'Detailed error information'

      showError('Test error', 'general', errorDetails)

      expect(mockErrorCode.textContent).toBe(errorDetails)
      expect(mockErrorCode.style.display).toBe('block')
    })

    it('should hide error details when not provided', () => {
      showError('Test error', 'general', null)

      expect(mockErrorCode.style.display).toBe('none')
    })

    it('should handle missing error message element', () => {
      vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
        if (id === 'error-message') return null
        if (id === 'error-overlay') return mockErrorOverlay
        if (id === 'loading-overlay') return mockLoadingOverlay
        return null
      })

      expect(() => {
        showError('Test error')
      }).not.toThrow()
    })
  })

  describe('Ready timeout management', () => {
    it('should start ready timeout', () => {
      startReadyTimeout()

      expect(vi.getTimerCount()).toBeGreaterThan(0)
    })

    it('should clear ready timeout', () => {
      startReadyTimeout()
      const timerCount = vi.getTimerCount()

      clearReadyTimeout()

      expect(vi.getTimerCount()).toBeLessThan(timerCount)
    })

    it('should post warning when timeout is reached', async () => {
      startReadyTimeout()

      await vi.advanceTimersByTimeAsync(5001)

      expect(mockVsCodeApi.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webview:warning',
          warningType: 'timeout',
        }),
      )
    })

    it('should not crash if timeout cleared multiple times', () => {
      startReadyTimeout()

      expect(() => {
        clearReadyTimeout()
        clearReadyTimeout()
      }).not.toThrow()
    })
  })

  describe('Content update handling', () => {
    it('should handle content update with valid message', () => {
      const contentMessage = {
        content: 'test content',
        config: { debug: false },
        portalConfig: { origin: 'https://test.com' },
        previewId: 'test-id',
        path: '/test-path',
      }

      expect(() => {
        handleContentUpdate(contentMessage)
      }).not.toThrow()
    })

    it('should handle content update with snippet name', () => {
      const contentMessage = {
        content: 'snippet content',
        config: { debug: false },
        portalConfig: { origin: 'https://test.com' },
        previewId: 'test-id',
        snippetName: 'my-snippet',
      }

      expect(() => {
        handleContentUpdate(contentMessage)
      }).not.toThrow()
    })

    it('should handle missing required fields gracefully', () => {
      const invalidMessage = {
        content: 'test',
      }

      expect(() => {
        handleContentUpdate(invalidMessage)
      }).not.toThrow()
    })
  })

  describe('Configuration update handling', () => {
    it('should update debug setting', () => {
      const logSpy = vi.spyOn(console, 'log')
      const configMessage = {
        config: { debug: true },
      }

      handleConfigUpdate(configMessage)

      // When debug is enabled, it should log the update
      expect(logSpy).toHaveBeenCalled()
    })

    it('should handle missing config gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error')
      const invalidMessage = {}

      handleConfigUpdate(invalidMessage)

      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('Refresh preview handling', () => {
    it('should show loading when refresh is triggered', () => {
      const refreshMessage = {
        content: 'refreshed content',
        config: { debug: false },
        portalConfig: { origin: 'https://test.com' },
        previewId: 'refresh-id',
        path: '/refresh-path',
      }

      handleRefreshPreview(refreshMessage)

      expect(mockLoadingOverlay.classList.contains('hidden')).toBe(false)
    })

    it('should handle refresh without content', () => {
      const refreshMessage = {
        config: { debug: false },
        portalConfig: { origin: 'https://test.com' },
      }

      expect(() => {
        handleRefreshPreview(refreshMessage)
      }).not.toThrow()
    })
  })

  describe('Navigate handling', () => {
    it('should handle navigate message with path', () => {
      const navigateMessage = {
        path: '/new-path',
        previewId: 'nav-id',
        config: { debug: false },
        portalConfig: { origin: 'https://test.com' },
      }

      expect(() => {
        handleNavigate(navigateMessage)
      }).not.toThrow()
    })

    it('should handle navigate with snippet name', () => {
      const navigateMessage = {
        snippetName: 'my-snippet',
        previewId: 'nav-id',
        config: { debug: false },
        portalConfig: { origin: 'https://test.com' },
      }

      expect(() => {
        handleNavigate(navigateMessage)
      }).not.toThrow()
    })

    it('should handle missing required fields', () => {
      const invalidMessage = {
        path: '/test',
      }

      expect(() => {
        handleNavigate(invalidMessage)
      }).not.toThrow()
    })
  })

  describe('Loading state handling', () => {
    it('should show loading when loading is true', () => {
      const message = {
        loading: true,
      }

      handleLoadingState(message)

      expect(mockLoadingOverlay.classList.contains('hidden')).toBe(false)
    })

    it('should hide loading when loading is false', () => {
      const message = {
        loading: false,
      }

      handleLoadingState(message)

      expect(mockLoadingOverlay.classList.contains('hidden')).toBe(true)
    })
  })
})
