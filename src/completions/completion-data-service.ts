import type { PortalSnippetService } from '../konnect/portal/snippets/service'

/** Coordinates data sources used by VS Code completion providers */
export class CompletionDataService {
  /** @param snippetService Portal snippet completion data source */
  constructor(private readonly snippetService: PortalSnippetService) {}

  /** Invalidates all cached completion data. */
  invalidate(): void {
    this.snippetService.invalidate()
  }

  /** Fetches all completion data sources for the selected portal. */
  async fetchCompletionData(): Promise<void> {
    await Promise.all([
      this.snippetService.getSnippets(),
    ])
  }

  /** Invalidates and refetches every completion data source. */
  async refreshCompletionData(): Promise<void> {
    this.invalidate()
    await this.fetchCompletionData()
  }
}
