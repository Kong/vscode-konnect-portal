import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalSnippetService } from './snippet-service'
import type { PortalStorageService } from '../storage'
import type { KonnectRequestService } from '../konnect/request-service'
import type { StoredPortalConfig } from '../types/konnect'

const PORTAL_A: StoredPortalConfig = {
  id: 'portal-a', name: 'a', displayName: 'A', description: '', origin: 'https://a.example.com', canonicalDomain: 'a.example.com', region: 'us',
}
const PORTAL_B: StoredPortalConfig = {
  id: 'portal-b', name: 'b', displayName: 'B', description: '', origin: 'https://b.example.com', canonicalDomain: 'b.example.com', region: 'eu',
}

describe('PortalSnippetService', () => {
  let selectedPortal: StoredPortalConfig | undefined
  let storage: PortalStorageService
  let requests: KonnectRequestService

  beforeEach(async () => {
    selectedPortal = PORTAL_A
    storage = { getSelectedPortal: vi.fn(async () => selectedPortal) } as unknown as PortalStorageService
    requests = {
      fetchAllPortalSnippets: vi.fn(async portalId => [{ id: `${portalId}-snippet`, name: `${portalId}-name` }]),
    } as unknown as KonnectRequestService
  })

  it('returns no snippets when no portal is selected', async () => {
    selectedPortal = undefined
    const service = new PortalSnippetService(storage, requests)
    expect(await service.getSnippets()).toEqual([])
    expect(requests.fetchAllPortalSnippets).not.toHaveBeenCalled()
  })

  it('caches snippets for the selected portal', async () => {
    const service = new PortalSnippetService(storage, requests)
    await service.getSnippets()
    await service.getSnippets()
    expect(requests.fetchAllPortalSnippets).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight request between concurrent completion requests', async () => {
    let resolveRequest: (value: Array<{ id: string, name: string }>) => void = () => {}
    vi.mocked(requests.fetchAllPortalSnippets).mockImplementation(
      async () => await new Promise((resolve) => {
        resolveRequest = resolve
      }),
    )
    const service = new PortalSnippetService(storage, requests)

    const first = service.getSnippets()
    const second = service.getSnippets()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(requests.fetchAllPortalSnippets).toHaveBeenCalledTimes(1)

    resolveRequest([{ id: 'snippet', name: 'shared' }])
    await expect(Promise.all([first, second])).resolves.toEqual([
      [{ id: 'snippet', name: 'shared' }],
      [{ id: 'snippet', name: 'shared' }],
    ])
  })

  it('does not reuse snippets after the selected portal changes', async () => {
    const service = new PortalSnippetService(storage, requests)
    expect((await service.getSnippets())[0].name).toBe('portal-a-name')
    selectedPortal = PORTAL_B
    expect((await service.getSnippets())[0].name).toBe('portal-b-name')
    expect(requests.fetchAllPortalSnippets).toHaveBeenNthCalledWith(2, 'portal-b', 'eu')
  })

  it('discards an in-flight result when the selected portal changes', async () => {
    let resolvePortalA: (value: Array<{ id: string, name: string }>) => void = () => {}
    vi.mocked(requests.fetchAllPortalSnippets)
      .mockImplementationOnce(async () => await new Promise((resolve) => {
        resolvePortalA = resolve
      }))
      .mockResolvedValueOnce([{ id: 'b-snippet', name: 'portal-b-name' }])
    const service = new PortalSnippetService(storage, requests)

    const pending = service.getSnippets()
    await new Promise(resolve => setTimeout(resolve, 0))
    selectedPortal = PORTAL_B
    service.invalidate()
    resolvePortalA([{ id: 'a-snippet', name: 'portal-a-name' }])

    await expect(pending).resolves.toEqual([{ id: 'b-snippet', name: 'portal-b-name' }])
    expect(requests.fetchAllPortalSnippets).toHaveBeenNthCalledWith(2, 'portal-b', 'eu')
  })

  it('does not cache API failures', async () => {
    vi.mocked(requests.fetchAllPortalSnippets)
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce([{ id: 'snippet', name: 'recovered' }])
    const service = new PortalSnippetService(storage, requests)

    await expect(service.getSnippets()).rejects.toThrow('network failed')
    expect(await service.getSnippets()).toEqual([{ id: 'snippet', name: 'recovered' }])
  })

  it('invalidates only the requested portal cache entry', async () => {
    const service = new PortalSnippetService(storage, requests)
    await service.getSnippets()
    selectedPortal = PORTAL_B
    await service.getSnippets()

    service.invalidate(PORTAL_A)
    await service.getSnippets()
    selectedPortal = PORTAL_A
    await service.getSnippets()

    expect(requests.fetchAllPortalSnippets).toHaveBeenCalledTimes(3)
    expect(requests.fetchAllPortalSnippets).toHaveBeenLastCalledWith('portal-a', 'us')
  })
})
