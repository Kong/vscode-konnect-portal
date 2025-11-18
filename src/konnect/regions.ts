import { executeKongctl } from '../kongctl'
import { checkKongctlAvailable } from '../kongctl/status'
import { parseKongctlJsonOutput } from '../kongctl/parse'
import type { PortalStorageService } from '../storage'

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
    'api',
    'get',
    '"https://global.api.konghq.com/v3/available-regions"',
    '--output',
    'json',
  ]
  const result = await executeKongctl(args, {}, storageService)
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
  return Array.isArray(response?.regions?.stable) ? response.regions.stable : []
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
  return Array.isArray(data?.regions?.stable) ? data.regions.stable : []
}
