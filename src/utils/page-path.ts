import { relative, join, sep } from 'path'
import { workspace, window } from 'vscode'
import type { TextDocument } from 'vscode'
import { debug } from './debug'

/** Helper function to show warning message with proper async handling */
async function showWarningMessage(message: string): Promise<void> {
  try {
    await window.showWarningMessage(message)
  } catch (error) {
    console.error('Failed to show warning message:', error)
  }
}

/** Result of document type detection */
export interface DocumentPathInfo {
  type: 'page' | 'snippet' | 'default' | 'error'
  path?: string
  snippetName?: string
  errorMessage?: string
}

/**
 * Gets the page path relative to the configured pages directory
 * @param document The VS Code document being previewed
 * @param pagesDirectory The configured pages directory relative to workspace root
 * @returns The calculated page path, or null if document is outside pages directory
 */
function getPagePath(document: TextDocument, pagesDirectory: string): string | null {
  // If no pages directory is configured or it's empty, not a page
  if (!pagesDirectory || pagesDirectory.trim() === '') {
    debug.log('No pages directory configured')
    return null
  }

  // Get the workspace folder for this document
  const workspaceFolder = workspace.getWorkspaceFolder(document.uri)
  if (!workspaceFolder) {
    debug.log('Document is not in a workspace folder')
    return null
  }

  // Calculate the full path to the pages directory
  const pagesDirectoryPath = join(workspaceFolder.uri.fsPath, pagesDirectory.trim())

  // Get the document's file path
  const documentPath = document.uri.fsPath

  debug.log('Path calculation:', {
    documentPath,
    pagesDirectoryPath,
    pagesDirectory: pagesDirectory.trim(),
    workspaceRoot: workspaceFolder.uri.fsPath,
  })

  // Check if the document is within the pages directory
  const relativePath = relative(pagesDirectoryPath, documentPath)

  // If the relative path starts with '..', the document is outside the pages directory
  if (relativePath.startsWith('..')) {
    debug.log('Document is outside pages directory', {
      relativePath,
    })
    return null
  }

  // Remove the file extension and normalize the path
  const pathWithoutExtension = relativePath.replace(/\.(md|mdc)$/i, '')

  // Special case: home.md or home.mdc at the root of pages directory should be "/"
  if (pathWithoutExtension === 'home') {
    debug.log('Document is home.md/home.mdc at pages directory root, using path "/"', {
      relativePath,
      pathWithoutExtension,
    })
    return '/'
  }

  // Convert path separators to forward slashes and sanitize
  let sanitizedPath = pathWithoutExtension.split(sep).join('/')

  // Apply the regex filter to remove invalid characters: /^[\w/-]+$/
  // This keeps only word characters (a-z, A-Z, 0-9, _), forward slashes, and hyphens
  sanitizedPath = sanitizedPath.replace(/[^\w/-]/g, '')

  // Ensure the path starts with '/'
  const finalPath = sanitizedPath ? `/${sanitizedPath}` : '/'

  debug.log('Calculated page path:', {
    originalPath: relativePath,
    pathWithoutExtension,
    sanitizedPath,
    finalPath,
  })

  return finalPath
}

/**
 * Checks if a document is in a snippets subdirectory (which is not supported)
 * @param document The VS Code document being checked
 * @param snippetsDirectory The configured snippets directory relative to workspace root
 * @returns Error message if in subdirectory, null otherwise
 */
function checkSnippetSubdirectoryError(document: TextDocument, snippetsDirectory: string): string | null {
  // If no snippets directory is configured, no error
  if (!snippetsDirectory || snippetsDirectory.trim() === '') {
    return null
  }

  const workspaceFolder = workspace.getWorkspaceFolder(document.uri)
  if (!workspaceFolder) {
    return null
  }

  const snippetsDirectoryPath = join(workspaceFolder.uri.fsPath, snippetsDirectory.trim())
  const documentPath = document.uri.fsPath
  const relativePath = relative(snippetsDirectoryPath, documentPath)

  // If document is outside snippets directory, no error
  if (relativePath.startsWith('..')) {
    return null
  }

  // Check if document is in a subdirectory (contains path separator)
  if (relativePath.includes(sep)) {
    return `Snippets in subdirectories are not supported. Please move "${document.fileName}" to the root of your snippets directory.`
  }

  return null
}

