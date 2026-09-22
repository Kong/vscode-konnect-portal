import { Range } from 'vscode'
import type { Position, TextDocument } from 'vscode'

/** Semantic MDC component property at a document position */
export interface MdcComponentPropertyContext {
  /** Component name as authored in the document */
  componentName: string
  /** Property name as authored in the document */
  propertyName: string
  /** Current unquoted property value */
  value: string
  /** Range containing only the replaceable property value */
  range: Range
}

/** Offset range used while parsing document text */
interface OffsetRange {
  readonly start: number
  readonly end: number
}

/** Returns fenced Markdown code ranges that must not be parsed as MDC. */
function getFencedCodeRanges(text: string): OffsetRange[] {
  const ranges: OffsetRange[] = []
  const linePattern = /.*(?:\r?\n|$)/g
  let fence: { marker: string, length: number, start: number } | undefined
  let match: RegExpExecArray | null

  while ((match = linePattern.exec(text)) && match[0]) {
    const markerMatch = /^\s*(`{3,}|~{3,})/.exec(match[0])
    if (markerMatch) {
      const marker = markerMatch[1][0]
      if (!fence) {
        fence = { marker, length: markerMatch[1].length, start: match.index }
      } else if (fence.marker === marker && markerMatch[1].length >= fence.length) {
        ranges.push({ start: fence.start, end: linePattern.lastIndex })
        fence = undefined
      }
    }
  }

  if (fence) {
    ranges.push({ start: fence.start, end: text.length })
  }
  return ranges
}

/** Checks whether an offset is inside a fenced Markdown code block. */
function isInRange(offset: number, ranges: OffsetRange[]): boolean {
  return ranges.some(range => offset >= range.start && offset < range.end)
}

/** Removes matching YAML or inline quotes and returns value offsets. */
function getValueBounds(rawValue: string, absoluteStart: number): OffsetRange {
  const leadingWhitespace = rawValue.length - rawValue.trimStart().length
  const trimmed = rawValue.trim()
  const quote = trimmed[0]
  const hasOpeningQuote = quote === '"' || quote === '\''
  const isQuoted = hasOpeningQuote && trimmed.endsWith(quote) && trimmed.length >= 2
  const start = absoluteStart + leadingWhitespace + (hasOpeningQuote ? 1 : 0)
  const length = isQuoted ? trimmed.length - 2 : trimmed.length - (hasOpeningQuote ? 1 : 0)
  return { start, end: start + length }
}

/** Removes a YAML comment while preserving hash characters inside quotes. */
function removeYamlComment(rawValue: string): string {
  let quote: '"' | '\'' | undefined

  for (let index = 0; index < rawValue.length; index += 1) {
    const character = rawValue[index]
    if ((character === '"' || character === '\'') && rawValue[index - 1] !== '\\') {
      quote = quote === character ? undefined : (quote ?? character)
    } else if (character === '#' && !quote && (index === 0 || /\s/.test(rawValue[index - 1]))) {
      return rawValue.slice(0, index).trimEnd()
    }
  }

  return rawValue
}

/** Finds an inline MDC property context on the cursor's line. */
function getInlineContext(document: TextDocument, position: Position, text: string, cursorOffset: number): MdcComponentPropertyContext | undefined {
  const line = document.lineAt(position.line)
  const lineStart = document.offsetAt(line.range.start)
  const cursorInLine = cursorOffset - lineStart
  const componentMatch = /::([A-Za-z][\w-]*)\s*\{/.exec(line.text)
  if (!componentMatch || cursorInLine < componentMatch.index + componentMatch[0].length) return undefined

  const closingBrace = line.text.indexOf('}', componentMatch.index + componentMatch[0].length)
  const propsEnd = closingBrace === -1 ? line.text.length : closingBrace
  if (cursorInLine > propsEnd) return undefined

  const propsStart = componentMatch.index + componentMatch[0].length
  const props = line.text.slice(propsStart, propsEnd)
  const propertyPattern = /([\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s}]*)/g
  let propertyMatch: RegExpExecArray | null
  while ((propertyMatch = propertyPattern.exec(props))) {
    const rawValue = propertyMatch[2]
    const rawValueOffset = propertyMatch.index + propertyMatch[0].lastIndexOf(rawValue)
    const bounds = getValueBounds(rawValue, lineStart + propsStart + rawValueOffset)
    if (cursorOffset >= bounds.start && cursorOffset <= bounds.end) {
      return {
        componentName: componentMatch[1],
        propertyName: propertyMatch[1],
        value: text.slice(bounds.start, bounds.end),
        range: new Range(document.positionAt(bounds.start), document.positionAt(bounds.end)),
      }
    }
  }
  return undefined
}

/** Finds the component owning a YAML-style property block. */
function getYamlComponentName(document: TextDocument, propertyLine: number): string | undefined {
  let delimiterLine = -1
  for (let lineNumber = propertyLine - 1; lineNumber >= 0; lineNumber -= 1) {
    const line = document.lineAt(lineNumber).text
    if (/^\s*---\s*$/.test(line)) {
      delimiterLine = lineNumber
      break
    }
    if (/^\s*::/.test(line)) return undefined
  }
  if (delimiterLine < 0) return undefined

  for (let lineNumber = delimiterLine - 1; lineNumber >= 0; lineNumber -= 1) {
    const line = document.lineAt(lineNumber).text
    if (!line.trim()) continue
    return /^\s*::([A-Za-z][\w-]*)\s*$/.exec(line)?.[1]
  }
  return undefined
}

/**
 * Resolves the MDC component, property, value, and replacement range at a position.
 * Supports inline attributes and component-owned YAML property blocks.
 */
export function getComponentPropertyAtPosition(document: TextDocument, position: Position): MdcComponentPropertyContext | undefined {
  const text = document.getText()
  const cursorOffset = document.offsetAt(position)
  if (isInRange(cursorOffset, getFencedCodeRanges(text))) return undefined

  const inlineContext = getInlineContext(document, position, text, cursorOffset)
  if (inlineContext) return inlineContext

  const line = document.lineAt(position.line)
  const propertyMatch = /^(\s*)([\w-]+)\s*:\s*(.*)$/.exec(line.text)
  if (!propertyMatch) return undefined

  const componentName = getYamlComponentName(document, position.line)
  if (!componentName) return undefined

  const rawValue = propertyMatch[3]
  const scalarValue = removeYamlComment(rawValue)
  const lineStart = document.offsetAt(line.range.start)
  const rawValueStart = lineStart + propertyMatch[0].length - rawValue.length
  const bounds = getValueBounds(scalarValue, rawValueStart)
  if (cursorOffset < bounds.start || cursorOffset > bounds.end) return undefined

  return {
    componentName,
    propertyName: propertyMatch[2],
    value: text.slice(bounds.start, bounds.end),
    range: new Range(document.positionAt(bounds.start), document.positionAt(bounds.end)),
  }
}
