import * as vscode from 'vscode'
import { withHttps } from 'ufo'
import type { StoredPortalConfig } from '../types/konnect'
import { KonnectApiService, ApiError } from './api'
import type { PortalStorageService } from './storage'
import { showApiError } from '../utils/error-handling'

/**
 * Service for managing portal selection workflow
 */
export class PortalSelectionService {
  private readonly apiService: KonnectApiService
  private readonly storageService: PortalStorageService
  private readonly context: vscode.ExtensionContext

  constructor(storageService: PortalStorageService, context: vscode.ExtensionContext) {
    this.apiService = new KonnectApiService()
    this.storageService = storageService
    this.context = context
  }

  /**
   * Shows portal selection UI and handles user selection
   * @returns Promise resolving to selected portal config or undefined if cancelled
   */
  async selectPortal(): Promise<StoredPortalConfig | undefined> {
    const token = await this.storageService.getToken()
    if (!token) {
      throw new Error('No Konnect token found. Please configure your Personal Access Token to continue.')
    }

    // Show loading indicator
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Loading portals from Konnect...',
        cancellable: true,
      },
      async (progress, cancellationToken) => {
        try {
          progress.report({ increment: 20, message: 'Fetching portal list...' })

          const portals = await this.apiService.fetchAllPortals(token)

          if (cancellationToken.isCancellationRequested) {
            return undefined
          }

          progress.report({ increment: 60, message: 'Preparing portal selection...' })

          if (portals.length === 0) {
            vscode.window.showWarningMessage(
              'No portals found in your Konnect account. Please create a portal first.',
            )
            return undefined
          }

          progress.report({ increment: 20, message: 'Ready for selection' })

          // Create quick pick items
          const portalItems = portals.map(portal => {
            const label = portal.display_name || portal.name
            const description = portal.description || undefined
            const detail = portal.canonical_domain

            return {
              label,
              description,
              detail,
              portal,
            }
          })

          // Show portal selection
          const selectedItem = await vscode.window.showQuickPick(portalItems, {
            placeHolder: 'Select a Dev Portal to preview',
            matchOnDescription: true,
            matchOnDetail: true,
            title: 'Portal Selection',
          })

          if (!selectedItem) {
            return undefined
          }

          // Create stored config
          const config: StoredPortalConfig = {
            id: selectedItem.portal.id,
            name: selectedItem.portal.name,
            displayName: selectedItem.portal.display_name,
            description: selectedItem.portal.description,
            origin: withHttps(selectedItem.portal.canonical_domain),
            canonicalDomain: selectedItem.portal.canonical_domain,
          }

          // Store the selection
          await this.storageService.storeSelectedPortal(config)

          vscode.window.showInformationMessage(
            `Portal "${config.displayName}" selected. (${config.origin})`,
          )

          return config
        } catch (error) {
          // If we get a 401 error, automatically clear the invalid token
          if (error instanceof ApiError && error.statusCode === 401) {
            await this.storageService.clearToken()
          }

          await showApiError('Failed to load portals', error, this.context)
          return undefined
        }
      },
    )
  }
}
