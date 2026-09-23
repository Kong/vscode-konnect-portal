import type { KonnectPortalSnippet } from '../../../types/konnect/snippets'
import type { StoredPortalConfig } from '../../../types/konnect'
import type { PortalStorageService } from '../../../storage'
import { KonnectRequestService } from '../../request-service'

/** Reusable service for fetching and caching portal snippets */
export class PortalSnippetService {
  /** Portal-scoped snippet cache */
  private readonly cache = new Map<string, readonly KonnectPortalSnippet[]>()

  /** Portal-scoped requests currently in progress */
  private readonly inFlightRequests = new Map<string, Promise<readonly KonnectPortalSnippet[]>>()

  /** Incremented whenever cached and in-flight results become invalid */
  private cacheGeneration = 0

  /** Unified Konnect request service */
  private readonly requestService: KonnectRequestService

  /**
   * Creates a portal snippet service.
   * @param storageService Existing authentication and portal selection storage
   * @param requestService Optional request service override for tests
   */
  constructor(
    private readonly storageService: PortalStorageService,
    requestService?: KonnectRequestService,
  ) {
    this.requestService = requestService ?? new KonnectRequestService(storageService)
  }

  /** Returns snippets for the currently selected portal, or an empty list when none is selected. */
  async getSnippets(): Promise<readonly KonnectPortalSnippet[]> {
    const portal = await this.storageService.getSelectedPortal()
    if (!portal?.region) return []

    const key = this.getCacheKey(portal)
    const cached = this.cache.get(key)
    if (cached) {
      return cached
    }

    const existingRequest = this.inFlightRequests.get(key)
    if (existingRequest) return await existingRequest

    const generation = this.cacheGeneration
    const request = this.fetchAndCacheSnippets(portal, portal.region, key, generation)
    this.inFlightRequests.set(key, request)

    try {
      return await request
    } finally {
      if (this.inFlightRequests.get(key) === request) {
        this.inFlightRequests.delete(key)
      }
    }
  }

  /** Clears cached snippets for one portal, or every portal when omitted. */
  invalidate(portal?: StoredPortalConfig): void {
    this.cacheGeneration += 1
    if (portal) {
      const key = this.getCacheKey(portal)
      this.cache.delete(key)
      this.inFlightRequests.delete(key)
      return
    }
    this.cache.clear()
    this.inFlightRequests.clear()
  }

  /** Builds a cache key that cannot leak results across portals or regions. */
  private getCacheKey(portal: StoredPortalConfig): string {
    return `${portal.region ?? 'unknown'}:${portal.id}`
  }

  /** Fetches snippets and discards the result if portal selection changes. */
  private async fetchAndCacheSnippets(
    portal: StoredPortalConfig,
    region: string,
    key: string,
    generation: number,
  ): Promise<readonly KonnectPortalSnippet[]> {
    const snippets = await this.requestService.fetchAllPortalSnippets(portal.id, region)
    const selectedPortal = await this.storageService.getSelectedPortal()
    const selectedKey = selectedPortal?.region ? this.getCacheKey(selectedPortal) : undefined

    if (generation !== this.cacheGeneration || selectedKey !== key) {
      return await this.getSnippets()
    }

    this.cache.set(key, snippets)
    return snippets
  }
}

