import { CompletionItem, CompletionItemKind, MarkdownString, Range, SnippetString } from 'vscode'
import type { CompletionItemProvider, Position, TextDocument } from 'vscode'
import type { PortalSnippetService } from '../konnect/portal/snippets/service'
import type { PortalStorageService } from '../storage'
import {
  FRONT_MATTER_PROP_REGEX,
  MDC_PAGE_FRONT_MATTER_PROPERTIES,
  getMdcFrontMatterBlock,
  opensMultilineValue,
  parseMdcFrontMatterProps,
} from '../utils/mdc-front-matter'
import type { MdcFrontMatterBlock, MdcFrontMatterPropSchema } from '../utils/mdc-front-matter'
import { getSnippetsDirectory, isSnippetDocument } from '../utils/page-path'
import { debug } from '../utils/debug'

/** A value suggestion with an optional gray description shown next to the label */
interface FrontMatterValueSuggestion {
  /** The value text */
  value: string
  /** Gray text shown next to the suggestion label */
  description?: string
}

/** Describes where and how a value completion replaces the edited value */
interface FrontMatterValueTarget {
  /** Range replaced when the completion is accepted */
  range: Range
  /** Builds the inserted text for a suggested value */
  buildInsertText: (value: string) => string
}

/** Provides front matter property and value completions for Markdown and MDC documents */
export class FrontMatterCompletionProvider implements CompletionItemProvider {
  /**
   * @param snippetService Portal snippet resource and cache service
   * @param storageService Authentication and portal selection storage
   */
  constructor(
    private readonly snippetService: PortalSnippetService,
    private readonly storageService: PortalStorageService,
  ) {}

  /** Returns front matter completions when the cursor sits strictly inside the front matter block at the top of the document. */
  async provideCompletionItems(
    document: TextDocument,
    position: Position,
  ): Promise<CompletionItem[]> {
    try {
      // Snippet files render their own front matter, so page front matter never applies to them
      if (isSnippetDocument(document, getSnippetsDirectory())) return []

      const lines = document.getText().split(/\r?\n/)
      const block = getMdcFrontMatterBlock(lines)
      // Require a closed block so suggestions never leak into the document body.
      // Only the top-of-document block counts, so component YAML blocks owned by
      // MDC components (for example `::snippet`) are never treated as page front matter.
      if (!block) return []
      // The cursor must sit strictly between the `---` markers
      if (position.line <= block.startLine || position.line >= block.endLine) return []

      // Front matter tooling is portal content assistance, so it requires a selected portal.
      // Checked last because it is an asynchronous keychain read on every completion request.
      const portal = await this.storageService.getSelectedPortal()
      if (!portal) return []

      const line = document.lineAt(position.line).text

      const valueItems = await this.getValueCompletions(lines, block, line, position)
      if (valueItems.length > 0) return valueItems

      return this.getPropertyCompletions(lines, block, line, position)
    } catch (error) {
      debug.error('Failed to provide front matter completions:', error)
      return []
    }
  }

  /** Returns value completions when the cursor edits the value of a known property. */
  private async getValueCompletions(
    lines: readonly string[],
    block: MdcFrontMatterBlock,
    line: string,
    position: Position,
  ): Promise<CompletionItem[]> {
    const propMatch = FRONT_MATTER_PROP_REGEX.exec(line)
    if (!propMatch) return []

    // Suggestions apply after the colon; before the colon is property-name territory
    const colonIndex = line.indexOf(':')
    if (position.character <= colonIndex) return []

    const schema = resolveFrontMatterSchema(lines, block, position.line, propMatch[2] ?? '')
    if (!schema) return []

    const target = getFrontMatterValueTarget(line, position)
    if (!target) return []

    // Resolve the value suggestions based on the property schema
    let suggestions: FrontMatterValueSuggestion[] = []
    if (schema.type === 'enum' && schema.values?.length) {
      suggestions = schema.values.map(value => ({ value }))
    } else if (schema.suggestions === 'snippets') {
      try {
        const snippets = await this.snippetService.getSnippets()
        suggestions = snippets.map(snippet => ({
          value: snippet.name,
          description: snippet.title ?? 'Konnect Portal snippet',
        }))
      } catch (error) {
        debug.error('Failed to fetch portal snippets for front matter completions:', error)
      }
    }

    if (!suggestions.length) return []

    return suggestions.map(({ value, description }) => {
      const item = new CompletionItem(value, CompletionItemKind.Value)
      item.insertText = target.buildInsertText(value)
      item.range = target.range
      item.detail = description ?? schema.description
      // A snippet title takes over the detail slot, so move the schema description to the docs
      if (description && schema.description) {
        item.documentation = new MarkdownString(schema.description)
      }
      return item
    })
  }

