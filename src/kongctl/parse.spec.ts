import { describe, it, expect } from 'vitest'
import { parseKongctlJsonOutput } from './parse'

// Helper: wrap output in CLI noise
function withNoise(json: string, prefix = '', suffix = '') {
  return `${prefix}\n${json}\n${suffix}`
}

describe('parseKongctlJsonOutput', () => {
  it('parses a plain JSON object', () => {
    const json = '{"foo":42,"bar":[1,2,3]}'
    expect(parseKongctlJsonOutput(json)).toEqual({ foo: 42, bar: [1, 2, 3] })
  })

  it('parses a plain JSON array', () => {
    const json = '[{"id":1},{"id":2}]'
    expect(parseKongctlJsonOutput(json)).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('parses JSON object with CLI noise before and after', () => {
    const json = '{"foo":true}'
    const noisy = withNoise(json, 'Some CLI output', 'More CLI output')
    expect(parseKongctlJsonOutput(noisy)).toEqual({ foo: true })
  })

  it('parses JSON array with CLI noise', () => {
    const json = '[1,2,3]'
    const noisy = withNoise(json, 'WARN: something', 'Done.')
    expect(parseKongctlJsonOutput(noisy)).toEqual([1, 2, 3])
  })

  it('parses JSON with ANSI codes and non-printable chars', () => {
    const json = '\u001b[32m{"foo":1}\u001b[0m%'
    expect(parseKongctlJsonOutput(json)).toEqual({ foo: 1 })
  })

  it('throws if no JSON found', () => {
    expect(() => parseKongctlJsonOutput('no json here')).toThrow(/No valid JSON value/)
  })

  it('throws if JSON is invalid', () => {
    const bad = '{foo:bar}'
    expect(() => parseKongctlJsonOutput(bad)).toThrow(/Failed to parse kongctl response/)
  })
})
