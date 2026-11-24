import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as vscode from 'vscode'
import {
  setExtensionMode,
  getKonnectApiDomain,
  konnectApiBaseUrl,
  getKongctlEnvOverrides,
  isKonnectApiOverridden,
} from './environment'

// Mock VS Code module - only what this test file needs
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(false),
    }),
  },
  ExtensionMode: {
    Production: 1,
    Development: 2,
    Test: 3,
  },
}))

/** Original environment variable state, restored after each test */
const ORIGINAL_ENV = process.env

/**
 * Alternative domain used to exercise the override path. Built from parts
 * so no alternative environment domain appears in source.
 */
const OVERRIDE_DOMAIN = ['konghq', 'tech'].join('.')

describe('konnect/environment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.KONNECT_API_DOMAIN
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    // Reset the captured extension mode between tests
    setExtensionMode(undefined as unknown as vscode.ExtensionMode)
  })

  describe('getKonnectApiDomain', () => {
    it('should return the default domain when no override is set', () => {
      setExtensionMode(vscode.ExtensionMode.Development)

      expect(getKonnectApiDomain()).toBe('konghq.com')
    })

    it('should return the override domain on an unpackaged run', () => {
      process.env.KONNECT_API_DOMAIN = OVERRIDE_DOMAIN
      setExtensionMode(vscode.ExtensionMode.Development)

      expect(getKonnectApiDomain()).toBe(OVERRIDE_DOMAIN)
    })

    it('should return the override domain in test mode', () => {
      process.env.KONNECT_API_DOMAIN = OVERRIDE_DOMAIN
      setExtensionMode(vscode.ExtensionMode.Test)

      expect(getKonnectApiDomain()).toBe(OVERRIDE_DOMAIN)
    })

    it('should ignore the override in production (packaged) mode', () => {
      process.env.KONNECT_API_DOMAIN = OVERRIDE_DOMAIN
      setExtensionMode(vscode.ExtensionMode.Production)

      expect(getKonnectApiDomain()).toBe('konghq.com')
    })

    it('should ignore the override when no extension mode was captured', () => {
      process.env.KONNECT_API_DOMAIN = OVERRIDE_DOMAIN

      expect(getKonnectApiDomain()).toBe('konghq.com')
    })

    it('should ignore a whitespace-only or empty override', () => {
      process.env.KONNECT_API_DOMAIN = '   '
      setExtensionMode(vscode.ExtensionMode.Development)

      expect(getKonnectApiDomain()).toBe('konghq.com')
    })

    it('should ignore malformed override values', () => {
      setExtensionMode(vscode.ExtensionMode.Development)

      for (const malformed of ['https://example.com', 'foo bar', 'exa mple.com', '-bad.', 'tech/path', '.tech']) {
        process.env.KONNECT_API_DOMAIN = malformed
        expect(getKonnectApiDomain()).toBe('konghq.com')
      }
    })

    it('should ignore non-Kong domains', () => {
      setExtensionMode(vscode.ExtensionMode.Development)

      for (const foreign of ['example.com', 'evil.konghq.com.evil.test', 'konghq.com.example.test', 'konghq', 'notkonghq.com']) {
        process.env.KONNECT_API_DOMAIN = foreign
        expect(getKonnectApiDomain()).toBe('konghq.com')
      }
    })

    it('should accept Kong domains on any TLD', () => {
      setExtensionMode(vscode.ExtensionMode.Development)

      for (const domain of ['konghq.com', 'konghq.internal', 'konghq.dev']) {
        process.env.KONNECT_API_DOMAIN = domain
        expect(getKonnectApiDomain()).toBe(domain)
      }
    })

    it('should ignore subdomain values since regional hosts derive from the domain', () => {
      setExtensionMode(vscode.ExtensionMode.Development)

      for (const subdomain of [`us.api.${OVERRIDE_DOMAIN}`, 'dev.staging.konghq.internal']) {
        process.env.KONNECT_API_DOMAIN = subdomain
        expect(getKonnectApiDomain()).toBe('konghq.com')
      }
    })
  })

  describe('konnectApiBaseUrl', () => {
    it('should build default-domain regional URLs', () => {
      setExtensionMode(vscode.ExtensionMode.Development)

      expect(konnectApiBaseUrl('us', 'v3')).toBe('https://us.api.konghq.com/v3')
    })

    it('should build override-domain regional URLs', () => {
      process.env.KONNECT_API_DOMAIN = OVERRIDE_DOMAIN
      setExtensionMode(vscode.ExtensionMode.Development)

      expect(konnectApiBaseUrl('eu', 'v3')).toBe(`https://eu.api.${OVERRIDE_DOMAIN}/v3`)
    })

    it('should build the region-less global URL for both domains', () => {
      setExtensionMode(vscode.ExtensionMode.Development)
      expect(konnectApiBaseUrl('global', 'v3')).toBe('https://global.api.konghq.com/v3')

      process.env.KONNECT_API_DOMAIN = OVERRIDE_DOMAIN
      expect(konnectApiBaseUrl('global', 'v3')).toBe(`https://global.api.${OVERRIDE_DOMAIN}/v3`)
    })
  })

  describe('getKongctlEnvOverrides', () => {
    it('should return no variables without an override', () => {
      setExtensionMode(vscode.ExtensionMode.Development)

      expect(getKongctlEnvOverrides()).toEqual({})
    })

    it('should pass a kongctl base URL built on the override domain', () => {
      process.env.KONNECT_API_DOMAIN = OVERRIDE_DOMAIN
      setExtensionMode(vscode.ExtensionMode.Development)

      expect(getKongctlEnvOverrides()).toEqual({
        KONGCTL_DEFAULT_KONNECT_BASE_URL: `https://us.api.${OVERRIDE_DOMAIN}`,
      })
    })
  })

  describe('isKonnectApiOverridden', () => {
    it('should be false without an override', () => {
      setExtensionMode(vscode.ExtensionMode.Development)

      expect(isKonnectApiOverridden()).toBe(false)
    })

    it('should be true with an active override', () => {
      process.env.KONNECT_API_DOMAIN = OVERRIDE_DOMAIN
      setExtensionMode(vscode.ExtensionMode.Development)

      expect(isKonnectApiOverridden()).toBe(true)
    })
  })
})
