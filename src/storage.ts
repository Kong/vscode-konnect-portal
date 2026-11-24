import type { ExtensionContext, SecretStorage } from 'vscode'
import type { StoredPortalConfig } from './types/konnect'
import { getKonnectApiDomain, isKonnectApiOverridden, DEFAULT_API_DOMAIN } from './konnect/environment'

/**
 * Base keys for secret storage. When a Konnect API domain override is
 * active, keys get a suffix so credentials of the override environment and
 * the default environment never collide. All override values share one
 * namespace; the portal selection carries its domain and is ignored on a
 * mismatch.
 */
const SECRET_KEYS = {
  KONNECT_TOKEN: 'konnectaccesstoken',
  SELECTED_PORTAL: 'selectedPortalConfig',
}

/**
 * Suffix appended to secret keys when a Konnect API domain override is
 * active. The default environment keeps unsuffixed keys so credentials
 * stored before override support existed continue to resolve.
 */
const OVERRIDE_KEY_SUFFIX = '.override'

/** The domain recorded on configs stored before domain support existed */
const DEFAULT_DOMAIN_FOR_STORAGE = DEFAULT_API_DOMAIN

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

  private getScopedKey(baseKey: string): string {
    return isKonnectApiOverridden() ? `${baseKey}${OVERRIDE_KEY_SUFFIX}` : baseKey
  }

  /**
   * Stores the Konnect Personal Access Token securely
   * @param token Personal Access Token to store
   */
  async storeToken(token: string): Promise<void> {
    await this.secretStorage.store(this.getScopedKey(SECRET_KEYS.KONNECT_TOKEN), token.trim())
  }

  /**
   * Retrieves the stored Konnect Personal Access Token
   * @returns Promise resolving to the token or undefined if not found
   */
  async getToken(): Promise<string | undefined> {
    return await this.secretStorage.get(this.getScopedKey(SECRET_KEYS.KONNECT_TOKEN))
  }

  /**
   * Removes the stored Konnect Personal Access Token
   */
  async clearToken(): Promise<void> {
    await this.secretStorage.delete(this.getScopedKey(SECRET_KEYS.KONNECT_TOKEN))
  }

  /**
   * Stores the selected portal configuration
   * @param config Portal configuration to store
   */
  async storeSelectedPortal(config: StoredPortalConfig): Promise<void> {
    await this.secretStorage.store(this.getScopedKey(SECRET_KEYS.SELECTED_PORTAL), JSON.stringify(config))
  }

  /**
   * Retrieves the stored portal configuration. A config stored under a
   * different API domain than the active one is ignored, so its credentials
   * never reach an environment the user did not select this session.
   * @returns Promise resolving to the portal config or undefined if not found
   */
  async getSelectedPortal(): Promise<StoredPortalConfig | undefined> {
    const stored = await this.secretStorage.get(this.getScopedKey(SECRET_KEYS.SELECTED_PORTAL))
    if (!stored) {
      return undefined
    }

    try {
      const config = JSON.parse(stored) as StoredPortalConfig
      // Legacy configs without a domain were stored under the default domain
      const configDomain = config.domain ?? DEFAULT_DOMAIN_FOR_STORAGE
      if (configDomain !== getKonnectApiDomain()) {
        return undefined
      }
      return config
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
    await this.secretStorage.delete(this.getScopedKey(SECRET_KEYS.SELECTED_PORTAL))
  }

  /**
   * Clears both namespaces. An explicit reset must not leave a token of
   * either environment behind.
   * @returns Promise that resolves when all data is cleared
   */
  async clearAll(): Promise<void> {
    await Promise.all(
      [SECRET_KEYS.KONNECT_TOKEN, SECRET_KEYS.SELECTED_PORTAL].flatMap(key => [
        this.secretStorage.delete(key),
        this.secretStorage.delete(`${key}${OVERRIDE_KEY_SUFFIX}`),
      ]),
    )
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
