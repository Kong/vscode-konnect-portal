import { workspace } from 'vscode'
import type { LogLevel, LogParams } from '../types'

const DEBUG_LOG_PREFIX = '[Portal Preview]'

/**
 * Debug logging utility that respects the debug configuration setting
 *
 * @param params - Logging parameters
 * @param params.type - Log level (defaults to 'log')
 * @param params.force - Whether to always log regardless of debug setting (defaults to false)
 * @param params.message - The message to log
 * @param params.data - Additional data to log (optional)
 */
export function debugLog(params: LogParams): void {
  const { type = 'log' as LogLevel, force = false, message, data } = params

  // Check if debug mode is enabled or if this is a forced log
  const config = workspace.getConfiguration('kong.konnect.portal')
  const debugEnabled = config.get<boolean>('debug', false)

  if (!debugEnabled && !force) {
    return
  }

  // Create the log message with extension prefix
  const prefixedMessage = `${DEBUG_LOG_PREFIX} ${message}`

  // Use the appropriate console method based on the log type
  switch (type) {
    case 'warn':
      if (data !== undefined) {
        console.warn(prefixedMessage, data)
      } else {
        console.warn(prefixedMessage)
      }
      break
    case 'error':
      if (data !== undefined) {
        console.error(prefixedMessage, data)
      } else {
        console.error(prefixedMessage)
      }
      break
    case 'log':
    default:
      if (data !== undefined) {
        console.log(prefixedMessage, data)
      } else {
        console.log(prefixedMessage)
      }
      break
  }
}

/** Convenience functions for different log levels */
export const debug = {
  /**
   * Log a debug message
   * @param message - The message to log
   * @param data - Optional additional data
   * @param force - Whether to always log regardless of debug setting (defaults to false)
   */
  log: (message: string, data?: unknown, force = false) => debugLog({ message, data, force }),

  /**
   * Log a warning message
   * @param message - The message to log
   * @param data - Optional additional data
   * @param force - Whether to always log regardless of debug setting (defaults to false)
   */
  warn: (message: string, data?: unknown, force = false) => debugLog({ type: 'warn' as LogLevel, message, data, force }),

  /**
   * Log an error message
   * @param message - The message to log
   * @param data - Optional additional data
   * @param force - Whether to always log regardless of debug setting (defaults to true for errors)
   */
  error: (message: string, data?: unknown, force = true) => debugLog({ type: 'error' as LogLevel, message, data, force }),
}
