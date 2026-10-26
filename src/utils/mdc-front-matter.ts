/**
 * Schema and parsing helpers for Dev Portal page front matter.
 *
 * Adapted from the Konnect Studio Monaco front matter support so the VS Code
 * extension offers the same completions and validation. The schema is the
 * single source shared by the front matter completion provider and the front
 * matter diagnostics, so both stay in sync automatically.
 */

/** The value types supported by Dev Portal page front matter properties */
export type MdcFrontMatterPropType = 'string' | 'enum' | 'object'

/** Schema for a single page front matter property */
export interface MdcFrontMatterPropSchema {
  /** The property name in kebab-case as it appears in the front matter */
  name: string
  /** The value type of the property */
  type: MdcFrontMatterPropType
  /** Allowed values when `type` is `enum` */
  values?: string[]
  /** Dynamic value suggestions, in addition to `values` when `type` is `enum` */
  suggestions?: 'snippets'
  /** Child properties when `type` is `object` */
  properties?: MdcFrontMatterPropSchema[]
  /** Documentation URL surfaced in completion details and diagnostics */
  docsUrl?: string
  /** Description shown in the completion item details */
  description?: string
}

/**
 * The layout names accepted by the `layout` front matter property.
 *
 * This is the single source of truth: completions and validation both
 * derive from this list.
 */
export const MDC_PAGE_LAYOUT_NAMES = ['guide', 'reference', 'wide', 'center', 'custom'] as const

/**
 * Known Dev Portal page front matter properties.
 *
 * All properties are optional. Unrecognized properties are ignored by
 * completions and validation.
 */
export const MDC_PAGE_FRONT_MATTER_PROPERTIES: MdcFrontMatterPropSchema[] = [
  { name: 'title', type: 'string', description: 'The page title. Displayed in the page header and the browser tab.' },
  { name: 'description', type: 'string', description: 'The page description. Used for SEO and page listings.' },
  { name: 'tagline', type: 'string', description: 'A short tagline displayed with the page title.' },
  { name: 'image', type: 'string', description: 'An optional remote image URL used to override the page\'s open graph preview (e.g., for social media sharing). A default image is generated if omitted.' },
  {
    name: 'layout',
    type: 'enum',
    values: [...MDC_PAGE_LAYOUT_NAMES],
    description: 'The page layout.',
    docsUrl: 'https://portaldocs.konghq.com/pages/layouts',
  },
  {
    name: 'layout-options',
    type: 'object',
    description: 'Optional layout configuration options.',
    docsUrl: 'https://portaldocs.konghq.com/pages/layout-options',
    properties: [
      { name: 'sidebar-left', type: 'string', suggestions: 'snippets', description: 'A snippet to render in the left sidebar, when supported by the layout.' },
      { name: 'sidebar-right', type: 'string', suggestions: 'snippets', description: 'A snippet to render in the right sidebar, when supported by the layout.' },
      { name: 'header', type: 'string', suggestions: 'snippets', description: 'A snippet to render in the page header, when supported by the layout.' },
    ],
  },
]

/** Matches a front matter property line, capturing the indentation, name, and raw value */
export const FRONT_MATTER_PROP_REGEX = /^(\s*)([A-Za-z][\w-]*)\s*:(.*)$/

/** Boundaries of the front matter block at the top of a document (0-based line numbers) */
export interface MdcFrontMatterBlock {
  /** Line index of the opening `---` marker */
  startLine: number
  /** Line index of the closing `---` marker */
  endLine: number
}

/**
 * Returns the front matter block boundaries for a document.
 *
 * The block must start at the top of the document and be closed by a second
 * `---` marker. An unclosed or missing block returns `undefined` so that
 * completions and warnings never leak into the document body.
 *
 * @param lines - The document lines
 * @returns The block boundaries, or `undefined` when there is no closed front matter block
 */
export function getMdcFrontMatterBlock(lines: readonly string[]): MdcFrontMatterBlock | undefined {
  // Skip leading empty lines before the opening marker
  let startIndex = 0
  while (startIndex < lines.length && !lines[startIndex]?.trim()) {
    startIndex++
  }

  // The opening marker must sit at column 0; an indented `---` is content
  if (!/^---\s*$/.test(lines[startIndex] ?? '')) {
    return undefined
  }

  // Find the closing marker; it must also sit at column 0
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i] ?? '')) {
      return { startLine: startIndex, endLine: i }
    }
  }

  return undefined
}

/** A single property parsed from a front matter block */
export interface MdcFrontMatterProp {
  /** The property name */
  name: string
  /** The raw value text after the colon, trimmed */
  value: string
  /** 0-based line index of the property */
  lineNumber: number
  /** Number of leading spaces */
  indent: number
  /** Child properties, only populated for mapping values */
  children: MdcFrontMatterProp[]
}

