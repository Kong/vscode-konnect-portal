import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SnippetCompletionProvider } from './snippet-completion-provider'
import { getComponentPropertyAtPosition } from '../utils/mdc-component-context'
import { debug } from '../utils/debug'
import type { PortalSnippetService } from '../portal-resources/snippet-service'

vi.mock('vscode', () => ({
  CompletionItem: class CompletionItem {
    constructor(public readonly label: string, public readonly kind: number) {}
  },
  CompletionItemKind: { Reference: 17 },
}))
vi.mock('../utils/mdc-component-context')
vi.mock('../utils/debug', () => ({ debug: { error: vi.fn() } }))

describe('SnippetCompletionProvider', () => {
  const range = { start: { line: 0, character: 16 }, end: { line: 0, character: 20 } }
  let service: PortalSnippetService
  let provider: SnippetCompletionProvider

  beforeEach(async () => {
    vi.clearAllMocks()
    service = { getSnippets: vi.fn().mockResolvedValue([{ id: '1', name: 'authentication-example', description: 'Auth example' }]) } as unknown as PortalSnippetService
    provider = new SnippetCompletionProvider(service)
  })

  it('returns a completion that replaces only the current value range', async () => {
    vi.mocked(getComponentPropertyAtPosition).mockReturnValue({ componentName: 'snippet', propertyName: 'name', value: 'auth', range: range as never })
    const result = await provider.provideCompletionItems({} as never, {} as never) as any[]
    expect(result[0]).toMatchObject({ label: 'authentication-example', insertText: 'authentication-example', range })
  })

  it.each([
    ['another property', { componentName: 'snippet', propertyName: 'language', value: '', range }],
    ['another component', { componentName: 'callout', propertyName: 'name', value: '', range }],
    ['no component context', undefined],
  ])('does not fetch snippets for %s', async (_label, context) => {
    vi.mocked(getComponentPropertyAtPosition).mockReturnValue(context as never)
    expect(await provider.provideCompletionItems({} as never, {} as never)).toEqual([])
    expect(service.getSnippets).not.toHaveBeenCalled()
  })

  it('accepts supported component-name casing', async () => {
    vi.mocked(getComponentPropertyAtPosition).mockReturnValue({ componentName: 'Snippet', propertyName: 'name', value: '', range: range as never })
    expect(await provider.provideCompletionItems({} as never, {} as never)).toHaveLength(1)
  })

  it('returns no completions and logs when fetching fails', async () => {
    vi.mocked(getComponentPropertyAtPosition).mockReturnValue({ componentName: 'snippet', propertyName: 'name', value: '', range: range as never })
    vi.mocked(service.getSnippets).mockRejectedValue(new Error('API failed'))
    expect(await provider.provideCompletionItems({} as never, {} as never)).toEqual([])
    expect(debug.error).toHaveBeenCalled()
  })
})
