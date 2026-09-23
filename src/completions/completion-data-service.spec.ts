import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompletionDataService } from './completion-data-service'
import type { PortalSnippetService } from '../konnect/portal/snippets/service'

describe('CompletionDataService', () => {
  let snippetService: PortalSnippetService
  let service: CompletionDataService

  beforeEach(async () => {
    snippetService = {
      getSnippets: vi.fn().mockResolvedValue([]),
      invalidate: vi.fn(),
    } as unknown as PortalSnippetService
    service = new CompletionDataService(snippetService)
  })

  it('fetches every completion data source', async () => {
    await service.fetchCompletionData()
    expect(snippetService.getSnippets).toHaveBeenCalledOnce()
  })

  it('invalidates every completion data source', async () => {
    service.invalidate()
    expect(snippetService.invalidate).toHaveBeenCalledOnce()
  })

  it('invalidates and fetches all completion data when refreshed', async () => {
    await service.refreshCompletionData()
    expect(snippetService.invalidate).toHaveBeenCalledOnce()
    expect(snippetService.getSnippets).toHaveBeenCalledOnce()
  })
})
