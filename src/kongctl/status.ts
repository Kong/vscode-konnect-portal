import * as vscode from 'vscode'
import type { KongctlConfig, FileStats, DiagnosticInfo } from '../types/kongctl'
import { executeKongctl, findExecutableInPath } from './index'

/**
 * Check if kongctl is available and working
 * @returns Promise resolving to true if kongctl is available
 */
export async function checkKongctlAvailable(): Promise<boolean> {
  try {
    const result = await executeKongctl(['version', '--full', '--output', 'json'], {})
    return result.success
  } catch {
    return false
  }
}

/**
 * Get diagnostic information about kongctl availability
 * @returns Promise resolving to diagnostic information
 */
export async function getKongctlDiagnostics(): Promise<DiagnosticInfo> {
  const config = vscode.workspace.getConfiguration('kong.konnect.kongctl')
  const configuredPath = config.get<string>('path', 'kongctl')
  const pathEnv = process.env.PATH || ''
  const pathSeparator = process.platform === 'win32' ? ';' : ':'
  const pathDirectories = pathEnv.split(pathSeparator).filter(dir => dir.trim() !== '')
  const foundInPath = await findExecutableInPath('kongctl')

  let fileStats: FileStats | undefined

  if (foundInPath) {
    try {
      const fs = await import('fs')
      const stats = await fs.promises.stat(foundInPath)
      fileStats = {
        exists: true,
        size: stats.size,
        isExecutable: !!(stats.mode & fs.constants.F_OK),
      }
    } catch {
      fileStats = {
        exists: false,
      }
    }
  }

  return {
    configuredPath,
    pathEnv,
    foundInPath,
    pathDirectories,
    fileStats,
  }
}

/**
 * Get the current kongctl configuration
 * @returns Current kongctl configuration from VS Code settings
 */
export function getKongctlConfig(): KongctlConfig {
  const config = vscode.workspace.getConfiguration('kong.konnect.kongctl')
  return {
    path: config.get<string>('path', 'kongctl'),
    timeout: config.get<number>('timeout', 30000),
  }
}
