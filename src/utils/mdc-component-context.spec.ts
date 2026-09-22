import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getComponentPropertyAtPosition } from './mdc-component-context'
import type { Position, TextDocument } from 'vscode'

vi.mock('vscode', () => ({
  Range: class Range {
    constructor(public readonly start: Position, public readonly end: Position) {}
  },
}))

/** Creates the TextDocument methods required by the context parser. */
function createDocument(sourceWithCursor: string): { document: TextDocument, position: Position } {
  const cursorOffset = sourceWithCursor.indexOf('|')
  const text = sourceWithCursor.slice(0, cursorOffset) + sourceWithCursor.slice(cursorOffset + 1)
  const lines = text.split('\n')
  const positionAt = (offset: number): Position => {
    const before = text.slice(0, offset).split('\n')
    return { line: before.length - 1, character: before[before.length - 1]?.length ?? 0 } as Position
  }
  const offsetAt = (position: Position): number => lines.slice(0, position.line).reduce((total, line) => total + line.length + 1, 0) + position.character

  const document = {
    getText: (range?: { start: Position, end: Position }) => range
      ? text.slice(offsetAt(range.start), offsetAt(range.end))
      : text,
    positionAt,
    offsetAt,
    lineAt: (line: number) => {
      const start = offsetAt({ line, character: 0 } as Position)
      return {
        text: lines[line],
        range: { start: positionAt(start), end: positionAt(start + lines[line].length) },
      }
    },
  } as unknown as TextDocument

  return { document, position: positionAt(cursorOffset) }
}

describe('getComponentPropertyAtPosition', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it.each([
    ['empty inline value', '::snippet{name="|"}\n::', 'snippet', 'name', ''],
    ['partial inline value', '::snippet{name="auth|"}\n::', 'snippet', 'name', 'auth'],
    ['empty YAML value', '::snippet\n---\nname: |\n---\n::', 'snippet', 'name', ''],
    ['partial YAML value', '::snippet\n---\nname: auth|\n---\n::', 'snippet', 'name', 'auth'],
    ['multiple YAML properties', '::snippet\n---\nlanguage: javascript\nname: auth|\nsomeOtherProp: true\n---\n::', 'snippet', 'name', 'auth'],
    ['component name casing', '::Snippet\n---\nname: auth|\n---\n::', 'Snippet', 'name', 'auth'],
  ])('detects %s', async (_label, source, componentName, propertyName, value) => {
    const { document, position } = createDocument(source)
    const result = getComponentPropertyAtPosition(document, position)

    expect(result).toMatchObject({ componentName, propertyName, value })
    expect(document.getText(result?.range)).toBe(value)
  })

  it.each([
    ['another snippet property', '::snippet\n---\nlanguage: java|script\n---\n::'],
    ['another component name property', '::callout\n---\nname: auth|\n---\n::'],
  ])('exposes semantic context for %s so the provider can reject it', async (_label, source) => {
    const { document, position } = createDocument(source)
    expect(getComponentPropertyAtPosition(document, position)).toBeDefined()
  })

  it('does not parse MDC-looking content in fenced code', async () => {
    const { document, position } = createDocument('```md\n::snippet{name="auth|"}\n::\n```')
    expect(getComponentPropertyAtPosition(document, position)).toBeUndefined()
  })
})
