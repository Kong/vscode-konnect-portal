import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FrontMatterDiagnostics, getFrontMatterDiagnostics } from './front-matter-diagnostics'
import { workspace } from 'vscode'
import type { PortalStorageService } from '../storage'
import type { StoredPortalConfig } from '../types/konnect'
import type { TextDocument } from 'vscode'

const collection = {
  set: vi.fn(),
  delete: vi.fn(),
  dispose: vi.fn(),
}

vi.mock('vscode', () => ({
  Diagnostic: class Diagnostic {
    constructor(
      public readonly range: unknown,
      public readonly message: string,
      public readonly severity: number,
    ) {}
  },
  DiagnosticSeverity: { Warning: 1 },
  Range: class Range {
    constructor(
      public readonly startLine: number,
      public readonly startCharacter: number,
      public readonly endLine: number,
      public readonly endCharacter: number,
    ) {}
  },
  Uri: { parse: (value: string) => ({ value }) },
  languages: {
    createDiagnosticCollection: vi.fn(() => collection),
  },
  workspace: {
    textDocuments: [],
    getConfiguration: () => ({ get: (_key: string, fallback: string) => fallback }),
  },
}))
vi.mock('../utils/page-path', () => ({
  isSnippetDocument: vi.fn(() => false),
  getSnippetsDirectory: vi.fn(() => 'snippets'),
}))
vi.mock('../utils/debug', () => ({ debug: { log: vi.fn(), error: vi.fn() } }))

/** Minimal selected portal stub matching StoredPortalConfig */
const MOCK_PORTAL: StoredPortalConfig = {
  id: 'portal-1', name: 'portal-1', displayName: 'Portal 1', description: '', origin: 'https://portal.example.com', canonicalDomain: 'portal.example.com', region: 'us',
}

/** Creates a minimal document mock for the given content. */
function createDocument(content: string, overrides: Partial<TextDocument> = {}): TextDocument {
  return {
    uri: { fsPath: '/pages/home.md' },
    languageId: 'markdown',
    fileName: '/pages/home.md',
    getText: () => content,
    ...overrides,
  } as unknown as TextDocument
}

/** Points the mocked workspace at the given open documents */
function setOpenDocuments(documents: TextDocument[]): void {
  Object.defineProperty(workspace, 'textDocuments', { value: documents, configurable: true })
}

describe('getFrontMatterDiagnostics', () => {
  it('warns on an invalid layout value', () => {
    const diagnostics = getFrontMatterDiagnostics(createDocument('---\nlayout: sidebar\n---\nbody'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      message: 'Invalid value "sidebar" for \'layout\'. Valid values: guide, reference, wide, center, custom.',
      severity: 1,
      range: { startLine: 1, startCharacter: 8, endLine: 1, endCharacter: 15 },
    })
  })

  it('attaches a docs link to the warning', () => {
    const diagnostics = getFrontMatterDiagnostics(createDocument('---\nlayout: sidebar\n---\nbody'))

    expect(diagnostics[0]?.code).toEqual({ value: "View the 'layout' docs", target: { value: 'https://portaldocs.konghq.com/pages/layouts' } })
  })

  it('does not warn on a valid layout value', () => {
    expect(getFrontMatterDiagnostics(createDocument('---\nlayout: "guide"\n---\nbody'))).toEqual([])
  })

  it('does not warn on empty or comment-only values', () => {
    expect(getFrontMatterDiagnostics(createDocument('---\nlayout: \n---\nbody'))).toEqual([])
    expect(getFrontMatterDiagnostics(createDocument('---\nlayout: # pending\n---\nbody'))).toEqual([])
  })

  it('ignores an inline comment after the value', () => {
    expect(getFrontMatterDiagnostics(createDocument('---\nlayout: guide # the layout\n---\nbody'))).toEqual([])
  })

  it('still warns on an invalid value before an inline comment', () => {
    expect(getFrontMatterDiagnostics(createDocument('---\nlayout: sidebar # the layout\n---\nbody'))).toHaveLength(1)
  })

  it('warns on an unterminated quoted invalid value', () => {
    const diagnostics = getFrontMatterDiagnostics(createDocument('---\nlayout: "side\n---\nbody'))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      message: 'Invalid value "side" for \'layout\'. Valid values: guide, reference, wide, center, custom.',
      range: { startLine: 1, startCharacter: 8, endLine: 1, endCharacter: 13 },
    })
  })

  it('does not warn on unrecognized properties', () => {
    expect(getFrontMatterDiagnostics(createDocument('---\nslug: "/foo"\nunknown: sidebar\n---\nbody'))).toEqual([])
  })

  it('warns when layout holds child properties', () => {
    const diagnostics = getFrontMatterDiagnostics(createDocument('---\nlayout: guide\n  extra: value\n---\nbody'))

    expect(diagnostics[0]?.message).toContain("'layout' must be a single-line value.")
  })

  it('returns no diagnostics without a front matter block', () => {
    expect(getFrontMatterDiagnostics(createDocument('# Just markdown'))).toEqual([])
  })
})