  /** Returns property-name completions for the current front matter level. */
  private getPropertyCompletions(
    lines: readonly string[],
    block: MdcFrontMatterBlock,
    line: string,
    position: Position,
  ): CompletionItem[] {
    const propLineMatch = /^(\s*)([\w-]*)$/.exec(line)
    if (!propLineMatch) return []

    const indent = propLineMatch[1]?.length ?? 0
    const parentSchema = getFrontMatterParentSchema(lines, block, position.line)
    // An indented line without an object parent is a multiline string continuation
    if (indent > 0 && !parentSchema) return []
    // A blank line inside a multiline scalar is scalar content, not a property slot
    if (isInsideMultilineScalar(lines, block, position.line)) return []

    const schemas = parentSchema?.properties ?? MDC_PAGE_FRONT_MATTER_PROPERTIES
    if (!schemas.length) return []

    // Only suggest known properties that do not already exist at the current level
    const props = parseMdcFrontMatterProps(lines)
    const existingProps = parentSchema
      ? (props.find(prop => prop.name === parentSchema.name)?.children ?? []).map(child => child.name)
      : props.filter(prop => prop.indent === 0).map(prop => prop.name)

    const typedName = propLineMatch[2] ?? ''
    const typedNameStart = Math.min(indent, position.character)
    const range = typedName.length > 0
      ? new Range(position.line, typedNameStart, position.line, indent + typedName.length)
      : new Range(position.line, position.character, position.line, position.character)

    return schemas
      .filter(schema => !existingProps.includes(schema.name))
      .map(schema => {
        const item = new CompletionItem(schema.name, CompletionItemKind.Property)
        item.insertText = getFrontMatterPropInsertText(schema)
        item.range = range
        item.detail = getFrontMatterPropTypeHint(schema)
        if (schema.description) item.documentation = new MarkdownString(schema.description)
        if (schema.docsUrl) {
          item.documentation = new MarkdownString(`[View the '${schema.name}' docs](${schema.docsUrl})`)
        }
        // Re-open the suggest widget so enum values or child properties can be picked right away
        item.command = { command: 'editor.action.triggerSuggest', title: 'Trigger Suggestions' }
        return item
      })
  }
}

/**
 * Builds the snippet insert text for a front matter property name.
 * String and enum values get an empty quoted placeholder; object properties open a child mapping.
 */
function getFrontMatterPropInsertText(schema: MdcFrontMatterPropSchema): SnippetString {
  return schema.type === 'object'
    ? new SnippetString(`${schema.name}:\n  $0`)
    : new SnippetString(`${schema.name}: "$0"`)
}

/** Type hint shown next to the completion label */
function getFrontMatterPropTypeHint(schema: MdcFrontMatterPropSchema): string {
  if (schema.type === 'enum' && schema.values?.length) {
    return schema.values.join(' | ')
  }
  return schema.type
}

/**
 * Finds the parent `object` property for an indented front matter line.
 *
 * Returns `undefined` for top-level lines and for lines that are not part of a
 * known property mapping, such as the continuation of a multiline string value.
 *
 * @param lines - The document lines
 * @param block - The front matter block boundaries
 * @param lineNumber - The 0-based line index of the current line
 * @returns The parent object schema, or `undefined` when the line is top-level or not in a mapping
 */
