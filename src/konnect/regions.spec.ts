import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchAvailableRegions } from './regions'
import { executeKongctl } from '../kongctl'
import { checkKongctlAvailable } from '../kongctl/status'
import { parseKongctlJsonOutput } from '../kongctl/parse'

// Mock VS Code workspace.getConfiguration for debug logging
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(false),
    }),
  },
}))

vi.mock('../kongctl', async () => {
  const actual = await vi.importActual<any>('../kongctl')
  return { ...actual, executeKongctl: vi.fn() }
})
vi.mock('../kongctl/status', async () => {
  const actual = await vi.importActual<any>('../kongctl/status')
  return { ...actual, checkKongctlAvailable: vi.fn() }
})
vi.mock('../kongctl/parse', async () => {
  const actual = await vi.importActual<any>('../kongctl/parse')
  return { ...actual, parseKongctlJsonOutput: vi.fn() }
})

describe('fetchAvailableRegions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns regions from kongctl when available and successful', async () => {
    vi.mocked(checkKongctlAvailable).mockResolvedValue(true)
    vi.mocked(executeKongctl).mockResolvedValue({ success: true, stdout: 'mock', stderr: '', exitCode: 0 })
    vi.mocked(parseKongctlJsonOutput).mockReturnValue({ regions: { stable: ['us', 'eu'] } })

    const regions = await fetchAvailableRegions()
    expect(regions).toEqual(['us', 'eu'])
    expect(checkKongctlAvailable).toHaveBeenCalled()
    expect(executeKongctl).toHaveBeenCalled()
    expect(parseKongctlJsonOutput).toHaveBeenCalledWith('mock')
  })

  it('falls back to API if kongctl is not available', async () => {
    vi.mocked(checkKongctlAvailable).mockResolvedValue(false)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ regions: { stable: ['us', 'eu'] } }),
    })
    const regions = await fetchAvailableRegions()
    expect(regions).toEqual(['us', 'eu'])
    expect(checkKongctlAvailable).toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalled()
  })

  it('falls back to API if kongctl throws', async () => {
    vi.mocked(checkKongctlAvailable).mockResolvedValue(true)
    vi.mocked(executeKongctl).mockRejectedValue(new Error('fail'))
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ regions: { stable: ['us', 'eu'] } }),
    })
    const regions = await fetchAvailableRegions()
    expect(regions).toEqual(['us', 'eu'])
    expect(global.fetch).toHaveBeenCalled()
  })

  it('returns empty array if API returns no regions', async () => {
    vi.mocked(checkKongctlAvailable).mockResolvedValue(false)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    })
    const regions = await fetchAvailableRegions()
    expect(regions).toEqual([])
  })

  it('throws if API call fails', async () => {
    vi.mocked(checkKongctlAvailable).mockResolvedValue(false)
    global.fetch = vi.fn().mockResolvedValue({ ok: false, statusText: 'fail' })
    await expect(fetchAvailableRegions()).rejects.toThrow('Failed to fetch regions: fail')
  })
})