describe('FrontMatterDiagnostics', () => {
  let service: FrontMatterDiagnostics
  let storageService: PortalStorageService

  beforeEach(async () => {
    vi.clearAllMocks()
    setOpenDocuments([])
    storageService = {
      getSelectedPortal: vi.fn().mockResolvedValue(MOCK_PORTAL),
    } as unknown as PortalStorageService
    service = new FrontMatterDiagnostics(storageService)
  })

  it('sets diagnostics for a supported page document', async () => {
    const document = createDocument('---\nlayout: sidebar\n---\nbody')
    setOpenDocuments([document])
    await service.update(document)

    expect(collection.set).toHaveBeenCalledOnce()
    expect(collection.set).toHaveBeenCalledWith(document.uri, [
      expect.objectContaining({
        message: expect.stringContaining('Invalid value "sidebar"'),
        severity: 1,
      }),
    ])
    expect(collection.delete).not.toHaveBeenCalled()
  })

  it('clears diagnostics when no portal is selected', async () => {
    vi.mocked(storageService.getSelectedPortal).mockResolvedValueOnce(undefined)

    await service.update(createDocument('---\nlayout: sidebar\n---\nbody'))

    expect(collection.delete).toHaveBeenCalledOnce()
    expect(collection.set).not.toHaveBeenCalled()
  })

  it('does not set diagnostics for a document closed while the portal check was in flight', async () => {
    let resolvePortal: (portal: StoredPortalConfig) => void = () => {}
    vi.mocked(storageService.getSelectedPortal).mockReturnValueOnce(new Promise((resolve) => {
      resolvePortal = resolve
    }))
    const document = createDocument('---\nlayout: sidebar\n---\nbody')
    const pending = service.update(document)

    // The document is closed while the portal check is still running
    setOpenDocuments([])
    resolvePortal(MOCK_PORTAL)
    await pending

    expect(collection.set).not.toHaveBeenCalled()
    expect(collection.delete).toHaveBeenCalled()
  })

  it('clears diagnostics for snippet documents', async () => {
    const { isSnippetDocument } = await import('../utils/page-path')
    vi.mocked(isSnippetDocument).mockReturnValueOnce(true)

    await service.update(createDocument('---\nlayout: sidebar\n---\nbody'))

    expect(collection.delete).toHaveBeenCalledOnce()
    expect(collection.set).not.toHaveBeenCalled()
  })

  it('clears diagnostics for an unsupported language', async () => {
    await service.update(createDocument('---\nlayout: sidebar\n---\nbody', { languageId: 'plaintext', fileName: '/notes.txt' }))

    expect(collection.delete).toHaveBeenCalledOnce()
    expect(collection.set).not.toHaveBeenCalled()
  })

  it('logs and skips update when computation fails', async () => {
    const { debug } = await import('../utils/debug')
    const document = createDocument('', { getText: vi.fn(() => {
      throw new Error('boom')
    }) })
    setOpenDocuments([document])

    await service.update(document)

    expect(debug.error).toHaveBeenCalled()
    expect(collection.set).not.toHaveBeenCalled()
  })

  it('refreshes every open document', async () => {
    const documents = [
      createDocument('---\nlayout: sidebar\n---\nbody'),
      createDocument('---\nlayout: guide\n---\nbody'),
    ]
    setOpenDocuments(documents)

    await service.refreshAll()

    expect(collection.set).toHaveBeenCalledTimes(2)
  })

  it('debounces scheduled updates and drops the pending update on dispose', async () => {
    vi.useFakeTimers()
    try {
      const document = createDocument('---\nlayout: sidebar\n---\nbody')
      setOpenDocuments([document])

      service.scheduleUpdate(document)
      service.scheduleUpdate(document)
      await vi.advanceTimersByTimeAsync(500)

      expect(collection.set).toHaveBeenCalledOnce()

      service.scheduleUpdate(document)
      service.dispose()
      await vi.advanceTimersByTimeAsync(500)

      expect(collection.set).toHaveBeenCalledOnce()
      expect(collection.dispose).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes diagnostics for a closed document', () => {
    service.remove({ fsPath: '/pages/home.md' } as never)

    expect(collection.delete).toHaveBeenCalledWith({ fsPath: '/pages/home.md' })
  })

  it('disposes the underlying collection', () => {
    service.dispose()

    expect(collection.dispose).toHaveBeenCalledOnce()
  })
})
