import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { workspace, window } from 'vscode'
import { getDocumentPathInfo } from './page-path'
import { createMockTextDocument, createMockWorkspaceFolder } from '../test/utils/test-utils'

// Mock VS Code module - only what this test file needs
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
    getWorkspaceFolder: vi.fn(),
  },
  window: {
    showErrorMessage: vi.fn(),
  },
}))

describe('page-path', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock workspace.getConfiguration for debug utility
    vi.mocked(workspace.getConfiguration).mockReturnValue({
      get: vi.fn(() => false), // Default debug to false
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getDocumentPathInfo', () => {
    describe('pages functionality', () => {
      it('should return page type with correct path for file in pages directory', async () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'test.md',
          fsPath: '/workspace/pages/test.md',
          content: '# Test Page',
        })

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, 'pages', '')

        expect(result).toEqual({
          type: 'page',
          path: '/test',
        })
      })

      it('should return page type with nested path for subdirectory file', async () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'installation.md',
          fsPath: '/workspace/pages/guides/installation.md',
          content: '# Installation',
        })

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, 'pages', '')

        expect(result).toEqual({
          type: 'page',
          path: '/guides/installation',
        })
      })

      it('should return page type with root path for home.md', () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'home.md',
          fsPath: '/workspace/pages/home.md',
          content: '# Home',
        })

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, 'pages', '')

        expect(result).toEqual({
          type: 'page',
          path: '/',
        })
      })

      it('should return default type for file outside pages directory', () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'readme.md',
          fsPath: '/workspace/docs/readme.md',
          content: '# Readme',
        })

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, 'pages', '')

        expect(result).toEqual({
          type: 'default',
          path: '/',
        })
      })
    })

    describe('snippets functionality', () => {
      it('should return snippet type with correct name and path for file in snippets directory', () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'example.md',
          fsPath: '/workspace/snippets/example.md',
          content: '# Example snippet',
        })

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, '', 'snippets')

        expect(result).toEqual({
          type: 'snippet',
          path: '/_preview-mode/snippets/example',
          snippetName: 'example',
        })
      })

      it('should return error for snippet in subdirectory', () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'nested.md',
          fsPath: '/workspace/snippets/category/nested.md',
          content: '# Nested snippet',
        })

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, '', 'snippets')

        expect(vi.mocked(window.showErrorMessage)).toHaveBeenCalledWith(
          'Snippets in subdirectories are not supported. Please move "nested.md" to the root of your snippets directory.',
        )
        expect(result).toEqual({
          type: 'error',
          errorMessage: 'Snippets in subdirectories are not supported. Please move "nested.md" to the root of your snippets directory.',
        })
      })
    })

    describe('edge cases', () => {
      it('should handle empty directory configurations', () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'test.md',
          fsPath: '/workspace/content/test.md',
          content: '# Test',
        })

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, '', '')

        expect(result).toEqual({
          type: 'default',
          path: '/',
        })
      })

      it('should handle document outside workspace', () => {
        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(undefined)

        const document = createMockTextDocument({
          fileName: 'external.md',
          fsPath: '/external/external.md',
          content: '# External',
        })

        const result = getDocumentPathInfo(document, 'pages', '')

        expect(result).toEqual({
          type: 'default',
          path: '/',
        })
      })
    })
  })
})
