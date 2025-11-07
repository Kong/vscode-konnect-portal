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
    // This would require installing the real kongctl CLI
    it.skip('should execute version command successfully', async () => {
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

    // This would require installing the real kongctl CLI
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

    it.skip('should handle missing executable gracefully', async () => {
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
