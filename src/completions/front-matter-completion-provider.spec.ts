import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FrontMatterCompletionProvider } from './front-matter-completion-provider'
import type { PortalSnippetService } from '../konnect/portal/snippets/service'
import type { PortalStorageService } from '../storage'
import type { StoredPortalConfig } from '../types/konnect'
import type { Position, TextDocument } from 'vscode'

vi.mock('vscode', () => ({
  CompletionItem: class CompletionItem {
    constructor(public readonly label: string, public readonly kind: number) {}
  },
  CompletionItemKind: { Property: 9, Value: 13 },
  MarkdownString: class MarkdownString {
    constructor(public readonly value: string) {}
  },
  Range: class Range {
    constructor(
      public readonly startLine: number,
      public readonly startCharacter: number,
      public readonly endLine: number,
      public readonly endCharacter: number,
    ) {}
  },
  SnippetString: class SnippetString {
    constructor(public readonly value: string) {}
  },
  workspace: {
    getConfiguration: () => ({ get: (_key: string, fallback: string) => fallback }),
  },
}))
vi.mock('../utils/page-path', () => ({
  isSnippetDocument: vi.fn(() => false),
  getSnippetsDirectory: vi.fn(() => 'snippets'),
}))
vi.mock('../utils/debug', () => ({ debug: { log: vi.fn(), error: vi.fn() } }))

/** Creates the TextDocument methods required by the completion provider. */
function createDocument(sourceWithCursor: string): { document: TextDocument, position: Position } {
  const cursorOffset = sourceWithCursor.indexOf('|')
  const text = sourceWithCursor.slice(0, cursorOffset) + sourceWithCursor.slice(cursorOffset + 1)
  const lines = text.split('\n')
  const beforeCursor = text.slice(0, cursorOffset).split('\n')
  const position = {
    line: beforeCursor.length - 1,
    character: beforeCursor[beforeCursor.length - 1]?.length ?? 0,
  } as Position

  const document = {
    getText: () => text,
    lineAt: (line: number) => ({ text: lines[line] ?? '' }),
  } as unknown as TextDocument

  return { document, position }
}

/** Minimal selected portal stub matching StoredPortalConfig */
const MOCK_PORTAL: StoredPortalConfig = {
  id: 'portal-1', name: 'portal-1', displayName: 'Portal 1', description: '', origin: 'https://portal.example.com', canonicalDomain: 'portal.example.com', region: 'us',
}

