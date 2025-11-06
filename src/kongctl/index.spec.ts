import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as vscode from 'vscode'
import { getKongctlConfig } from './index'

// Mock VS Code module
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
  window: {
    showWarningMessage: vi.fn(),
  },
}))

describe('kongctl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getKongctlConfig', () => {
    it('should return default configuration', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue: any) => defaultValue),
      } as any)

      const config = getKongctlConfig()
      expect(config).toEqual({
        path: 'kongctl',
        timeout: 30000,
      })
    })

    it('should return custom configuration', () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string) => {
          if (key === 'path') return '/custom/kongctl'
          if (key === 'timeout') return 60000
          return 'default'
        }),
      } as any)

      const config = getKongctlConfig()
      expect(config).toEqual({
        path: '/custom/kongctl',
        timeout: 60000,
      })
    })
  })
})