function getFrontMatterParentSchema(
  lines: readonly string[],
  block: MdcFrontMatterBlock,
  lineNumber: number,
): MdcFrontMatterPropSchema | undefined {
  const currentLine = lines[lineNumber] ?? ''
  const currentIndent = currentLine.length - currentLine.trimStart().length

  // Top-level lines have no parent property
  if (currentIndent === 0) return undefined

  // Walk up to the nearest line with less indentation to find the parent property
  for (let i = lineNumber - 1; i > block.startLine; i--) {
    const line = lines[i] ?? ''
    if (!line.trim()) continue
    // Comments carry no indentation semantics; skip them like blank lines
    if (line.trim().startsWith('#')) continue

    const indent = line.length - line.trimStart().length
    if (indent >= currentIndent) continue

    const match = FRONT_MATTER_PROP_REGEX.exec(line)
    if (!match) return undefined

    // A parent with an inline value means this line is a multiline string continuation.
    // A trailing inline comment is not a value, but an empty quoted value is still a scalar.
    const inlineValue = (match[3] ?? '').replace(/\s+#.*$/, '').trim()
    if (inlineValue) return undefined

    const parentSchema = MDC_PAGE_FRONT_MATTER_PROPERTIES.find(prop => prop.name === match[2])
    if (parentSchema?.type !== 'object' || !parentSchema.properties?.length) return undefined

    return parentSchema
  }

  return undefined
}

/**
 * Resolves the schema for a front matter property, resolving child properties when
 * the line is indented below an `object` property (for example under `layout-options`).
 *
 * @param lines - The document lines
 * @param block - The front matter block boundaries
 * @param lineNumber - The 0-based line index of the current line
 * @param propName - The property name on the current line
 * @returns The schema for the property, or `undefined` when unknown
 */
function resolveFrontMatterSchema(
  lines: readonly string[],
  block: MdcFrontMatterBlock,
  lineNumber: number,
  propName: string,
): MdcFrontMatterPropSchema | undefined {
  const parentSchema = getFrontMatterParentSchema(lines, block, lineNumber)

  if (parentSchema) {
    return parentSchema.properties?.find(prop => prop.name === propName)
  }

  // An indented line without an object parent is a multiline string
  // continuation. It must not resolve to a top-level schema.
  const currentLine = lines[lineNumber] ?? ''
  if (currentLine.length - currentLine.trimStart().length > 0) return undefined

  return MDC_PAGE_FRONT_MATTER_PROPERTIES.find(prop => prop.name === propName)
}

/**
 * Detects whether a line sits inside the body of a multiline value.
 *
 * A blank line there is scalar content, not a property slot; inserting a
 * column-0 property there would legally truncate the scalar.
 *
 * @param lines - The document lines
 * @param block - The front matter block boundaries
 * @param lineNumber - The 0-based line index of the current line
 * @returns true when the line is inside a multiline scalar body
 */
function isInsideMultilineScalar(
  lines: readonly string[],
  block: MdcFrontMatterBlock,
  lineNumber: number,
): boolean {
  let scalarOpenAtIndent = -1
  for (let i = block.startLine + 1; i < lineNumber; i++) {
    const line = lines[i] ?? ''
    if (!line.trim()) continue

    const indent = line.length - line.trimStart().length
    if (scalarOpenAtIndent >= 0) {
      // A less-indented line closes the open scalar
      if (indent <= scalarOpenAtIndent) scalarOpenAtIndent = -1
      continue
    }

    const match = FRONT_MATTER_PROP_REGEX.exec(line)
    if (!match) continue

    if (opensMultilineValue((match[3] ?? '').trim())) {
      scalarOpenAtIndent = indent
    }
  }
  return scalarOpenAtIndent >= 0
}

/**
 * Computes the replacement range and insert-text quoting for a value completion.
 *
 * Values are inserted double-quoted unless a quote already surrounds the cursor,
 * in which case only a missing closing quote is appended.
 *
 * @param line - The full text of the property line
 * @param position - The cursor position on the line
 * @returns The value completion target, or `undefined` when the value is not being edited
 */
function getFrontMatterValueTarget(line: string, position: Position): FrontMatterValueTarget | undefined {
  const colonIndex = line.indexOf(':')
  if (colonIndex === -1) return undefined

  const afterColon = line.slice(colonIndex + 1)
  // Multiline strings have no value completions
  if (/^\s*[|>]/.test(afterColon)) return undefined
  // A comment-only value is a YAML null, not an editable value
  if (/^\s*#/.test(afterColon)) return undefined

  const leadingSpaces = afterColon.length - afterColon.trimStart().length
  const valueStart = colonIndex + 1 + leadingSpaces
  const valueText = afterColon.trim()
  const cursor = position.character

  /** Empty range that inserts text at the cursor */
  const insertAtCursor = (): Range => new Range(position.line, cursor, position.line, cursor)

  // Empty value: `layout:` or `layout: `
  if (valueText === '') {
    // Add the missing space when the cursor sits directly after the colon
    const needsSpace = line.slice(colonIndex + 1, cursor) === ''
    return {
      range: insertAtCursor(),
      buildInsertText: value => `${needsSpace ? ' ' : ''}"${value}"`,
    }
  }

  // Quoted value: `"gui`, `"guide"`, or `""`
  const quote = valueText[0]
  if (quote === '"' || quote === '\'') {
    if (cursor <= valueStart) return undefined

    const closingIndex = line.indexOf(quote, valueStart + 1)
    if (closingIndex === -1) {
      // An unterminated quoted value still accepts text before its closing quote
      return {
        range: new Range(position.line, valueStart + 1, position.line, cursor),
        buildInsertText: value => `${value}${quote}`,
      }
    }

    // Only suggest while the cursor edits the quoted content
    if (cursor > closingIndex) return undefined

    // An empty quote pair has no content to replace
    if (closingIndex === valueStart + 1) {
      return {
        range: insertAtCursor(),
        buildInsertText: value => value,
      }
    }

    return {
      range: new Range(position.line, valueStart + 1, position.line, closingIndex),
      buildInsertText: value => value,
    }
  }

  // A bare word being typed: `layout: gui`
  if (/^[\w-]+$/.test(valueText)) {
    if (cursor < valueStart) return undefined
    return {
      range: new Range(position.line, valueStart, position.line, valueStart + valueText.length),
      buildInsertText: value => `"${value}"`,
    }
  }

  // A complete value must not re-trigger suggestions
  return undefined
}