/**
 * Gets the snippet name for a document in the snippets directory
 * @param document The VS Code document being previewed
 * @param snippetsDirectory The configured snippets directory relative to workspace root
 * @returns The snippet name or null if document is not a valid snippet
 */
function getSnippetName(document: TextDocument, snippetsDirectory: string): string | null {
  // If no snippets directory is configured or it's empty, not a snippet
  if (!snippetsDirectory || snippetsDirectory.trim() === '') {
    debug.log('No snippets directory configured')
    return null
  }

  // Get the workspace folder for this document
  const workspaceFolder = workspace.getWorkspaceFolder(document.uri)
  if (!workspaceFolder) {
    debug.log('Document is not in a workspace folder')
    return null
  }

  // Calculate the full path to the snippets directory
  const snippetsDirectoryPath = join(workspaceFolder.uri.fsPath, snippetsDirectory.trim())

  // Get the document's file path
  const documentPath = document.uri.fsPath

  debug.log('Snippet detection:', {
    documentPath,
    snippetsDirectoryPath,
    snippetsDirectory: snippetsDirectory.trim(),
  })

  // Check if the document is within the snippets directory
  const relativePath = relative(snippetsDirectoryPath, documentPath)

  // If the relative path starts with '..', the document is outside the snippets directory
  if (relativePath.startsWith('..')) {
    debug.log('Document is outside snippets directory')
    return null
  }

  // Note: Subdirectory check is now handled in getDocumentPathInfo before calling this function

  // Remove the file extension and sanitize
  const filenameWithoutExtension = relativePath.replace(/\.(md|mdc)$/i, '')

  // Apply the regex filter to remove invalid characters: /^[\w-]+$/
  // This keeps only word characters (a-z, A-Z, 0-9, _) and hyphens
  const sanitizedName = filenameWithoutExtension.replace(/[^\w-]/g, '')

  // Validate that we have a valid snippet name
  if (!sanitizedName) {
    debug.log('Invalid snippet name after sanitization')
    return null
  }

  debug.log('Calculated snippet name:', {
    originalPath: relativePath,
    filenameWithoutExtension,
    sanitizedName,
  })

  return sanitizedName
}

/**
 * Determines the document type and calculates appropriate path/snippet info
 * @param document The VS Code document being previewed
 * @param pagesDirectory The configured pages directory
 * @param snippetsDirectory The configured snippets directory
 * @returns Document path information with type and calculated values
 */
export function getDocumentPathInfo(
  document: TextDocument,
  pagesDirectory: string,
  snippetsDirectory: string,
): DocumentPathInfo {
  // Check if there's a snippets subdirectory warning
  const snippetWarning = checkSnippetSubdirectoryError(document, snippetsDirectory)
  if (snippetWarning) {
    // Show warning message to user but continue to load the preview
    showWarningMessage(snippetWarning)
  }

  // Then check if it's a snippet
  const snippetName = getSnippetName(document, snippetsDirectory)
  if (snippetName) {
    // Generate snippet path for navigation: /_preview-mode/snippets/<name>
    const snippetPath = `/_preview-mode/snippets/${snippetName}`
    return {
      type: 'snippet',
      path: snippetPath,
      snippetName,
    }
  }

  // Then check if it's a page
  if (pagesDirectory && pagesDirectory.trim() !== '') {
    const pagePath = getPagePath(document, pagesDirectory)
    if (pagePath !== null) { // null means it wasn't in the pages directory
      return {
        type: 'page',
        path: pagePath,
      }
    }
  }

  // Default behavior for files not in either directory
  return {
    type: 'default',
    path: '/',
  }
}
