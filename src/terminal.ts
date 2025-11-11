import { KONGCTL_TERMINAL_NAME } from './constants/kongctl'
import {
  window,
} from 'vscode'
import type { Terminal,
  Disposable } from 'vscode'

/** Global instance of the kongctl terminal for reuse */

let kongctlTerminal: Terminal | undefined
let terminalClosedListener: Disposable | undefined

/**
 * Checks if a terminal is closed or disposed using only public API.
 * @param term The terminal instance to check
 * @returns True if the terminal is closed/disposed, false otherwise
 */
function isTerminalClosed(term: Terminal | undefined): boolean {
  if (!term) return true
  // Defensive: try accessing .name, catch if disposed
  try {
    // If the terminal is disposed, VS Code throws on .name
    void term.name
    return false
  } catch {
    return true
  }
}

/**
 * Gets or creates the shared kongctl terminal instance
 * @param env Optional environment variables to set for the terminal
 * @returns The kongctl terminal instance
 */

/**
 * Gets or creates the shared kongctl terminal instance.
 * Ensures only one terminal instance is used for all kongctl commands.
 * Recreates the terminal if it was closed or disposed by the user.
 * @param env Optional environment variables to set for the terminal
 * @returns The kongctl terminal instance
 */
export function getOrCreateKongctlTerminal(env?: Record<string, string | undefined>): Terminal {
  // Recreate if missing or disposed
  if (!kongctlTerminal || isTerminalClosed(kongctlTerminal)) {
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
    // Clean up previous listener
    if (terminalClosedListener) {
      terminalClosedListener.dispose()
    }
    // Listen for terminal close and clear the reference
    terminalClosedListener = window.onDidCloseTerminal((closed) => {
      if (closed === kongctlTerminal) {
        kongctlTerminal = undefined
      }
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
