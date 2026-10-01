import { CompletionItem, CompletionItemKind } from 'vscode'
import type { CompletionItemProvider, Position, TextDocument } from 'vscode'
import type { PortalSnippetService } from '../konnect/portal/snippets/service'
import { getComponentPropertyAtPosition } from '../utils/mdc-component-context'
import { debug } from '../utils/debug'

/** Provides Konnect portal snippet names for Snippet component name properties */
export class SnippetCompletionProvider implements CompletionItemProvider {
  /** @param snippetService Portal snippet resource and cache service */
  constructor(private readonly snippetService: PortalSnippetService) {}

  /** Returns snippet name completions when the cursor has the required semantic context. */
  async provideCompletionItems(
    document: TextDocument,
    position: Position,
  ): Promise<CompletionItem[]> {
    const property = getComponentPropertyAtPosition(document, position)
    if (property?.componentName.toLowerCase() !== 'snippet' || property.propertyName !== 'name') {
      return []
    }

    try {
      const snippets = await this.snippetService.getSnippets()
      return snippets.map((snippet) => {
        const item = new CompletionItem(snippet.name, CompletionItemKind.Reference)
        item.insertText = snippet.name
        item.range = property.range
        item.detail = snippet.title ?? 'Konnect Portal snippet'
        item.documentation = snippet.description
        return item
      })
    } catch (error) {
      debug.error('Failed to provide Konnect Portal snippet completions:', error)
      return []
    }
  }
}
