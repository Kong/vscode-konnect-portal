import type { KonnectPortalSnippet, StoredPortalConfig } from '../types/konnect'
import type { PortalStorageService } from '../storage'
import { KonnectRequestService } from '../konnect/request-service'

/** Cached snippet list and its expiry time */
interface SnippetCacheEntry {
  /** Snippets fetched for this portal */
  readonly snippets: readonly KonnectPortalSnippet[]
  /** Epoch timestamp after which the entry is stale */
  readonly expiresAt: number
}

/** Default portal snippet cache lifetime */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

/** Reusable service for fetching and caching portal snippets */
export class PortalSnippetService {
  /** Portal-scoped snippet cache */
  private readonly cache = new Map<string, SnippetCacheEntry>()

  /** Unified Konnect request service */
  private readonly requestService: KonnectRequestService

  /**
   * Creates a portal snippet service.
   * @param storageService Existing authentication and portal selection storage
   * @param cacheTtlMs Cache lifetime in milliseconds
   * @param now Clock function used to determine cache expiry
   * @param requestService Optional request service override for tests
   */
  constructor(
    private readonly storageService: PortalStorageService,
    private readonly cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    private readonly now: () => number = Date.now,
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
    if (cached && cached.expiresAt > this.now()) return cached.snippets

    const snippets = await this.requestService.fetchAllPortalSnippets(portal.id, portal.region)
    this.cache.set(key, { snippets, expiresAt: this.now() + this.cacheTtlMs })
    return snippets
  }

  /** Clears cached snippets for one portal, or every portal when omitted. */
  invalidate(portal?: StoredPortalConfig): void {
    if (portal) {
      this.cache.delete(this.getCacheKey(portal))
      return
    }
    this.cache.clear()
  }

  /** Builds a cache key that cannot leak results across portals or regions. */
  private getCacheKey(portal: StoredPortalConfig): string {
    return `${portal.region ?? 'unknown'}:${portal.id}`
  }
}
