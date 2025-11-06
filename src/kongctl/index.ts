import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { spawn } from 'child_process'
import type { KongctlConfig, KongctlCommandResult, FileStats, DiagnosticInfo } from '../types/kongctl'
import type { PortalStorageService } from '../konnect/storage'

const exists = promisify(fs.exists)

/**
 * Search for an executable in the PATH
 * @param executable - Name of the executable to find
 * @returns Promise resolving to the full path if found, or null if not found
 */
async function findExecutableInPath(executable: string): Promise<string | null> {
  const pathEnv = process.env.PATH || ''
  const pathSeparator = process.platform === 'win32' ? ';' : ':'
  const executableSuffix = process.platform === 'win32' ? '.exe' : ''
  const executableName = executable + executableSuffix

  const pathDirectories = pathEnv.split(pathSeparator)

  for (const directory of pathDirectories) {
    if (!directory) continue

    const fullPath = path.join(directory, executableName)
    try {
      if (await exists(fullPath)) {
        return fullPath
      }
    } catch {
      // Continue searching if we can't access this directory
      continue
    }
  }

  return null
}

/**
 * Get the configured kongctl path from VS Code settings
 * @returns Promise resolving to the kongctl executable path
 */
export async function getKongctlPath(): Promise<string> {
  // Check user configuration first
  const config = vscode.workspace.getConfiguration('kong.konnect.kongctl')
  const configuredPath = config.get<string>('path', 'kongctl')

  if (configuredPath && configuredPath !== 'kongctl') {
    if (await exists(configuredPath)) {
      return configuredPath
    } else {
      vscode.window.showWarningMessage(
        `Configured kongctl path not found: ${configuredPath}. Falling back to PATH lookup.`,
      )
    }
  }

  // Try to find in PATH
  const pathResult = await findExecutableInPath('kongctl')
  if (pathResult) {
    return pathResult
  }

  // Fallback to just 'kongctl' and let the system try to find it
  return 'kongctl'
}

/**
 * Check if kongctl is available and working
 * @param storageService - Optional storage service to get Konnect PAT
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
 * Execute a kongctl command with the given arguments
 * @param args - Command arguments to pass to kongctl
 * @param options - Optional execution options
 * @param storageService - Optional storage service to get Konnect PAT
 * @returns Promise resolving to command result
 */
export async function executeKongctl(
  args: string[],
  options: { timeout?: number, cwd?: string } = {},
  storageService?: PortalStorageService,
): Promise<KongctlCommandResult> {
  const kongctlPath = await getKongctlPath()
  const config = vscode.workspace.getConfiguration('kong.konnect.kongctl')
  const timeout = options.timeout ?? config.get<number>('timeout', 30000)

  // Prepare environment variables, including PAT if available
  const env = { ...process.env }

  // Add Konnect PAT to environment if available and valid
  if (storageService) {
    try {
      const token = await storageService.getToken()
      if (token && token.trim()) {
        env.KONGCTL_DEFAULT_KONNECT_PAT = token
      }
    } catch {
      // Silently continue without token if retrieval fails
      // This ensures kongctl commands work even if token access fails
    }
  }

  return new Promise((resolve) => {
    const child = spawn(kongctlPath, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true, // Use shell to resolve PATH and environment issues
      env, // Pass environment with potential PAT
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({
        exitCode: -1,
        stdout,
        stderr: stderr + '\nCommand timed out',
        success: false,
      })
    }, timeout)

    child.on('close', (code) => {
      clearTimeout(timeoutId)
      resolve({
        exitCode: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: code === 0,
      })
    })

    child.on('error', (error) => {
      clearTimeout(timeoutId)
      const errorMessage = error.message
      const isNotFound = errorMessage.includes('ENOENT') || errorMessage.includes('command not found')

      resolve({
        exitCode: -1,
        stdout,
        stderr: isNotFound
          ? `kongctl executable not found at path: ${kongctlPath}. Error: ${errorMessage}`
          : errorMessage,
        success: false,
      })
    })
  })
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