describe('FrontMatterCompletionProvider', () => {
  const snippetService = {
    getSnippets: vi.fn().mockResolvedValue([
      { id: '1', name: 'header-snippet', title: 'Header' },
      { id: '2', name: 'sidebar-snippet' },
    ]),
  } as unknown as PortalSnippetService

  const storageService = {
    getSelectedPortal: vi.fn().mockResolvedValue(MOCK_PORTAL),
  } as unknown as PortalStorageService

  const provider = new FrontMatterCompletionProvider(snippetService, storageService)

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(storageService.getSelectedPortal).mockResolvedValue(MOCK_PORTAL)
    vi.mocked(snippetService.getSnippets).mockResolvedValue([
      { id: '1', name: 'header-snippet', title: 'Header' },
      { id: '2', name: 'sidebar-snippet' },
    ])
  })

  const provide = (source: string) => {
    const { document, position } = createDocument(source)
    return provider.provideCompletionItems(document, position)
  }

  const getLabels = (items: Array<{ label: string }>) => items.map(item => item.label)

  it('returns no completions when no portal is selected', async () => {
    vi.mocked(storageService.getSelectedPortal).mockResolvedValueOnce(undefined)

    expect(await provide('---\n|\n---\nbody')).toEqual([])
  })

  it('returns no completions when the document is a snippet', async () => {
    const { isSnippetDocument } = await import('../utils/page-path')
    vi.mocked(isSnippetDocument).mockReturnValueOnce(true)

    expect(await provide('---\n|\n---\nbody')).toEqual([])
  })

  it('returns no completions when the front matter block is not at the top of the document', async () => {
    // A `---` under a heading is a setext underline or divider, not page front matter
    expect(await provide('# Heading\n---\ntitle: |\n---\nbody')).toEqual([])
  })

  it('does not treat component YAML blocks as page front matter', async () => {
    expect(await provide('::snippet\n---\nname: "|\n---\n::')).toEqual([])
  })

  it('returns no completions outside the front matter block', async () => {
    expect(await provide('---\ntitle: "x"\n---\n|\nbody')).toEqual([])
    expect(await provide('---\ntitle: "x"\n---|\nbody')).toEqual([])
  })

  it('returns no completions without a closed front matter block', async () => {
    expect(await provide('---\n|\n')).toEqual([])
  })

  it('suggests known properties that do not already exist', async () => {
    const items = await provide('---\ntitle: "Hello"\n|\n---\nbody')

    expect(getLabels(items as never)).toEqual(['description', 'tagline', 'image', 'layout', 'layout-options'])
  })

  it('wraps string property values in a quoted placeholder', async () => {
    const items = await provide('---\n|\n---\nbody')
    const title = (items as Array<{ label: string, insertText: { value: string } }>)
      .find(item => item.label === 'title')

    expect(title?.insertText.value).toBe('title: "$0"')
  })

  // The property completion is the primary authoring path: its placeholder must not put the
  // cursor inside quotes, or the `insideQuote` guard suppresses the bare `false` on every
  // keystroke and the author silently lands on the snippet name `"false"`.
  it('starts `string | false` property values unquoted so the bare false stays offerable', async () => {
    const items = await provide('---\nlayout-options:\n  |\n---\nbody')
    const sidebarLeft = (items as Array<{ label: string, insertText: { value: string } }>)
      .find(item => item.label === 'sidebar-left')

    expect(sidebarLeft?.insertText.value).toBe('sidebar-left: $0')
  })

  it('opens a child mapping for object properties', async () => {
    const items = await provide('---\n|\n---\nbody')
    const layoutOptions = (items as Array<{ label: string, insertText: { value: string } }>)
      .find(item => item.label === 'layout-options')

    expect(layoutOptions?.insertText.value).toBe('layout-options:\n  $0')
  })

  it('suggests child properties under layout-options', async () => {
    const items = await provide('---\nlayout-options:\n  |\n---\nbody')

    expect(getLabels(items as never)).toEqual(['sidebar-left', 'sidebar-right', 'header'])
  })

  it('shows the `string | false` type hint for layout-options children', async () => {
    const items = await provide('---\nlayout-options:\n  |\n---\nbody')
    const typed = items as Array<{ label: string, detail?: string, documentation?: { value: string } }>

    expect(typed.map(item => item.detail)).toEqual(['string | false', 'string | false', 'string | false'])
    // The description tells the author that `false` hides the region
    expect(typed.find(item => item.label === 'sidebar-left')?.documentation?.value).toContain('`false`')
  })

  it('does not suggest properties on a blank line inside a multiline scalar', async () => {
    expect(await provide('---\ndescription: >\n|\n---\nbody')).toEqual([])
  })

  it('does not suggest properties on a blank line inside a second multiline scalar', async () => {
    // The line closing the first scalar opens the second one; the blank line is scalar content
    expect(await provide('---\ndescription: >\n  text\ntagline: >\n  text\n|\n---\nbody')).toEqual([])
  })

  it('suggests properties on a blank line after a multiline scalar has closed', async () => {
    const items = await provide('---\ndescription: >\n  text\ntitle: "x"\n|\n---\nbody')

    expect(getLabels(items as never)).toEqual(['tagline', 'image', 'layout', 'layout-options'])
  })

  it('does not suggest properties inside a multiline string continuation', async () => {
    expect(await provide('---\ndescription: >\n  |\n---\nbody')).toEqual([])
  })

  it('does not suggest child properties under a parent with a quoted inline value', async () => {
    // A quoted scalar value means the parent is not a mapping; children would be invalid YAML
    expect(await provide('---\nlayout-options: ""\n  |\n---\nbody')).toEqual([])
    expect(await provide("---\nlayout-options: 'x'\n  |\n---\nbody")).toEqual([])
    expect(await provide('---\nlayout-options: "\n  |\n---\nbody')).toEqual([])
  })

  it('suggests child properties when a comment separates the parent and its children', async () => {
    const items = await provide('---\nlayout-options: # note\n# a comment\n  |\n---\nbody')

    expect(getLabels(items as never)).toEqual(['sidebar-left', 'sidebar-right', 'header'])
  })

  it('suggests quoted enum values for a partially typed value', async () => {
    const items = await provide('---\nlayout: gui|\n---\nbody')
    const guide = (items as unknown as Array<{ label: string, insertText: string, range: { startCharacter: number, endCharacter: number } }>)
      .find(item => item.label === 'guide')

    expect(guide?.insertText).toBe('"guide"')
    expect(guide?.range).toMatchObject({ startCharacter: 8, endCharacter: 11 })
  })

  it('inserts at the cursor with a leading space when the colon has no space', async () => {
    const items = await provide('---\nlayout:|\n---\nbody')
    const guide = (items as Array<{ label: string, insertText: string }>).find(item => item.label === 'guide')

    expect(guide?.insertText).toBe(' "guide"')
  })

  it('appends a closing quote inside an open quote', async () => {
    const items = await provide('---\nlayout: "gui|\n---\nbody')
    const guide = (items as Array<{ label: string, insertText: string }>).find(item => item.label === 'guide')

    expect(guide?.insertText).toBe('guide"')
  })

  it('inserts between an empty quote pair without extra quotes', async () => {
    const items = await provide('---\nlayout: "|"\n---\nbody')
    const guide = (items as Array<{ label: string, insertText: string }>).find(item => item.label === 'guide')

    expect(guide?.insertText).toBe('guide')
  })

  it('does not suggest values for plain string properties', async () => {
    expect(await provide('---\ntitle: |\n---\nbody')).toEqual([])
  })

  it('does not suggest values when the value is already complete', async () => {
    expect(await provide('---\nlayout: "guide"|\n---\nbody')).toEqual([])
  })

  it('does not suggest values when the value is followed by an inline comment', async () => {
    expect(await provide('---\nlayout: gui # note|\n---\nbody')).toEqual([])
  })

  it('does not suggest values inside a multiline string continuation', async () => {
    expect(await provide('---\ndescription: >\n  layout: gui|\n---\nbody')).toEqual([])
  })

  it('suggests portal snippet names and the bare false for layout-options children', async () => {
    const items = await provide('---\nlayout-options:\n  sidebar-left: |\n---\nbody')
    const typed = items as Array<{ label: string, insertText: string, detail?: string }>
    const headerSnippet = typed.find(item => item.label === 'header-snippet')

    expect(getLabels(items as never)).toEqual(['header-snippet', 'sidebar-snippet', 'false'])
    expect(headerSnippet?.insertText).toBe('"header-snippet"')
    expect(headerSnippet?.detail).toBe('Header')
    // The bare boolean must never be quoted: `"false"` names a snippet, not the boolean
    expect(typed.find(item => item.label === 'false')?.insertText).toBe('false')
    expect(snippetService.getSnippets).toHaveBeenCalled()
  })

  it('suggests the bare false with a leading space when the colon has no space', async () => {
    const items = await provide('---\nlayout-options:\n  sidebar-left:|\n---\nbody')
    const falseItem = (items as Array<{ label: string, insertText: string }>).find(item => item.label === 'false')

    expect(falseItem?.insertText).toBe(' false')
  })

  it('replaces a partially typed value with the bare false', async () => {
    const items = await provide('---\nlayout-options:\n  sidebar-left: fal|\n---\nbody')
    const falseItem = (items as Array<{ label: string, insertText: string }>).find(item => item.label === 'false')

    expect(falseItem?.insertText).toBe('false')
  })

  it('does not suggest the bare false inside a quoted value', async () => {
    const items = await provide('---\nlayout-options:\n  sidebar-left: "fal|\n---\nbody')

    expect(getLabels(items as never)).toEqual(['header-snippet', 'sidebar-snippet'])
  })

  it('still offers the bare false when fetching snippets fails', async () => {
    vi.mocked(snippetService.getSnippets).mockRejectedValueOnce(new Error('API failed'))
    const items = await provide('---\nlayout-options:\n  sidebar-left: |\n---\nbody')

    // The bare boolean is static schema data, so it survives a failed snippet fetch
    expect(getLabels(items as never)).toEqual(['false'])
  })
})
