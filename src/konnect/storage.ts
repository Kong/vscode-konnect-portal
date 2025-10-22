import type { ExtensionContext, SecretStorage } from 'vscode'
import type { StoredPortalConfig } from '../types/konnect'

/**
 * Keys for secret storage
 */
const SECRET_KEYS = {
  KONNECT_TOKEN: 'konnectaccesstoken',
  SELECTED_PORTAL: 'selectedPortalConfig',
} as const

/**
 * Service for managing secure storage of Konnect credentials and portal configuration
 */
export class PortalStorageService {
  /** VS Code's secret storage for secure credential management */
  private readonly secretStorage: SecretStorage

  /**
   * Creates a new PortalStorageService instance
   * @param context VS Code extension context for accessing secret storage
   */
  constructor(context: ExtensionContext) {
    this.secretStorage = context.secrets
  }

  /**
   * Stores the Konnect Personal Access Token securely
   * @param token Personal Access Token to store
   */
  async storeToken(token: string): Promise<void> {
    await this.secretStorage.store(SECRET_KEYS.KONNECT_TOKEN, token.trim())
  }

  /**
   * Retrieves the stored Konnect Personal Access Token
   * @returns Promise resolving to the token or undefined if not found
   */
  async getToken(): Promise<string | undefined> {
    return await this.secretStorage.get(SECRET_KEYS.KONNECT_TOKEN)
  }

  /**
   * Removes the stored Konnect Personal Access Token
   */
  async clearToken(): Promise<void> {
    await this.secretStorage.delete(SECRET_KEYS.KONNECT_TOKEN)
  }

  /**
   * Stores the selected portal configuration
   * @param config Portal configuration to store
   */
  async storeSelectedPortal(config: StoredPortalConfig): Promise<void> {
    await this.secretStorage.store(SECRET_KEYS.SELECTED_PORTAL, JSON.stringify(config))
  }

  /**
   * Retrieves the stored portal configuration
   * @returns Promise resolving to the portal config or undefined if not found
   */
  async getSelectedPortal(): Promise<StoredPortalConfig | undefined> {
    const stored = await this.secretStorage.get(SECRET_KEYS.SELECTED_PORTAL)
    if (!stored) {
      return undefined
    }

    try {
      return JSON.parse(stored) as StoredPortalConfig
    } catch {
      // If JSON parsing fails, clear the corrupted data
      await this.clearSelectedPortal()
      return undefined
    }
  }

  /**
   * Removes the stored portal configuration
   */
  async clearSelectedPortal(): Promise<void> {
    await this.secretStorage.delete(SECRET_KEYS.SELECTED_PORTAL)
  }

  /**
   * Clears all stored data including Konnect token and portal configuration
   * This is useful for complete reset, uninstall cleanup, or switching accounts
   * @returns Promise that resolves when all data is cleared
   */
  async clearAll(): Promise<void> {
    await Promise.all([
      this.clearToken(),
      this.clearSelectedPortal(),
    ])
  }

  /**
   * Checks if a valid token is stored
   * @returns Promise resolving to true if token exists
   */
  async hasValidToken(): Promise<boolean> {
    const token = await this.getToken()
    return Boolean(token && token.trim().length > 0)
  }
}
