import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDebugInfo, createDebugInfoText, copyDebugInfoToClipboard } from './debug-info'
import { createMockExtensionContext } from '../../tests/test-utils'
import * as vscode from 'vscode'

const LOG_TIMESTAMP = '2025-01-01T00:00:00.000Z'

describe('debug-info', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock Date to have consistent timestamps
    vi.useFakeTimers()
    vi.setSystemTime(new Date(LOG_TIMESTAMP))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createDebugInfo', () => {
    it('should create debug info with minimal parameters', () => {
      const result = createDebugInfo('Test message')

      expect(result).toEqual({
        message: 'Test message',
        extension_name: 'unknown',
        version: 'unknown',
        timestamp: LOG_TIMESTAMP,
      })
    })

    it('should create debug info with extension context', () => {
      const context = createMockExtensionContext({
        extensionPath: '/test/path',
        name: 'test-extension',
        version: '1.2.3',
      })

      const result = createDebugInfo('Test message', context)

      expect(result).toEqual({
        message: 'Test message',
        extension_name: 'test-extension',
        version: '1.2.3',
        timestamp: LOG_TIMESTAMP,
      })
    })

    it('should merge additional data correctly', () => {
      const context = createMockExtensionContext({
        extensionPath: '/test/path',
        name: 'test-extension',
        version: '1.2.3',
      })

      const additionalData = {
        userId: 'test-user',
        operation: 'test-operation',
        count: 42,
      }

      const result = createDebugInfo('Test message', context, additionalData)

      expect(result).toEqual({
        message: 'Test message',
        extension_name: 'test-extension',
        version: '1.2.3',
        timestamp: LOG_TIMESTAMP,
        userId: 'test-user',
        operation: 'test-operation',
        count: 42,
      })
    })

    it('should handle missing extension context gracefully', () => {
      const contextWithoutPackageJSON = {
        ...createMockExtensionContext({
          extensionPath: '/test/path',
        }),
        extension: {
          ...createMockExtensionContext({ extensionPath: '/test/path' }).extension,
          packageJSON: undefined,
        },
      }

      const result = createDebugInfo('Test message', contextWithoutPackageJSON)

      expect(result).toEqual({
        message: 'Test message',
        extension_name: 'unknown',
        version: 'unknown',
        timestamp: LOG_TIMESTAMP,
      })
    })
  })

  describe('createDebugInfoText', () => {
    it('should format debug info as JSON string', () => {
      const context = createMockExtensionContext({
        extensionPath: '/test/path',
        name: 'test-extension',
        version: '1.2.3',
      })

      const result = createDebugInfoText('Test message', context, { extra: 'data' })

      const expectedDebugInfo = {
        message: 'Test message',
        extension_name: 'test-extension',
        version: '1.2.3',
        timestamp: LOG_TIMESTAMP,
        extra: 'data',
      }

      expect(result).toBe(JSON.stringify(expectedDebugInfo, null, 2))
    })

    it('should handle minimal parameters', () => {
      const result = createDebugInfoText('Simple message')

      const expectedDebugInfo = {
        message: 'Simple message',
        extension_name: 'unknown',
        version: 'unknown',
        timestamp: LOG_TIMESTAMP,
      }

      expect(result).toBe(JSON.stringify(expectedDebugInfo, null, 2))
    })
  })

  describe('copyDebugInfoToClipboard', () => {
    it('should copy debug info to clipboard and show success message', async () => {
      const context = createMockExtensionContext({
        extensionPath: '/test/path',
        name: 'test-extension',
        version: '1.2.3',
      })

      await copyDebugInfoToClipboard('Test error', context, { error: 'details' })

      const expectedDebugInfo = {
        message: 'Test error',
        extension_name: 'test-extension',
        version: '1.2.3',
        timestamp: LOG_TIMESTAMP,
        error: 'details',
      }

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify(expectedDebugInfo, null, 2),
      )
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Debug information copied to clipboard',
      )
    })

    it('should handle copy operation without additional data', async () => {
      await copyDebugInfoToClipboard('Simple error')

      const expectedDebugInfo = {
        message: 'Simple error',
        extension_name: 'unknown',
        version: 'unknown',
        timestamp: LOG_TIMESTAMP,
      }

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify(expectedDebugInfo, null, 2),
      )
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Debug information copied to clipboard',
      )
    })

    it('should handle clipboard write error gracefully', async () => {
      const context = createMockExtensionContext({
        extensionPath: '/test/path',
        name: 'test-extension',
        version: '1.2.3',
      })

      // Mock clipboard writeText to throw an error
      ;(vscode.env.clipboard.writeText as any).mockRejectedValue(new Error('Clipboard error'))

      await copyDebugInfoToClipboard('Test error', context, { error: 'details' })

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to copy debug information: Clipboard error',
      )
    })
  })
})
