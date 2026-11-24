import * as vscode from 'vscode'
import { debug } from '../utils/debug'

/** Default Konnect API domain, also used to tag stored portal configs */
export const DEFAULT_API_DOMAIN = 'konghq.com'

/** Alias for readability inside this module */
const DEFAULT_DOMAIN = DEFAULT_API_DOMAIN

/**
 * Environment variable holding an alternative Konnect API domain for local
 * testing against alternative environments. Unset by default. Regional API
 * hosts are derived from it as '{region}.api.{domain}'.
 */
const API_DOMAIN_OVERRIDE_ENV_VAR = 'KONNECT_API_DOMAIN'

/**
 * kongctl environment variable that overrides its Konnect API base URL
 * (kongctl config path `konnect.base-url`)
 */
const KONGCTL_BASE_URL_ENV_VAR = 'KONGCTL_DEFAULT_KONNECT_BASE_URL'

/**
 * Only the bare domain is a valid override. Regional hosts derive from the
 * value as '{region}.api.{domain}', so a subdomain would produce hosts the
 * user did not name.
 */
const DOMAIN_PATTERN = /^konghq\.[a-z0-9-]+$/

/** Extension mode captured at activation; undefined only in unit tests */
let extensionMode: vscode.ExtensionMode | undefined

/**
 * Set after the first override rejection. This helper runs on every URL
 * build and storage read, so each warning is emitted once per session.
 */
let overrideWarningShown = false

/** Warns once per session about an override rejection */
function warnAboutOverrideOnce(message: string): void {
  if (overrideWarningShown) {
    return
  }
  overrideWarningShown = true
  // Force the log. A silent fallback sends the developer to production while
  // they expect the override environment.
  debug.warn(message, undefined, true)
}

/** Captures the extension mode once at activation for override gating */
export function setExtensionMode(mode: vscode.ExtensionMode): void {
  extensionMode = mode
}

/**
 * Returns the active Konnect API domain. The override is rejected in
 * installed builds, so it can only apply to unpackaged runs.
 * @returns The active domain (e.g. 'konghq.com')
 */
export function getKonnectApiDomain(): string {
  const raw = process.env[API_DOMAIN_OVERRIDE_ENV_VAR]?.trim().toLowerCase()
  if (!raw) {
    return DEFAULT_DOMAIN
  }
  // No captured mode means unit tests: stay silent and use the default
  if (extensionMode === undefined) {
    return DEFAULT_DOMAIN
  }
  if (!DOMAIN_PATTERN.test(raw)) {
    warnAboutOverrideOnce(`Ignoring ${API_DOMAIN_OVERRIDE_ENV_VAR} value '${raw}'. Only *.konghq.* domains are allowed. Using the default API.`)
    return DEFAULT_DOMAIN
  }
  if (extensionMode === vscode.ExtensionMode.Production) {
    warnAboutOverrideOnce(`Ignoring ${API_DOMAIN_OVERRIDE_ENV_VAR} because the extension is running from an installed package. Using the default API.`)
    return DEFAULT_DOMAIN
  }
  return raw
}

/**
 * Builds a Konnect API base URL for the active environment.
 * Region 'global' yields the region-less host. Never cached, so region and
 * environment changes take effect immediately.
 * @param region Konnect region code (e.g. 'us', 'eu') or 'global'
 * @param version API version path segment (e.g. 'v3')
 * @returns Base URL string (e.g., 'https://us.api.konghq.com/v3')
 */
export function konnectApiBaseUrl(region: string, version: string): string {
  return `https://${region}.api.${getKonnectApiDomain()}/${version}`
}

/**
 * Indicates whether an alternative Konnect API domain is active
 * @returns True when an override is in effect
 */
export function isKonnectApiOverridden(): boolean {
  return getKonnectApiDomain() !== DEFAULT_DOMAIN
}

/**
 * kongctl derives its regional hosts from a full base URL, so hand it one
 * built on its own default region. Unset when no override is active, so
 * kongctl uses its own defaults.
 * @returns Variables to merge into the kongctl process environment
 */
export function getKongctlEnvOverrides(): Record<string, string> {
  const domain = getKonnectApiDomain()
  return domain === DEFAULT_DOMAIN ? {} : { [KONGCTL_BASE_URL_ENV_VAR]: `https://us.api.${domain}` }
}
