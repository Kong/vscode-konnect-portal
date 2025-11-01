import { relative, join, sep } from 'path'
import { workspace } from 'vscode'
import type { TextDocument } from 'vscode'
import { debug } from './debug'

/**
 * Calculates the page path relative to the configured pages directory
 * @param document The VS Code document being previewed
 * @param pagesDirectory The configured pages directory relative to workspace root
 * @returns The calculated page path or '/' if no pages directory is configured or document is outside pages directory
 */
export function calculatePagePath(document: TextDocument, pagesDirectory: string): string {
  // If no pages directory is configured or it's empty, use default path
  if (!pagesDirectory || pagesDirectory.trim() === '') {
    debug.log('No pages directory configured, using default path "/"')
    return '/'
  }

  // Get the workspace folder for this document
  const workspaceFolder = workspace.getWorkspaceFolder(document.uri)
  if (!workspaceFolder) {
    debug.log('Document is not in a workspace folder, using default path "/"')
    return '/'
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
    debug.log('Document is outside pages directory, using default path "/"', {
      relativePath,
    })
    return '/'
  }

  // Remove the file extension and normalize the path
  const pathWithoutExtension = relativePath.replace(/\.(md|mdc)$/i, '')

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
