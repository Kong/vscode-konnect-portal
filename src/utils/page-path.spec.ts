import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getDocumentPathInfo } from './page-path'
import { createMockTextDocument, createMockWorkspaceFolder } from '../../tests/test-utils'

describe('page-path', () => {
  let mockWorkspace: any
  let mockWindow: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Get mocked modules
    mockWorkspace = (await import('vscode')).workspace
    mockWindow = (await import('vscode')).window

    // Mock workspace.getConfiguration for debug utility
    mockWorkspace.getConfiguration.mockReturnValue({
      get: vi.fn(() => false), // Default debug to false
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getDocumentPathInfo', () => {
    describe('pages functionality', () => {
      it('should return page type with correct path for file in pages directory', () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'about.md',
          fsPath: '/workspace/pages/about.md',
          content: '# About',
        })

        mockWorkspace.getWorkspaceFolder.mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, 'pages', '')

        expect(result).toEqual({
          type: 'page',
          path: '/about',
        })
      })

      it('should return page type with nested path for subdirectory file', () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'installation.md',
          fsPath: '/workspace/pages/guides/installation.md',
          content: '# Installation',
        })

        mockWorkspace.getWorkspaceFolder.mockReturnValue(workspaceFolder)

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

        mockWorkspace.getWorkspaceFolder.mockReturnValue(workspaceFolder)

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
          content: '# README',
        })

        mockWorkspace.getWorkspaceFolder.mockReturnValue(workspaceFolder)

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
          fileName: 'api-example.md',
          fsPath: '/workspace/snippets/api-example.md',
          content: 'Code example',
        })

        mockWorkspace.getWorkspaceFolder.mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, '', 'snippets')

        expect(result).toEqual({
          type: 'snippet',
          path: '/_preview-mode/snippets/api-example',
          snippetName: 'api-example',
        })
      })

      it('should return error for snippet in subdirectory', () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'example.md',
          fsPath: '/workspace/snippets/nested/example.md',
          content: '# Example',
        })

        mockWorkspace.getWorkspaceFolder.mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, '', 'snippets')

        expect(result).toEqual({
          type: 'error',
          errorMessage: 'Snippets in subdirectories are not supported. Please move "example.md" to the root of your snippets directory.',
        })
        expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
          'Snippets in subdirectories are not supported. Please move "example.md" to the root of your snippets directory.',
        )
      })
    })

    describe('edge cases', () => {
      it('should handle empty directory configurations', () => {
        const workspaceFolder = createMockWorkspaceFolder({ name: 'workspace', fsPath: '/workspace' })
        const document = createMockTextDocument({
          fileName: 'example.md',
          fsPath: '/workspace/example.md',
          content: '# Example',
        })

        mockWorkspace.getWorkspaceFolder.mockReturnValue(workspaceFolder)

        const result = getDocumentPathInfo(document, '', '')

        expect(result).toEqual({
          type: 'default',
          path: '/',
        })
      })

      it('should handle document outside workspace', () => {
        const document = createMockTextDocument({
          fileName: 'example.md',
          fsPath: '/other/example.md',
          content: '# Example',
        })

        mockWorkspace.getWorkspaceFolder.mockReturnValue(null)

        const result = getDocumentPathInfo(document, 'pages', 'snippets')

        expect(result).toEqual({
          type: 'default',
          path: '/',
        })
      })
    })
  })
})
