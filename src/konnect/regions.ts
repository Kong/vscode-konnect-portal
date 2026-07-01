import { executeKongctl } from '../kongctl'
import { checkKongctlAvailable } from '../kongctl/status'
import { parseKongctlJsonOutput } from '../kongctl/parse'
import type { PortalStorageService } from '../storage'
import { debug } from '../utils/debug'

/**
 * Regions that are excluded from discovery for now.
 * TODO: 'me' region is not currently supported by the extension. Remove it from this
 * list to re-enable it once support is added.
 */
const UNSUPPORTED_REGIONS = ['me']

/**
 * Shape of the available-regions response returned by both kongctl and the API
 */
interface AvailableRegionsResponse {
  /** Region tiers, keyed by rollout stage */
  regions?: {
    /** Regions generally available to all accounts */
    stable?: string[]
    /** Regions available only to accounts that have explicitly opted in */
    stable_opt_in?: string[]
    /** Regions still in beta rollout */
    beta?: string[]
  }
}

/**
 * Merges the stable and stable_opt_in region tiers, de-dupes, and filters out
 * currently unsupported regions. The stable_opt_in tier may not apply to every
 * org, so opt-in regions are simply not enabled for accounts that lack them.
 * @param response Raw available-regions response from kongctl or the API
 * @returns De-duplicated, filtered array of region codes
 */
function extractRegions(response: AvailableRegionsResponse | undefined): string[] {
  const stable = Array.isArray(response?.regions?.stable) ? response.regions.stable : []
  const stableOptIn = Array.isArray(response?.regions?.stable_opt_in) ? response.regions.stable_opt_in : []
  const merged = Array.from(new Set([...stable, ...stableOptIn]))
  return merged.filter(region => !UNSUPPORTED_REGIONS.includes(region))
}

/**
 * Fetches the list of available Konnect regions using kongctl CLI or API fallback
 * @param storageService PortalStorageService instance for token injection
 * @returns Promise resolving to array of region codes (e.g., ['us', 'eu'])
 */
export async function fetchAvailableRegions(storageService?: PortalStorageService): Promise<string[]> {
  // Try kongctl first if available
  if (await checkKongctlAvailable()) {
    try {
      return await fetchRegionsWithKongctl(storageService)
    } catch {
      // Fallback to API fetch if kongctl fails
      debug.warn('Failed to fetch regions with kongctl, falling back to API')
    }
  }
  return await fetchRegionsWithApi()
}

/**
 * Fetches regions using kongctl CLI
 * @param storageService PortalStorageService instance for token injection
 * @returns Promise resolving to array of region codes
 */
async function fetchRegionsWithKongctl(storageService?: PortalStorageService): Promise<string[]> {
  const args = [
    'get',
    'regions',
    '--output',
    'json',
  ]
  // Silent, programmatic call -- use the isolated spawn fallback (fresh
  // env/token per invocation) rather than the shared terminal, which only
  // applies its env once at creation and isn't safe for concurrent commands.
  const result = await executeKongctl(args, { showInTerminal: false }, storageService)
  if (!result.success) {
    throw new Error(result.stderr || result.stdout)
  }
  // Use shared kongctl output parser for robust JSON extraction
  let response
  try {
    response = parseKongctlJsonOutput(result.stdout)
  } catch (parseError) {
    throw new Error(`Failed to parse kongctl response: ${parseError}`)
  }
  return extractRegions(response)
}

/**
 * Fetches regions using direct API call
 * @returns Promise resolving to array of region codes
 */
async function fetchRegionsWithApi(): Promise<string[]> {
  const url = 'https://global.api.konghq.com/v3/available-regions'
  const response = await fetch(url, { headers: { 'Accept': 'application/json' } })
  if (!response.ok) {
    throw new Error(`Failed to fetch regions: ${response.statusText}`)
  }
  const data = await response.json()
  return extractRegions(data)
}
