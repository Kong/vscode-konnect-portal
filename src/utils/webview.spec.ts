import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock debug module
vi.mock('./debug', () => ({
  debug: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Import after mocks
import { addPreviewParams } from './webview'
import { debug } from './debug'

describe('webview utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('addPreviewParams', () => {
    it('should add preview params to a basic URL', () => {
      const result = addPreviewParams('https://portal.example.com', 'test-preview-id')

      expect(result).toBe('https://portal.example.com/?preview=true&preview_id=test-preview-id')
    })

    it('should add preview params to URL with existing query parameters', () => {
      const result = addPreviewParams('https://portal.example.com?theme=dark', 'test-preview-id')

      expect(result).toBe('https://portal.example.com/?theme=dark&preview=true&preview_id=test-preview-id')
    })

    it('should add path parameter when provided', () => {
      const result = addPreviewParams('https://portal.example.com', 'test-preview-id', '/docs/api')

      expect(result).toBe('https://portal.example.com/docs/api?preview=true&preview_id=test-preview-id')
    })

    it('should handle path parameter without leading slash', () => {
      const result = addPreviewParams('https://portal.example.com', 'test-preview-id', 'docs/api')

      expect(result).toBe('https://portal.example.com/docs/api?preview=true&preview_id=test-preview-id')
    })

    it('should ignore path parameter when it is just "/"', () => {
      const result = addPreviewParams('https://portal.example.com', 'test-preview-id', '/')

      expect(result).toBe('https://portal.example.com/?preview=true&preview_id=test-preview-id')
    })

    it('should handle URL with trailing slash and path', () => {
      const result = addPreviewParams('https://portal.example.com/', 'test-preview-id', '/docs')

      expect(result).toBe('https://portal.example.com/docs?preview=true&preview_id=test-preview-id')
    })

    it('should handle URL with existing path and add new path', () => {
      const result = addPreviewParams('https://portal.example.com/base', 'test-preview-id', '/docs')

      expect(result).toBe('https://portal.example.com/base/docs?preview=true&preview_id=test-preview-id')
    })

    it('should encode preview ID properly', () => {
      const result = addPreviewParams('https://portal.example.com', 'test preview id with spaces')

      expect(result).toBe('https://portal.example.com/?preview=true&preview_id=test+preview+id+with+spaces')
    })

    it('should return original URL if empty', () => {
      const result = addPreviewParams('', 'test-preview-id')

      expect(result).toBe('')
    })

    it('should handle malformed URLs gracefully with fallback', () => {
      const malformedUrl = 'not-a-valid-url'
      const result = addPreviewParams(malformedUrl, 'test-preview-id')

      expect(vi.mocked(debug.warn)).toHaveBeenCalledWith(
        'Failed to parse URL for preview params:',
        expect.objectContaining({
          url: malformedUrl,
          error: expect.any(Error),
        }),
      )
      expect(result).toBe('not-a-valid-url?preview=true&preview_id=test-preview-id')
    })

    it('should handle malformed URL with existing query params in fallback', () => {
      const malformedUrl = 'not-a-valid-url?existing=param'
      const result = addPreviewParams(malformedUrl, 'test-preview-id')

      expect(result).toBe('not-a-valid-url?existing=param&preview=true&preview_id=test-preview-id')
    })

    it('should handle malformed URL with path in fallback', () => {
      const malformedUrl = 'not-a-valid-url'
      const result = addPreviewParams(malformedUrl, 'test-preview-id', '/docs')

      expect(result).toBe('not-a-valid-url/docs?preview=true&preview_id=test-preview-id')
    })

    it('should encode preview ID in fallback mode', () => {
      const malformedUrl = 'not-a-valid-url'
      const result = addPreviewParams(malformedUrl, 'test preview id with spaces')

      expect(result).toBe('not-a-valid-url?preview=true&preview_id=test%20preview%20id%20with%20spaces')
    })

    it('should handle URL with port numbers', () => {
      const result = addPreviewParams('http://localhost:3000', 'test-id')

      expect(result).toBe('http://localhost:3000/?preview=true&preview_id=test-id')
    })

    it('should handle complex URLs with fragments', () => {
      const result = addPreviewParams('https://portal.example.com/path?query=value#fragment', 'test-id')

      expect(result).toBe('https://portal.example.com/path?query=value&preview=true&preview_id=test-id#fragment')
    })

    it('should handle URLs with special characters in path', () => {
      const result = addPreviewParams('https://portal.example.com', 'test-id', '/docs/api-reference')

      expect(result).toBe('https://portal.example.com/docs/api-reference?preview=true&preview_id=test-id')
    })

    it('should handle multiple consecutive slashes in URL', () => {
      const result = addPreviewParams('https://portal.example.com//path/', 'test-id', '/docs')

      expect(result).toBe('https://portal.example.com//path/docs?preview=true&preview_id=test-id')
    })

    it('should handle preview ID with special characters', () => {
      const result = addPreviewParams('https://portal.example.com', 'test-id-123_abc')

      expect(result).toBe('https://portal.example.com/?preview=true&preview_id=test-id-123_abc')
    })

    it('should handle empty preview ID', () => {
      const result = addPreviewParams('https://portal.example.com', '')

      expect(result).toBe('https://portal.example.com/?preview=true&preview_id=')
    })

    it('should handle URL with authentication info', () => {
      const result = addPreviewParams('https://user:pass@portal.example.com', 'test-id')

      expect(result).toBe('https://user:pass@portal.example.com/?preview=true&preview_id=test-id')
    })
  })
})
