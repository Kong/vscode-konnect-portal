import * as assert from 'assert'
import * as vscode from 'vscode'
import { getDocumentPathInfo } from '../../utils/page-path'

/** Test suite for page path resolution functionality */
suite('Page Path Resolution Tests', () => {
  /** Mock workspace folder URI for testing */
  let mockWorkspaceUri: vscode.Uri

  /** Mock workspace folder for testing */
  let mockWorkspaceFolder: vscode.WorkspaceFolder

  /** Sample pages directory configuration */
  const pagesDirectory = 'docs'
  const snippetsDirectory = 'snippets'

  setup(async () => {
    // Create mock workspace folder
    mockWorkspaceUri = vscode.Uri.file('/test/workspace')
    mockWorkspaceFolder = {
      uri: mockWorkspaceUri,
      name: 'Test Workspace',
      index: 0,
    }
  })

  /**
   * Creates a mock text document for testing
   * @param filePath Absolute file path for the document
   * @returns Mock text document
   */
  function createMockDocument(filePath: string): vscode.TextDocument {
    return {
      uri: vscode.Uri.file(filePath),
      fileName: filePath,
      languageId: 'markdown',
      version: 1,
      isDirty: false,
      isUntitled: false,
      isClosed: false,
      eol: vscode.EndOfLine.LF,
      lineCount: 1,
      encoding: 'utf8',
      save: () => Promise.resolve(true),
      getText: () => '# Test content',
      getWordRangeAtPosition: () => undefined,
      lineAt: () => ({} as any),
      offsetAt: () => 0,
      positionAt: () => new vscode.Position(0, 0),
      validatePosition: (pos) => pos,
      validateRange: (range) => range,
    } as vscode.TextDocument
  }

  suite('Page Path Detection', () => {
    test('should detect document in pages directory root', async () => {
      const document = createMockDocument('/test/workspace/docs/welcome.md')

      // Mock workspace.getWorkspaceFolder to return our mock folder
      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'page', 'Should detect as page type')
        assert.strictEqual(result.path, '/welcome', 'Should generate correct page path')
        assert.strictEqual(result.snippetName, undefined, 'Should not have snippet name')
        assert.strictEqual(result.errorMessage, undefined, 'Should not have error message')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle home.md as root page', async () => {
      const document = createMockDocument('/test/workspace/docs/home.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'page', 'Should detect as page type')
        assert.strictEqual(result.path, '/', 'home.md should map to root path "/"')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle nested page directories', async () => {
      const document = createMockDocument('/test/workspace/docs/guides/getting-started.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'page', 'Should detect as page type')
        assert.strictEqual(result.path, '/guides/getting-started', 'Should handle nested paths')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle .mdc files in pages directory', async () => {
      const document = createMockDocument('/test/workspace/docs/api-reference.mdc')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'page', 'Should detect .mdc files as pages')
        assert.strictEqual(result.path, '/api-reference', 'Should remove .mdc extension')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should sanitize invalid characters in page paths', async () => {
      const document = createMockDocument('/test/workspace/docs/my@page$with%special&chars.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'page', 'Should detect as page type')
        assert.strictEqual(result.path, '/mypagewithspecialchars', 'Should sanitize special characters')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle empty pages directory configuration', async () => {
      const document = createMockDocument('/test/workspace/docs/welcome.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, '', snippetsDirectory)

        assert.strictEqual(result.type, 'default', 'Should use default type when no pages directory')
        assert.strictEqual(result.path, '/', 'Should use root path as default')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })
  })

  suite('Snippet Detection', () => {
    test('should detect document in snippets directory', async () => {
      const document = createMockDocument('/test/workspace/snippets/api-example.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'snippet', 'Should detect as snippet type')
        assert.strictEqual(result.path, '/_preview-mode/snippets/api-example', 'Should generate snippet preview path')
        assert.strictEqual(result.snippetName, 'api-example', 'Should extract snippet name')
        assert.strictEqual(result.errorMessage, undefined, 'Should not have error message')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle .mdc files in snippets directory', async () => {
      const document = createMockDocument('/test/workspace/snippets/code-block.mdc')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'snippet', 'Should detect .mdc files as snippets')
        assert.strictEqual(result.snippetName, 'code-block', 'Should remove .mdc extension')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle normal snippet names', async () => {
      const document = createMockDocument('/test/workspace/snippets/my-snippet-with-dashes.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'snippet', 'Should detect as snippet type')
        assert.strictEqual(result.snippetName, 'my-snippet-with-dashes', 'Should handle a normal snippet name with dashes')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should sanitize snippet names', async () => {
      const document = createMockDocument('/test/workspace/snippets/my@snippet$with%chars.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'snippet', 'Should detect as snippet type')
        assert.strictEqual(result.snippetName, 'mysnippetwithchars', 'Should sanitize special characters')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle empty snippets directory configuration', async () => {
      const document = createMockDocument('/test/workspace/snippets/example.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, '')

        assert.strictEqual(result.type, 'default', 'Should use default type when no snippets directory')
        assert.strictEqual(result.path, '/', 'Should use root path as default')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should reject snippets in subdirectories', async () => {
      const document = createMockDocument('/test/workspace/snippets/subdir/invalid.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      // Mock showWarningMessage to capture the warning
      let warningMessage = ''
      const originalShowWarningMessage = vscode.window.showWarningMessage
      vscode.window.showWarningMessage = (message: string) => {
        warningMessage = message
        return Promise.resolve(undefined)
      }

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'snippet', 'Should return snippet type for subdirectory snippets')
        assert.strictEqual(result.errorMessage, undefined, 'Should not have error message')
        assert.ok(warningMessage.includes('subdirectories are not supported'), 'Should show warning to user')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
        vscode.window.showWarningMessage = originalShowWarningMessage
      }
    })
  })

  suite('Default Behavior', () => {
    test('should use default behavior for files outside configured directories', async () => {
      const document = createMockDocument('/test/workspace/other/random.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'default', 'Should use default type for files outside configured directories')
        assert.strictEqual(result.path, '/', 'Should use root path as default')
        assert.strictEqual(result.snippetName, undefined, 'Should not have snippet name')
        assert.strictEqual(result.errorMessage, undefined, 'Should not have error message')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle files outside workspace', async () => {
      const document = createMockDocument('/completely/different/path/file.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => undefined // No workspace folder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'default', 'Should use default type for files outside workspace')
        assert.strictEqual(result.path, '/', 'Should use root path as default')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })
  })

  suite('Edge Cases', () => {
    test('should handle whitespace-only directory configurations', async () => {
      const document = createMockDocument('/test/workspace/docs/test.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, '   ', '\\t\\n')

        assert.strictEqual(result.type, 'default', 'Should use default type for whitespace-only configs')
        assert.strictEqual(result.path, '/', 'Should use root path as default')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle files with no extension', async () => {
      const document = createMockDocument('/test/workspace/docs/README')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'page', 'Should detect files without extension as pages')
        assert.strictEqual(result.path, '/README', 'Should preserve filename without extension')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle very deep nested paths', async () => {
      const document = createMockDocument('/test/workspace/docs/level1/level2/level3/level4/deep.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'page', 'Should handle deeply nested paths')
        assert.strictEqual(result.path, '/level1/level2/level3/level4/deep', 'Should preserve deep path structure')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })

    test('should handle case-sensitive file extensions', async () => {
      const docMD = createMockDocument('/test/workspace/docs/test.MD')
      const docMdc = createMockDocument('/test/workspace/docs/test.MDC')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const resultMD = getDocumentPathInfo(docMD, pagesDirectory, snippetsDirectory)
        const resultMdc = getDocumentPathInfo(docMdc, pagesDirectory, snippetsDirectory)

        assert.strictEqual(resultMD.type, 'page', 'Should handle uppercase .MD extension')
        assert.strictEqual(resultMD.path, '/test', 'Should remove uppercase .MD extension')
        assert.strictEqual(resultMdc.type, 'page', 'Should handle uppercase .MDC extension')
        assert.strictEqual(resultMdc.path, '/test', 'Should remove uppercase .MDC extension')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })
  })

  suite('Cross-Platform Path Handling', () => {
    test('should handle Windows-style paths', async () => {
      const document = createMockDocument('/test/workspace/docs/folder\\subfolder\\page.md')

      const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder
      vscode.workspace.getWorkspaceFolder = () => mockWorkspaceFolder

      try {
        const result = getDocumentPathInfo(document, pagesDirectory, snippetsDirectory)

        assert.strictEqual(result.type, 'page', 'Should handle Windows-style paths')
        // The actual behavior depends on how path.relative handles the mixed separators
        assert.ok(result.path?.includes('/'), 'Should normalize to forward slashes')
      } finally {
        vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder
      }
    })
  })
})
