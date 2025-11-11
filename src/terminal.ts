import { KONGCTL_TERMINAL_NAME } from './constants/kongctl'
import {
  window,
} from 'vscode'
import type { Terminal } from 'vscode'

/** Global instance of the kongctl terminal for reuse */
let kongctlTerminal: Terminal | undefined

/**
 * Gets or creates the shared kongctl terminal instance
 * @param env Optional environment variables to set for the terminal
 * @returns The kongctl terminal instance
 */
export function getOrCreateKongctlTerminal(env?: Record<string, string | undefined>): Terminal {
  let recreate = false
  if (kongctlTerminal) {
    // If terminal is disposed, recreate
    try {
      // If terminal is disposed, VS Code throws on .name
      if (kongctlTerminal.name !== KONGCTL_TERMINAL_NAME) {
        recreate = true
      }
    } catch {
      recreate = true
    }
  }

  if (!kongctlTerminal || recreate) {
    if (kongctlTerminal) {
      try {
        kongctlTerminal.dispose()
      } catch {
        // Ignore errors on dispose
      }
    }
    kongctlTerminal = window.createTerminal({
      name: KONGCTL_TERMINAL_NAME,
      shellPath: process.env.SHELL || undefined,
      env,
    })
  }

  return kongctlTerminal
}

/**
 * Safely disposes the active kongctl terminal instance if it exists
 * This function terminates the terminal session and clears the global reference
 * Used when credentials are cleared to ensure token is purged from terminal environment
 */
export function disposeKongctlTerminal(): void {
  if (kongctlTerminal) {
    try {
      kongctlTerminal.dispose()
      debug.log('Kongctl terminal disposed successfully')
    } catch (error) {
      debug.log('Error disposing kongctl terminal:', error)
    } finally {
      kongctlTerminal = undefined
    }
  }
}
