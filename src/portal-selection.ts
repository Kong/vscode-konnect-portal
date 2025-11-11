import * as vscode from 'vscode'
import { withHttps } from 'ufo'
import type { StoredPortalConfig } from './types/konnect'
import { KonnectRequestService } from './konnect/request-service'
import { ApiError } from './konnect/api'
import type { PortalStorageService } from './storage'
import { showApiError } from './utils/error-handling'
import { PORTAL_SELECTION_MESSAGES } from './constants/messages'

/**
 * Service for managing portal selection workflow
 */
export class PortalSelectionService {
  /** Service for making Konnect requests (CLI first, API fallback) */
  private readonly requestService: KonnectRequestService

  /** Service for managing secure storage of portal configuration */
  private readonly storageService: PortalStorageService

  /** VS Code extension context for accessing extension resources */
  private readonly context: vscode.ExtensionContext

  /**
   * Creates a new PortalSelectionService instance
   * @param storageService Service for managing portal configuration storage
   * @param context VS Code extension context
   */
  constructor(storageService: PortalStorageService, context: vscode.ExtensionContext) {
    this.requestService = new KonnectRequestService(storageService, context)
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
      throw new Error(PORTAL_SELECTION_MESSAGES.NO_TOKEN)
    }

    // Show loading indicator
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: PORTAL_SELECTION_MESSAGES.LOADING_PORTALS,
        cancellable: true,
      },
      async (progress, cancellationToken) => {
        try {
          progress.report({ increment: 20, message: PORTAL_SELECTION_MESSAGES.FETCHING_PORTAL_LIST })

          const portals = await this.requestService.fetchAllPortals()

          if (cancellationToken.isCancellationRequested) {
            return undefined
          }

          progress.report({ increment: 60, message: PORTAL_SELECTION_MESSAGES.PREPARING_PORTAL_SELECTION })

          if (portals.length === 0) {
            vscode.window.showWarningMessage(
              PORTAL_SELECTION_MESSAGES.NO_PORTALS_WARNING,
            )
            return undefined
          }

          progress.report({ increment: 20, message: PORTAL_SELECTION_MESSAGES.READY_FOR_SELECTION })

          // Create quick pick items
          const portalItems = portals.map(portal => {
            const label = portal.display_name && portal.display_name !== 'Developer Portal' ? portal.display_name : portal.name
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
            placeHolder: PORTAL_SELECTION_MESSAGES.PORTAL_SELECTION_PLACEHOLDER,
            matchOnDescription: true,
            matchOnDetail: true,
            title: PORTAL_SELECTION_MESSAGES.PORTAL_SELECTION_TITLE,
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
            PORTAL_SELECTION_MESSAGES.PORTAL_SELECTED(config.displayName!, config.origin),
          )

          return config
        } catch (error) {
          // If we get a 401 error, automatically clear the invalid token
          if (error instanceof ApiError && error.statusCode === 401) {
            await this.storageService.clearToken()
          }

          await showApiError(PORTAL_SELECTION_MESSAGES.LOAD_PORTALS_FAILED, error, this.context)
          return undefined
        }
      },
    )
  }
}
