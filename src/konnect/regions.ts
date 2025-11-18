import { executeKongctl } from '../kongctl'
import { checkKongctlAvailable } from '../kongctl/status'
import stripAnsi from 'strip-ansi'

/**
 * Fetches the list of available Konnect regions using kongctl CLI or API fallback
 * @returns Promise resolving to array of region codes (e.g., ['us', 'eu'])
 */
export async function fetchAvailableRegions(): Promise<string[]> {
  // Try kongctl first if available
  if (await checkKongctlAvailable()) {
    try {
      return await fetchRegionsWithKongctl()
    } catch {
      // Fallback to API fetch if kongctl fails
    }
  }
  return await fetchRegionsWithApi()
}

/**
 * Fetches regions using kongctl CLI
 * @returns Promise resolving to array of region codes
 */
async function fetchRegionsWithKongctl(): Promise<string[]> {
  const args = [
    'api',
    'get',
    '"https://global.api.konghq.com/v3/available-regions"',
    '--output',
    'json',
  ]
  const result = await executeKongctl(args)
  if (!result.success) {
    throw new Error(`Kongctl command failed: ${result.stderr || result.stdout}`)
  }
  let cleanStdout = stripAnsi(result.stdout.trim())
  // Remove ANSI escape codes and all non-printable control characters except standard whitespace
  cleanStdout = cleanStdout.replace(/[^\n\t\x20-\x7E]/g, '')
  let response
  try {
    response = JSON.parse(cleanStdout)
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
