import * as vscode from 'vscode'
import { withHttps } from 'ufo'
import type { StoredPortalConfig } from './types/konnect'
import { KonnectRequestService } from './konnect/request-service'
import { fetchAvailableRegions } from './konnect/regions'
import { ApiError } from './konnect/api'
import type { PortalStorageService } from './storage'
import { showApiError } from './utils/error-handling'
import { debug } from './utils/debug'
import { PORTAL_SELECTION_MESSAGES } from './constants/messages'
import { checkAndPromptMDCExtensionForPortal } from './utils/mdc-extension'

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
    this.requestService = new KonnectRequestService(storageService)
    this.storageService = storageService
    this.context = context
  }

  /**
   * Validates the stored portal selection against the current list of available portals.
   * Runs silently in the background - only shows UI if action is needed.
   * Should always be called at session start.
   *
   * @returns The stored portal config if still valid, undefined if cleared/invalid
   */
  async validateStoredPortal(): Promise<StoredPortalConfig | undefined> {
    debug.log('Validating stored portal selection on session start')

    const storedPortal = await this.storageService.getSelectedPortal()

    // No portal stored - nothing to validate
    if (!storedPortal) {
      debug.log('No stored portal to validate')
      return undefined
    }

    debug.log('Found stored portal:', {
      id: storedPortal.id,
      displayName: storedPortal.displayName,
    })

    // Check if we have a token
    const hasToken = await this.storageService.hasValidToken()
    if (!hasToken) {
      debug.log('No token available, skipping portal validation')
      return storedPortal // Can't validate without token, let normal flow handle it
    }

    try {
      // Fetch current list of portals (silently, no progress indicator).
      // If the stored config already knows its region, only query that region.
      // Older configs stored before region support was added lack a region --
      // fall back to validating across every available region.
      debug.log('Fetching portal list to validate stored selection')
      const portals = storedPortal.region
        ? await this.requestService.fetchAllPortals(storedPortal.region)
        : (await this.requestService.fetchAllPortalsAcrossRegions(
          await fetchAvailableRegions(this.storageService),
        )).portals

      // Check if stored portal exists in the list
      const portalExists = portals.some(p => p.id === storedPortal.id)

      if (portalExists) {
        // Portal still valid, continue silently
        debug.log('Stored portal validated successfully')
        return storedPortal
      } else {
        // Portal no longer available, clear it and show warning
        debug.log('Stored portal no longer available, clearing selection:', {
          id: storedPortal.id,
          displayName: storedPortal.displayName,
          availablePortalCount: portals.length,
        })
        await this.storageService.clearSelectedPortal()
        return undefined
      }
    } catch (error) {
      // Handle 401 errors (bad token)
      if (error instanceof ApiError && error.statusCode === 401) {
        debug.log('Token expired during portal validation, clearing credentials')
        await this.storageService.clearToken()
        await this.storageService.clearSelectedPortal()
        // Show error using existing pattern
        await showApiError('Session expired', error, this.context)
        return undefined
      }

      // For other errors (network issues, etc.), log but allow continuation
      // The user can still work, and validation will retry on next session
      debug.error('Failed to validate portal selection:', error)
      return storedPortal
    }
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
          progress.report({ increment: 10, message: PORTAL_SELECTION_MESSAGES.FETCHING_PORTAL_LIST })

          // Discover every available region and fetch portals from all of them
          // in parallel, so the user never has to know or pick a region.
          const regions = await fetchAvailableRegions(this.storageService)
          const { portals, errors } = await this.requestService.fetchAllPortalsAcrossRegions(regions)

          if (cancellationToken.isCancellationRequested) {
            return undefined
          }

          progress.report({ increment: 60, message: PORTAL_SELECTION_MESSAGES.PREPARING_PORTAL_SELECTION })

          if (portals.length === 0) {
            if (errors.length > 0) {
              // Every region failed (as opposed to simply having no portals) --
              // this is worth surfacing as an error rather than a soft warning.
              vscode.window.showErrorMessage(
                PORTAL_SELECTION_MESSAGES.ALL_REGIONS_FAILED(errors.map(e => e.region).join(', ')),
              )
            } else {
              vscode.window.showWarningMessage(
                PORTAL_SELECTION_MESSAGES.NO_PORTALS_WARNING,
              )
            }
            return undefined
          }

          if (errors.length > 0) {
            // Some regions returned portals; others failed (e.g. an opt-in
            // region not enabled for this account). Not fatal -- log and
            // continue with what succeeded.
            debug.warn(
              'Failed to fetch portals from some regions, continuing with the regions that succeeded:',
              errors.map(e => `${e.region}: ${e.error.message}`),
            )
          }

          progress.report({ increment: 20, message: PORTAL_SELECTION_MESSAGES.READY_FOR_SELECTION })

          // Create quick pick items, surfacing each portal's region so the
          // user can see (and filter/search on) where it lives
          const portalItems = portals.map(portal => {
            const label = portal.display_name && portal.display_name !== 'Developer Portal' ? portal.display_name : portal.name
            const description = portal.description || undefined
            const detail = `${portal.canonical_domain}  ·  ${portal.region.toUpperCase()}`

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

          // Create stored config, including the region that drives all
          // subsequent API/kongctl calls for this portal
          const config: StoredPortalConfig = {
            id: selectedItem.portal.id,
            name: selectedItem.portal.name,
            displayName: selectedItem.portal.display_name,
            description: selectedItem.portal.description,
            origin: withHttps(selectedItem.portal.canonical_domain),
            canonicalDomain: selectedItem.portal.canonical_domain,
            region: selectedItem.portal.region,
          }

          // Store the selection
          await this.storageService.storeSelectedPortal(config)

          // Sync MDC extension settings with the portal origin
          try {
            await checkAndPromptMDCExtensionForPortal(config.origin)
          } catch (error) {
            // Silent failure - don't block portal selection if MDC sync fails
            debug.error('Failed to sync MDC extension settings:', error)
          }

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
