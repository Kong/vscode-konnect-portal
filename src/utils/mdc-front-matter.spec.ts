import { describe, expect, it } from 'vitest'
import {
  MDC_PAGE_FRONT_MATTER_PROPERTIES,
  MDC_PAGE_LAYOUT_NAMES,
  FRONT_MATTER_PROP_REGEX,
  getComparableFrontMatterValue,
  getFrontMatterValueBounds,
  getMdcFrontMatterBlock,
  opensMultilineValue,
  parseMdcFrontMatterProps,
} from './mdc-front-matter'

describe('mdc-front-matter', () => {
  describe('getMdcFrontMatterBlock', () => {
    it('returns the boundaries of a closed front matter block', () => {
      const lines = '---\ntitle: "Hello"\n---\n\n::page-section\n'.split('\n')
      expect(getMdcFrontMatterBlock(lines)).toEqual({ startLine: 0, endLine: 2 })
    })

    it('skips leading empty lines before the opening marker', () => {
      const lines = '\n\n---\ntitle: "Hello"\n---\n'.split('\n')
      expect(getMdcFrontMatterBlock(lines)).toEqual({ startLine: 2, endLine: 4 })
    })

    it('returns undefined when there is no front matter block', () => {
      expect(getMdcFrontMatterBlock('# Just markdown\n'.split('\n'))).toBeUndefined()
    })

    it('returns undefined when the block is not closed', () => {
      expect(getMdcFrontMatterBlock('---\ntitle: "Hello"\n'.split('\n'))).toBeUndefined()
    })

    it('returns undefined when the first `---` is not at the top of the document', () => {
      expect(getMdcFrontMatterBlock('Some content\n---\ntitle: "Hello"\n---\n'.split('\n'))).toBeUndefined()
    })

    it('does not close the block on an indented `---` inside a block scalar', () => {
      expect(getMdcFrontMatterBlock('---\ndescription: |\n  ---\ntitle: "Hello"\n---\n'.split('\n'))).toEqual({ startLine: 0, endLine: 4 })
    })
  })

  describe('parseMdcFrontMatterProps', () => {
    it('parses top-level properties in document order', () => {
      const lines = '---\ntitle: "Hello"\ndescription: "World"\n---\n'.split('\n')
      const props = parseMdcFrontMatterProps(lines)

      expect(props.map(prop => prop.name)).toEqual(['title', 'description'])
      expect(props[0]).toMatchObject({ value: '"Hello"', lineNumber: 1, indent: 0 })
    })

    it('nests child properties under their parent', () => {
      const lines = '---\nlayout-options:\n  sidebar-left: "a"\n  sidebar-right: "b"\n---\n'.split('\n')
      const props = parseMdcFrontMatterProps(lines)

      expect(props).toHaveLength(1)
      expect(props[0]?.name).toBe('layout-options')
      expect(props[0]?.children.map(child => child.name)).toEqual(['sidebar-left', 'sidebar-right'])
    })

    it('skips comments and invalid lines', () => {
      const lines = '---\n# a comment\ntitle: "Hello"\n---\n'.split('\n')
      expect(parseMdcFrontMatterProps(lines).map(prop => prop.name)).toEqual(['title'])
    })

    it('returns no properties without a closed front matter block', () => {
      expect(parseMdcFrontMatterProps('---\ntitle: "Hello"\n'.split('\n'))).toEqual([])
    })
  })

  describe('getComparableFrontMatterValue', () => {
    it.each([
      ['closed double quotes', '"guide"', 'guide'],
      ['closed single quotes', "'guide'", 'guide'],
      ['unquoted value', 'guide', 'guide'],
      ['unquoted value with inline comment', 'guide # note', 'guide'],
      ['closed quoted value with inline comment', '"guide" # note', 'guide'],
      ['comment-only value', '# note', ''],
      ['empty value', '', ''],
    ])('reduces %s', (_label, value, expected) => {
      expect(getComparableFrontMatterValue(value)).toBe(expected)
    })
  })

  describe('opensMultilineValue', () => {
    it.each([
      ['block scalar pipe', '|', true],
      ['block scalar angle bracket', '>', true],
      ['unterminated double quote', '"guide', true],
      ['lone quote character', '"', true],
      ['empty quote pair', '""', false],
      ['closed quoted value', '"guide"', false],
      ['plain value', 'guide', false],
      ['empty value', '', false],
    ])('detects %s', (_label, value, expected) => {
      expect(opensMultilineValue(value)).toBe(expected)
    })
  })

  describe('getFrontMatterValueBounds', () => {
    it('spans a closed quoted value', () => {
      expect(getFrontMatterValueBounds('layout: "guides"')).toEqual({ start: 8, end: 16 })
    })

    it('spans an unterminated quoted value to the end of the line', () => {
      expect(getFrontMatterValueBounds('layout: "guides')).toEqual({ start: 8, end: 15 })
    })

    it('stops before an inline comment on an unquoted value', () => {
      expect(getFrontMatterValueBounds('layout: sidebar # note')).toEqual({ start: 8, end: 15 })
    })

    it('stops at the closing quote with a trailing comment', () => {
      expect(getFrontMatterValueBounds('layout: "guide" # note')).toEqual({ start: 8, end: 15 })
    })

    it('returns undefined without a value', () => {
      expect(getFrontMatterValueBounds('layout: ')).toBeUndefined()
      expect(getFrontMatterValueBounds('layout: # note')).toBeUndefined()
      expect(getFrontMatterValueBounds('not-a-prop-line')).toBeUndefined()
    })
  })

  describe('MDC_PAGE_FRONT_MATTER_PROPERTIES', () => {
    it('derives the layout values from the layout name list', () => {
      const layout = MDC_PAGE_FRONT_MATTER_PROPERTIES.find(prop => prop.name === 'layout')

      expect(layout?.values).toEqual([...MDC_PAGE_LAYOUT_NAMES])
    })

    it('suggests portal snippets for the layout-options children', () => {
      const layoutOptions = MDC_PAGE_FRONT_MATTER_PROPERTIES.find(prop => prop.name === 'layout-options')

      expect(layoutOptions?.properties?.every(child => child.suggestions === 'snippets')).toBe(true)
    })

    it('matches property lines with the prop regex', () => {
      const match = FRONT_MATTER_PROP_REGEX.exec('  layout-options: # note')

      expect(match?.[2]).toBe('layout-options')
      expect(match?.[3]).toBe(' # note')
    })
  })
})
