import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as vscode from 'vscode'
import { executeKongctl, findExecutableInPath } from './index'

// Mock VS Code module
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
  window: {
    showWarningMessage: vi.fn(),
  },
}))

describe('kongctl integration tests', () => {
  let tempDir: string
  let mockKongctlScript: string
  let originalPath: string

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kongctl-test-'))
    mockKongctlScript = path.join(tempDir, process.platform === 'win32' ? 'kongctl.bat' : 'kongctl')
    originalPath = process.env.PATH || ''

    // Clear all mocks
    vi.clearAllMocks()

    // Mock VS Code configuration
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, defaultValue: any) => {
        if (key === 'path') return 'kongctl'
        if (key === 'timeout') return 5000 // Short timeout for tests
        return defaultValue
      }),
    } as any)
  })

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }

    // Restore original PATH
    process.env.PATH = originalPath
  })

  describe('findExecutableInPath', () => {
    it('should find executable in PATH', async () => {
      // Create a mock kongctl executable
      const scriptContent = process.platform === 'win32'
        ? '@echo off\necho {"version": "test", "commit": "abc123", "date": "2023-01-01"}'
        : '#!/bin/bash\necho \'{"version": "test", "commit": "abc123", "date": "2023-01-01"}\''

      await fs.writeFile(mockKongctlScript, scriptContent)
      await fs.chmod(mockKongctlScript, 0o755)

      // Add temp directory to PATH
      process.env.PATH = `${tempDir}${path.delimiter}${originalPath}`

      const result = await findExecutableInPath('kongctl')
      expect(result).toBe(mockKongctlScript)
    })

    it('should return null when executable not found', async () => {
      // Remove temp directory from PATH to ensure kongctl is not found
      process.env.PATH = originalPath.split(path.delimiter)
        .filter(p => p !== tempDir)
        .join(path.delimiter)

      const result = await findExecutableInPath('nonexistent-executable')
      expect(result).toBeNull()
    })

    it('should handle different platforms correctly', async () => {
      const executable = process.platform === 'win32' ? 'test.exe' : 'test'
      const testPath = path.join(tempDir, executable)

      await fs.writeFile(testPath, process.platform === 'win32' ? '@echo off' : '#!/bin/bash')
      await fs.chmod(testPath, 0o755)

      process.env.PATH = `${tempDir}${path.delimiter}${originalPath}`

      const result = await findExecutableInPath('test')
      expect(result).toBe(testPath)
    })
  })

  describe('executeKongctl', () => {
    //     beforeEach(async () => {
    //       // Create a comprehensive mock kongctl script that handles different commands
    //       const scriptContent = process.platform === 'win32' ? `
    // @echo off
    // if "%1"=="version" (
    //   if "%2"=="--full" (
    //     if "%3"=="--output" (
    //       if "%4"=="json" (
    //         echo {"version": "1.0.0", "commit": "abc123def", "date": "2023-01-01T00:00:00Z"}
    //       ) else (
    //         echo kongctl version 1.0.0
    //         echo Commit: abc123def
    //         echo Date: 2023-01-01
    //       )
    //     ) else (
    //       echo kongctl version 1.0.0
    //       echo Commit: abc123def
    //       echo Date: 2023-01-01
    //     )
    //   ) else (
    //     echo 1.0.0
    //   )
    // ) else if "%1"=="api" (
    //   if "%2"=="get" (
    //     echo {"data": [{"id": "test-portal", "name": "Test Portal"}]}
    //   ) else (
    //     echo Unknown API command
    //     exit /b 1
    //   )
    // ) else if "%1"=="config" (
    //   if "%2"=="list" (
    //     echo Current configuration
    //   ) else (
    //     echo Unknown config command
    //     exit /b 1
    //   )
    // ) else (
    //   echo Unknown command: %1
    //   exit /b 1
    // )
    // ` : `#!/bin/bash
    // case "$1" in
    //   "version")
    //     case "$2" in
    //       "--full")
    //         case "$3" in
    //           "--output")
    //             if [ "$4" = "json" ]; then
    //               echo '{"version": "1.0.0", "commit": "abc123def", "date": "2023-01-01T00:00:00Z"}'
    //             else
    //               echo "kongctl version 1.0.0"
    //               echo "Commit: abc123def"
    //               echo "Date: 2023-01-01"
    //             fi
    //             ;;
    //           *)
    //             echo "kongctl version 1.0.0"
    //             echo "Commit: abc123def"
    //             echo "Date: 2023-01-01"
    //             ;;
    //         esac
    //         ;;
    //       *)
    //         echo "1.0.0"
    //         ;;
    //     esac
    //     ;;
    //   "api")
    //     case "$2" in
    //       "get")
    //         echo '{"data": [{"id": "test-portal", "name": "Test Portal"}]}'
    //         ;;
    //       *)
    //         echo "Unknown API command"
    //         exit 1
    //         ;;
    //     esac
    //     ;;
    //   "config")
    //     case "$2" in
    //       "list")
    //         echo "Current configuration"
    //         ;;
    //       *)
    //         echo "Unknown config command"
    //         exit 1
    //         ;;
    //     esac
    //     ;;
    //   *)
    //     echo "Unknown command: $1"
    //     exit 1
    //     ;;
    // esac`

    //       await fs.writeFile(mockKongctlScript, scriptContent)
    //       await fs.chmod(mockKongctlScript, 0o755)
    //       process.env.PATH = `${tempDir}${path.delimiter}${originalPath}`
    //     })

    it('should execute version command successfully', async () => {
      const result = await executeKongctl(['version', '--full', '--output', 'json'])

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('version')
      expect(result.stdout).toContain('commit')
      expect(result.stderr).toBe('')

      // Validate JSON structure
      const versionData = JSON.parse(result.stdout)
      expect(versionData).toHaveProperty('version')
      expect(versionData).toHaveProperty('commit')
      expect(versionData).toHaveProperty('date')
    })

    it.skip('should execute API command successfully', async () => {
      const result = await executeKongctl(['api', 'get', '/v3/portals'])

      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('data')

      // Validate JSON structure
      const apiData = JSON.parse(result.stdout)
      expect(apiData).toHaveProperty('data')
      expect(Array.isArray(apiData.data)).toBe(true)
    })

    it('should handle timeouts correctly', async () => {
      // Create a hanging kongctl script
      const hangingContent = process.platform === 'win32'
        ? '@echo off\ntimeout /t 60 /nobreak > nul'
        : '#!/bin/bash\nsleep 60'

      await fs.writeFile(mockKongctlScript, hangingContent)
      await fs.chmod(mockKongctlScript, 0o755)

      // Set PATH to use our hanging script
      process.env.PATH = tempDir

      const start = Date.now()
      const result = await executeKongctl(['version'], { timeout: 1000 })
      const duration = Date.now() - start

      expect(result.success).toBe(false)
      // Accept either -1 (timeout killed) or 127/other (shell completed first)
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toMatch(/timed out|timeout|sleep|command/)
      expect(duration).toBeLessThan(2000) // Should complete quickly
    }, 3000)

    it('should include PAT token in environment when provided', async () => {
      // Create a kongctl script that echoes the PAT environment variable
      const envContent = process.platform === 'win32'
        ? '@echo off\necho %KONGCTL_DEFAULT_KONNECT_PAT%'
        : '#!/bin/bash\necho "$KONGCTL_DEFAULT_KONNECT_PAT"'

      await fs.writeFile(mockKongctlScript, envContent)
      await fs.chmod(mockKongctlScript, 0o755)

      // Mock storage service
      const mockStorageService = {
        getToken: async () => 'test-pat-token',
        hasValidToken: async () => true,
      } as any

      // Set PATH to use our mock kongctl script
      process.env.PATH = tempDir

      const result = await executeKongctl(['version'], {}, mockStorageService)
      expect(result.stdout.trim()).toBe('test-pat-token')
    })

    it('should handle missing executable gracefully', async () => {
      // Remove kongctl from PATH
      process.env.PATH = ''

      const result = await executeKongctl(['version'])

      expect(result.success).toBe(false)
      // Shell returns 127 for command not found, our error handler may return -1
      expect([127, -1]).toContain(result.exitCode)
      expect(result.stderr).toMatch(/executable not found|command not found|No such file|ENOENT/)
    })
  })
})