/**
 * Parses the properties of the front matter block, preserving document order
 * and nesting child properties under their parent property.
 *
 * @param lines - The document lines
 * @returns The top-level front matter properties
 */
export function parseMdcFrontMatterProps(lines: readonly string[]): MdcFrontMatterProp[] {
  const block = getMdcFrontMatterBlock(lines)
  if (!block) return []

  const props: MdcFrontMatterProp[] = []
  const stack: MdcFrontMatterProp[] = []

  // Content lines live strictly between the two `---` markers
  for (let i = block.startLine + 1; i < block.endLine; i++) {
    const line = lines[i] ?? ''
    if (!line.trim()) continue

    const match = FRONT_MATTER_PROP_REGEX.exec(line)
    if (!match) continue

    const indent = line.length - line.trimStart().length
    const prop: MdcFrontMatterProp = {
      name: match[2] ?? '',
      value: (match[3] ?? '').trim(),
      lineNumber: i,
      indent,
      children: [],
    }

    // Close any stack entries that are not parents of this line
    while (stack.length && (stack[stack.length - 1]?.indent ?? 0) >= indent) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    if (parent) {
      parent.children.push(prop)
    } else {
      props.push(prop)
    }

    stack.push(prop)
  }

  return props
}

/** Removes surrounding single or double quotes from a front matter value */
function stripFrontMatterQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, '')
}

/**
 * Reduces a raw front matter value to its comparable scalar text.
 *
 * A closed quoted scalar keeps `#` literal and may be followed by an inline comment,
 * while an unquoted scalar ends at an inline `#` comment. A comment-only value is
 * a YAML null and reduces to an empty string.
 *
 * @param value - The raw value text after the colon, trimmed
 * @returns The comparable scalar text of the value
 */
export function getComparableFrontMatterValue(value: string): string {
  // A comment-only value is a YAML null
  if (/^\s*#/.test(value)) {
    return ''
  }

  // A closed quoted scalar may only be followed by an inline comment; anything
  // else after the closing quote is invalid YAML and falls through to the
  // unquoted path, which fails the allowed-value check
  const quotedMatch = value.match(/^(["'])(.*?)\1\s*(?:#.*)?$/)
  if (quotedMatch) {
    return quotedMatch[2] ?? ''
  }

  // An unquoted scalar ends at an inline `#` comment
  return stripFrontMatterQuotes(value.replace(/\s+#.*$/, '').trim())
}

/**
 * Whether a raw front matter value opens a multiline value.
 *
 * A `|`/`>` block scalar or an unterminated quoted scalar makes the following
 * more-indented lines value content, not child properties.
 *
 * @param value - The raw value text after the colon, trimmed
 * @returns true when the value continues on the following lines
 */
export function opensMultilineValue(value: string): boolean {
  if (/^[|>]/.test(value)) return true

  const quote = value[0]
  if (quote !== '"' && quote !== '\'') return false

  // A lone quote character is still unterminated
  return value.length < 2 || !value.endsWith(quote)
}

/**
 * Computes the character bounds of a front matter property's value on a line.
 *
 * A closed quoted scalar spans the quote content; an unquoted scalar ends
 * before an inline `#` comment. Returns `undefined` when the line holds no
 * property or no value text.
 *
 * @param line - The full text of the property line
 * @returns The 0-based exclusive character bounds of the value, or `undefined`
 */
export function getFrontMatterValueBounds(line: string): { start: number, end: number } | undefined {
  const colonIndex = line.indexOf(':')
  if (colonIndex === -1) return undefined

  const raw = line.slice(colonIndex + 1)
  const leadingSpaces = raw.length - raw.trimStart().length
  const start = colonIndex + 1 + leadingSpaces
  const valueText = raw.trim()

  if (!valueText) return undefined
  // A comment-only value is a YAML null with no value text to bound
  if (/^#/.test(valueText)) return undefined

  let end: number
  const quotedMatch = valueText.match(/^(["'])/)
  if (quotedMatch?.[1]) {
    const quote = quotedMatch[1]
    const closingIndex = raw.indexOf(quote, leadingSpaces + 1)
    if (closingIndex === -1) {
      // An unterminated quoted scalar extends to the end of the line
      end = line.trimEnd().length
    } else {
      end = colonIndex + 1 + closingIndex + 1
    }
  } else {
    // An unquoted scalar ends before an inline `#` comment
    const scalar = valueText.replace(/\s+#.*$/, '')
    end = start + scalar.trimEnd().length
  }

  if (end <= start) return undefined

  return { start, end }
}
