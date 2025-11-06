/**
 * Type definitions for kongctl CLI integration
 */

/** Configuration interface for kongctl */
export interface KongctlConfig {
  /** Path to the kongctl executable */
  path: string
  /** Timeout for commands in milliseconds */
  timeout: number
}

/** Result of executing a kongctl command */
export interface KongctlCommandResult {
  /** Exit code from the command */
  exitCode: number
  /** Standard output from the command */
  stdout: string
  /** Standard error from the command */
  stderr: string
  /** Whether the command was successful (exit code 0) */
  success: boolean
}

/** File statistics for diagnostic purposes */
export interface FileStats {
  exists: boolean
  isExecutable?: boolean
  size?: number
}

/** Diagnostic information about kongctl */
export interface DiagnosticInfo {
  configuredPath: string
  pathEnv: string
  foundInPath: string | null
  pathDirectories: string[]
  fileStats?: FileStats
}
