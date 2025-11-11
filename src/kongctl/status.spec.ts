import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as vscode from 'vscode'
import { checkKongctlAvailable, getKongctlConfig, getKongctlDiagnostics } from './status'
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

// Mock the executeKongctl function from index
vi.mock('./index', () => ({
  executeKongctl: vi.fn(),
  findExecutableInPath: vi.fn(),
}))

describe('kongctl status module tests', () => {
  let tempDir: string
  let originalPath: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kongctl-status-test-'))
    originalPath = process.env.PATH || ''
    vi.clearAllMocks()
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
    process.env.PATH = originalPath
  })

  describe('getKongctlConfig', () => {
    it('should return default configuration when no custom config is provided', async () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue: any) => defaultValue),
      } as any)

      const config = getKongctlConfig()

      expect(config).toEqual({
        path: 'kongctl',
        timeout: 30000,
      })
      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('kong.konnect.kongctl')
    })

    it('should return custom configuration when provided', async () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'path') return '/opt/homebrew/bin/kongctl'
          if (key === 'timeout') return 60000
          return defaultValue
        }),
      } as any)

      const config = getKongctlConfig()

      expect(config).toEqual({
        path: '/opt/homebrew/bin/kongctl',
        timeout: 60000,
      })
    })

    it('should handle edge cases in configuration values', async () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'path') return '' // Empty string
          if (key === 'timeout') return 0 // Zero timeout
          return defaultValue
        }),
      } as any)

      const config = getKongctlConfig()

      expect(config).toEqual({
        path: '',
        timeout: 0,
      })
    })
  })

  describe('checkKongctlAvailable', () => {
    it('should return true when kongctl version command succeeds', async () => {
      vi.mocked(executeKongctl).mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: '{"version": "1.0.0", "commit": "abc123", "date": "2023-01-01"}',
        stderr: '',
      })

      const result = await checkKongctlAvailable()

      expect(result).toBe(true)
      expect(executeKongctl).toHaveBeenCalledWith(['version', '--full', '--output', 'json'], { showInTerminal: false })
    })

    it('should return false when kongctl version command fails', async () => {
      vi.mocked(executeKongctl).mockResolvedValue({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'kongctl: command not found',
      })

      const result = await checkKongctlAvailable()

      expect(result).toBe(false)
      expect(executeKongctl).toHaveBeenCalledWith(['version', '--full', '--output', 'json'], { showInTerminal: false })
    })

    it('should return false when executeKongctl throws an exception', async () => {
      vi.mocked(executeKongctl).mockRejectedValue(new Error('Command execution failed'))

      const result = await checkKongctlAvailable()

      expect(result).toBe(false)
    })

    it('should handle timeout scenarios', async () => {
      vi.mocked(executeKongctl).mockResolvedValue({
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: 'Command timed out',
      })

      const result = await checkKongctlAvailable()

      expect(result).toBe(false)
    })
  })

  describe('getKongctlDiagnostics', () => {
    beforeEach(() => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'path') return 'kongctl'
          return defaultValue
        }),
      } as any)
    })

    it('should return comprehensive diagnostic information', async () => {
      const mockKongctlPath = path.join(tempDir, 'kongctl')
      await fs.writeFile(mockKongctlPath, '#!/bin/bash\\necho "test"')
      await fs.chmod(mockKongctlPath, 0o755)

      vi.mocked(findExecutableInPath).mockResolvedValue(mockKongctlPath)

      // Set up environment
      process.env.PATH = `${tempDir}${path.delimiter}/usr/bin${path.delimiter}/bin`

      const diagnostics = await getKongctlDiagnostics()

      expect(diagnostics).toMatchObject({
        configuredPath: 'kongctl',
        foundInPath: mockKongctlPath,
        pathEnv: expect.stringContaining(tempDir),
        pathDirectories: expect.arrayContaining([tempDir, '/usr/bin', '/bin']),
      })

      expect(diagnostics.fileStats).toBeDefined()
      expect(diagnostics.fileStats?.exists).toBe(true)
      expect(diagnostics.fileStats?.size).toBeGreaterThan(0)
    })

    it('should handle case when kongctl is not found in PATH', async () => {
      vi.mocked(findExecutableInPath).mockResolvedValue(null)
      process.env.PATH = '/usr/bin:/bin'

      const diagnostics = await getKongctlDiagnostics()

      expect(diagnostics).toMatchObject({
        configuredPath: 'kongctl',
        foundInPath: null,
        pathEnv: '/usr/bin:/bin',
        pathDirectories: ['/usr/bin', '/bin'],
        fileStats: undefined,
      })
    })

    it('should handle empty PATH environment', async () => {
      vi.mocked(findExecutableInPath).mockResolvedValue(null)
      process.env.PATH = ''

      const diagnostics = await getKongctlDiagnostics()

      expect(diagnostics).toMatchObject({
        configuredPath: 'kongctl',
        foundInPath: null,
        pathEnv: '',
        pathDirectories: [],
      })
    })

    it('should handle custom configured path', async () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'path') return '/opt/homebrew/bin/kongctl'
          return defaultValue
        }),
      } as any)

      vi.mocked(findExecutableInPath).mockResolvedValue(null)

      const diagnostics = await getKongctlDiagnostics()

      expect(diagnostics.configuredPath).toBe('/opt/homebrew/bin/kongctl')
    })

    it('should handle file stat errors gracefully', async () => {
      // Create a path that exists but will cause stat to fail
      const inaccessiblePath = path.join(tempDir, 'inaccessible')

      vi.mocked(findExecutableInPath).mockResolvedValue(inaccessiblePath)

      const diagnostics = await getKongctlDiagnostics()

      expect(diagnostics.foundInPath).toBe(inaccessiblePath)
      expect(diagnostics.fileStats).toEqual({ exists: false })
    })

    it('should filter out empty PATH directories', async () => {
      vi.mocked(findExecutableInPath).mockResolvedValue(null)
      process.env.PATH = '/usr/bin::/bin:' // Contains empty entries

      const diagnostics = await getKongctlDiagnostics()

      expect(diagnostics.pathDirectories).toEqual(['/usr/bin', '/bin'])
      expect(diagnostics.pathDirectories).not.toContain('')
    })
  })
})
