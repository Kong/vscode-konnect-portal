import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { getOrCreateKongctlTerminal } from '../terminal'
import { createAsyncLock } from '../utils/async-lock'
import type { KongctlCommandResult } from '../types/kongctl'
import type { PortalStorageService } from '../storage'

const exists = promisify(fs.exists)

/**
 * Serializes access to the shared kongctl terminal. VS Code's shell
 * integration API is not designed for overlapping concurrent executions on
 * one terminal -- calling `executeCommand` again before a prior execution has
 * finished corrupts output correlation between commands. Multiple callers
 * (e.g. fetching several Konnect regions in parallel) can invoke
 * `executeKongctl` concurrently, so terminal-backed runs must queue.
 *
 * Scope: this only serializes callers that go through `executeKongctl` with
 * `showInTerminal` left at its default (true). It does NOT protect the
 * shared terminal from `src/kongctl/install.ts`'s `installWithHomebrew` or
 * `src/extension.ts`'s "Run Command" feature, both of which call
 * `getOrCreateKongctlTerminal`/`sendText` directly. Those are single,
 * user-initiated actions rather than fan-out from this extension's own code,
 * so the risk is low today, but they are not covered by this lock.
 */
const terminalLock = createAsyncLock()

/**
 * Search for an executable in the PATH
 * @param executable - Name of the executable to find
 * @returns Promise resolving to the full path if found, or null if not found
 */
export async function findExecutableInPath(executable: string): Promise<string | null> {
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
 * Execute a kongctl command with the given arguments
 * @param args - Command arguments to pass to kongctl
 * @param options - Optional execution options
 * @param storageService - Optional storage service to get Konnect PAT
 * @returns Promise resolving to command result
 */

export async function executeKongctl(
  args: string[],
  options: { timeout?: number, cwd?: string, showInTerminal?: boolean } = {},
  storageService?: PortalStorageService,
): Promise<KongctlCommandResult> {
  const config = vscode.workspace.getConfiguration('kong.konnect.kongctl')
  const timeout = options.timeout ?? config.get<number>('timeout', 30000)
  const showInTerminal = options.showInTerminal !== false // default true

  // Always prepare environment with token if available
  const env = { ...process.env }
  if (storageService) {
    try {
      const token = await storageService.getToken()
      if (token && token.trim()) {
        env.KONGCTL_DEFAULT_KONNECT_PAT = token
      }
    } catch {
      // Silently continue without token if retrieval fails
    }
  }

  if (showInTerminal) {
    // Serialized: only one terminal-backed command may run at a time
    const terminalResult = await terminalLock.run(() => runViaTerminal(args, env, timeout))
    if (terminalResult) {
      return terminalResult
    }
    // Terminal or its shell integration was unavailable -- fall through to spawn
  }

  return runViaSpawn(args, options.cwd, env, timeout)
}

/**
 * Runs a kongctl command through the shared VS Code terminal, using shell
 * integration to capture output. Must only be called while holding
 * `terminalLock`, since the terminal cannot safely handle overlapping
 * concurrent executions.
 * @param args Command arguments to pass to kongctl
 * @param env Environment variables for the command (including the PAT, if available)
 * @param timeout Timeout in milliseconds before the command is considered failed
 * @returns The command result, or undefined if the terminal/shell integration is unavailable
 */
async function runViaTerminal(
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout: number,
): Promise<KongctlCommandResult | undefined> {
  const fullCommand = `kongctl ${args.join(' ')}`

  let terminal: vscode.Terminal | undefined
  try {
    terminal = getOrCreateKongctlTerminal(env)
  } catch {
    // If terminal API fails, continue to spawn fallback for output
    return undefined
  }

  if (!terminal.shellIntegration) {
    // No shell integration available to capture output with. Don't type the
    // command into the terminal here -- the spawn fallback below will run it
    // independently, and running both would execute the command twice.
    return undefined
  }

  try {
    // executeCommand both types the command into the terminal and runs it
    // (visible if the user opens the terminal panel), so sendText must never
    // also be called here -- doing both would execute the command twice.
    const execution = terminal.shellIntegration.executeCommand(fullCommand)
    const stream = execution.read()
    let stdout = ''
    const timeoutPromise = new Promise<KongctlCommandResult>((resolve) => {
      setTimeout(() => {
        resolve({
          exitCode: -1,
          stdout,
          stderr: 'Command timed out',
          success: false,
        })
      }, timeout)
    })
    const outputPromise = (async (): Promise<KongctlCommandResult> => {
      try {
        for await (const data of stream) {
          stdout += data
        }
        return new Promise((resolve) => {
          const onEnd = vscode.window.onDidEndTerminalShellExecution((event) => {
            if (event.execution === execution) {
              onEnd.dispose()
              const exitCode = event.exitCode ?? 0
              resolve({
                exitCode,
                stdout: stdout.trim(),
                stderr: '',
                success: exitCode === 0,
              })
            }
          })
        })
      } catch (error) {
        return {
          exitCode: -1,
          stdout,
          stderr: error instanceof Error ? error.message : 'Unknown error occurred',
          success: false,
        }
      }
    })()
    return await Promise.race([outputPromise, timeoutPromise])
  } catch {
    // If shell integration fails, fall through to spawn fallback
    return undefined
  }
}

/**
 * Runs a kongctl command via a spawned child process, capturing its output
 * directly. Used for tests, and as a fallback when the shared terminal or its
 * shell integration is unavailable. Each invocation is an independent
 * process, so unlike the terminal path this is safe to run concurrently.
 * @param args Command arguments to pass to kongctl
 * @param cwd Optional working directory for the command
 * @param env Environment variables for the command (including the PAT, if available)
 * @param timeout Timeout in milliseconds before the command is killed
 * @returns The command result
 */
async function runViaSpawn(
  args: string[],
  cwd: string | undefined,
  env: NodeJS.ProcessEnv,
  timeout: number,
): Promise<KongctlCommandResult> {
  const { spawn } = await import('child_process')
  const kongctlPath = await getKongctlPath()
  return new Promise((resolve) => {
    const child = spawn(kongctlPath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env,
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
