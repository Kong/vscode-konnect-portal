/**
 * Portal Preview Webview TypeScript
 *
 * !IMPORTANT: This file is compiled to JavaScript in the `build:webview` script
 * and injected into the webview as part of the main build process.
 *
 * It handles:
 * - Communication between VS Code extension and webview
 * - Portal iframe lifecycle management
 * - Message passing to/from the portal
 * - Loading states and error handling
 * - Configuration updates
 */

/** Portal preview actions sent TO the portal */
const PortalPreviewAction = {
  UPDATE: 'portal:preview:update',
  NAVIGATE: 'portal:preview:navigate',
  EXIT: 'portal:preview:exit',
}

/** Portal preview actions received FROM the portal */
const PortalPreviewIncomingAction = {
  READY: 'portal:preview:ready',
}


/** VS Code API for webview messaging (injected by VS Code at runtime) */
// @ts-ignore - acquireVsCodeApi is injected by VS Code webview runtime
const vscode = acquireVsCodeApi()


/** DOM element for the loading overlay */
const loadingOverlay = document.getElementById('loading-overlay') as HTMLElement | null
/** DOM element for the error overlay */
const errorOverlay = document.getElementById('error-overlay') as HTMLElement | null
/** DOM element for the error message text */
const errorMessage = document.getElementById('error-message') as HTMLElement | null
/** DOM element for the error code details */
const errorCode = document.getElementById('error-code') as HTMLElement | null
/** DOM element for the portal preview iframe */
const iframe = document.getElementById('portal-preview') as HTMLIFrameElement | null


/** Tracks whether the portal iframe is ready to receive messages */
let iframeReady = false
/** Stores a pending message to send to the iframe when ready */
let pendingMessage: any = null
/** Timeout handle for portal ready state */
let readyTimeout: ReturnType<typeof setTimeout> | null = null
/** Whether debug logging is enabled */
let debugEnabled = false
/** Tracks whether the timeout warning has been shown in this session */
let timeoutWarningShown = false


/** Timeout in milliseconds to wait for portal ready signal (replaced at runtime via template variable) */
const readyTimeoutMs: number = parseInt('{%%READY_TIMEOUT_MS%%}') || 8000


/** Prefix for debug log messages */
const DEBUG_LOG_PREFIX = '[Portal Preview Webview]'


/** Debug logging utility for the webview */
const debug = {
  /** Logs a debug message if enabled */
  log: (message: string, ...args: unknown[]) => debugEnabled && console.log(`${DEBUG_LOG_PREFIX} ${message}`, ...args),
  /** Logs a warning if enabled */
  warn: (message: string, ...args: unknown[]) => debugEnabled && console.warn(`${DEBUG_LOG_PREFIX} ${message}`, ...args),
  /** Always logs an error */
  error: (message: string, ...args: unknown[]) => console.error(`${DEBUG_LOG_PREFIX} ${message}`, ...args),
}


/** Shows the loading overlay and hides the error overlay */
function showLoading(): void {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden')
  if (errorOverlay) errorOverlay.classList.add('hidden')
}


/** Hides the loading overlay */
function hideLoading(): void {
  if (loadingOverlay) loadingOverlay.classList.add('hidden')
}

function showError(message: string, type = 'general', details: string | null = null): void {
  /**
   * Shows an error message in the preview panel
   * @param message - The error message to display
   * @param type - The type of error (general, invalid-url, load-failed, etc.)
   * @param details - Additional error details to display
   */
  console.error('Showing error:', { message, type, details })
  if (errorMessage) errorMessage.textContent = message
  if (errorCode && details) {
    errorCode.textContent = details
    errorCode.style.display = 'block'
  } else if (errorCode) {
    errorCode.style.display = 'none'
  }
  if (loadingOverlay) loadingOverlay.classList.add('hidden')
  if (errorOverlay) errorOverlay.classList.remove('hidden')
  vscode.postMessage({ type: 'webview:error', error: message, errorType: type })
}


/** Starts the timeout for waiting for portal ready signal */
function startReadyTimeout(): void {
  clearTimeout(readyTimeout as any)
  debug.log(`Starting ready timeout (${readyTimeoutMs}ms)...`)
  readyTimeout = setTimeout(() => {
    debug.warn('Portal ready timeout reached, sending content anyway...')
    if (!timeoutWarningShown) {
      vscode.postMessage({
        type: 'webview:warning',
        warning: 'Portal preview took longer than expected to load. Continuing with content updates, but preview may not work correctly. Check your Dev Portal Base URL and network connection.',
        warningType: 'timeout',
      })
      timeoutWarningShown = true
    }
    iframeReady = true
    hideLoading()
    if (pendingMessage) {
      debug.log('Timeout reached - sending stored pending message:', pendingMessage)
      sendMessageToIframe(pendingMessage)
      pendingMessage = null
    } else {
      debug.log('Timeout reached - requesting current content from extension')
      vscode.postMessage({ type: 'webview:request:content' })
    }
  }, readyTimeoutMs)
}


/** Clears the portal ready timeout */
function clearReadyTimeout(): void {
  if (readyTimeout) {
    clearTimeout(readyTimeout)
    readyTimeout = null
  }
}

/**
 * Handles content update messages from the extension
 * @param message - The content update message
 */
function handleContentUpdate(message: any): void {
  debug.log('handleContentUpdate called with:', {
    hasIframe: !!iframe,
    hasConfig: !!message.config,
    hasPortalConfig: !!message.portalConfig,
    portalOrigin: message.portalConfig?.origin || 'none',
    contentLength: message.content ? message.content.length : 0,
    previewId: message.previewId,
    path: message.path || '/',
    snippetName: message.snippetName || 'none',
    iframeReady: iframeReady,
  })
  if (!iframe || !message.config || !message.portalConfig?.origin) {
    debug.warn('Missing required elements for content update:', {
      iframe: !!iframe,
      config: !!message.config,
      portalOrigin: message.portalConfig?.origin || 'none',
    })
    return
  }
  const portalMessage = {
    preview_id: message.previewId || 'default-preview-id',
    path: message.snippetName ? undefined : (message.path || '/'),
    snippet_name: message.snippetName || undefined,
    content: message.content || '',
    action: PortalPreviewAction.UPDATE,
  }
  if (iframeReady) {
    debug.log('Iframe is ready, sending message immediately to portal iframe')
    sendMessageToIframe(portalMessage)
  } else {
    debug.log('Iframe not ready, storing as pending message', {
      contentLength: portalMessage.content.length,
    })
    pendingMessage = portalMessage
  }
}

/**
 * Sends a message to the portal iframe
 * @param portalMessage - The message to send to the portal
 */
function sendMessageToIframe(portalMessage: any): void {
  debug.log('Attempting to send message to iframe:', {
    hasIframe: !!iframe,
    hasContentWindow: !!(iframe && iframe.contentWindow),
    messageAction: portalMessage.action,
    messageContentLength: portalMessage.content ? portalMessage.content.length : 0,
    previewId: portalMessage.preview_id,
    path: portalMessage.path,
  })
  try {
    if (iframe && iframe.contentWindow) {
      debug.log('Sending postMessage to iframe with:', portalMessage)
      iframe.contentWindow.postMessage(portalMessage, '*')
    } else {
      console.error('Cannot send message - iframe or contentWindow not available')
    }
  } catch (error) {
    console.error('Failed to send message to portal iframe:', error)
    vscode.postMessage({
      type: 'webview:error',
      error: 'Failed to communicate with portal. The portal may not be loaded yet.',
    })
  }
}

/**
 * Handles configuration update messages from the extension
 * @param message - The configuration update message
 */
function handleConfigUpdate(message: any): void {
  debug.log('Handling config update:', { hasConfig: !!message.config })
  if (!message.config) {
    debug.error('No config provided in update message')
    return
  }
  if (message.config.debug !== undefined) {
    debugEnabled = message.config.debug
    console.log(`${DEBUG_LOG_PREFIX}  Debug logging updated:`, { debugEnabled })
  }
}

/**
 * Handles refresh preview messages from the extension
 * @param message - The refresh message
 */
function handleRefreshPreview(message: any): void {
  debug.log('Refreshing preview iframe with content update', {
    hasMessage: !!message,
    hasContent: !!(message && message.content),
    contentLength: message?.content?.length || 0,
    hasPreviewId: !!(message && message.previewId),
    hasConfig: !!(message && message.config),
    path: message?.path || '/',
    snippetName: message?.snippetName || 'none',
  })
  if (iframe && iframe.src) {
    clearReadyTimeout()
    iframeReady = false
    if (message && message.content !== undefined) {
      pendingMessage = {
        preview_id: message.previewId || 'default-preview-id',
        path: message.snippetName ? undefined : (message.path || '/'),
        snippet_name: message.snippetName || undefined,
        content: message.content || '',
        action: PortalPreviewAction.UPDATE,
      }
      debug.log('Stored content for post-refresh portal:ready signal:', {
        contentLength: pendingMessage.content.length,
        previewId: pendingMessage.preview_id,
        path: pendingMessage.path,
        contentPreview: pendingMessage.content.substring(0, 100) + '...',
      })
    } else {
      debug.warn('No content provided for refresh, will request from extension when portal ready')
      pendingMessage = null
    }
    showLoading()
    const currentSrc = iframe.src
    debug.log('Reloading iframe, will wait for portal:preview:ready signal')

    // Reconstruct iframe URL with updated path from message
    let newSrc = currentSrc
    if (message && (message.path !== undefined || message.snippetName !== undefined)) {
      try {
        const url = new URL(currentSrc)

        // Update the pathname based on whether it's a snippet or page
        // Query params (preview=true, preview_id) are preserved automatically

        if (message.snippetName) {
          // For snippets, use the snippet preview path from the message
          // The path should be /_preview-mode/snippets/<name>
          url.pathname = message.path || `/_preview-mode/snippets/${message.snippetName}`
        } else if (message.path && message.path !== '/') {
          // For regular pages, use the page path
          const normalizedPath = message.path.startsWith('/') ? message.path : `/${message.path}`
          url.pathname = normalizedPath
        } else {
          // For default/home page
          url.pathname = '/'
        }

        newSrc = url.toString()
        debug.log('Updated iframe src with new path:', {
          oldSrc: currentSrc,
          newSrc,
          path: message.path,
          snippetName: message.snippetName,
        })
      } catch (error) {
        debug.warn('Failed to update iframe URL with new path, using original:', error)
        newSrc = currentSrc
      }
    }

    iframe.src = 'about:blank'
    setTimeout(() => {
      debug.log('Setting iframe src to:', newSrc)
      iframe.src = newSrc
      startReadyTimeout()
    }, 100)
  } else {
    console.error('Cannot refresh - no iframe or src available')
  }
}

/**
 * Handles loading state messages from the extension
 * @param message - The loading state message
 */
function handleLoadingState(message: any): void {
  if (message.loading === true) {
    showLoading()
  } else if (message.loading === false) {
    hideLoading()
  }
}

/**
 * Handles messages received from the portal iframe
 * @param message - The message from the portal
 */
function handlePortalMessage(message: any): void {
  debug.log('Portal message received:', {
    action: message.action,
    type: message.type,
    data: message,
  })
  if (message.action === PortalPreviewIncomingAction.READY) {
    debug.log('Portal is ready!')
    clearReadyTimeout()
    iframeReady = true
    // Don't hide loading yet - wait for extension to finish snippet injection and content update

    if (pendingMessage) {
      debug.log('Sending stored pending message:', pendingMessage)
      sendMessageToIframe(pendingMessage)
      pendingMessage = null
    }

    // Always request content from extension to inject snippets and send latest page content
    debug.log('Requesting content from extension for snippet injection and page content')
    vscode.postMessage({ type: 'webview:request:content' })
  }
}

/**
 * Handles navigation messages from the extension
 * @param message - The navigation message
 */
function handleNavigate(message: any): void {
  debug.log('Handling navigate message:', {
    hasIframe: !!iframe,
    hasConfig: !!message.config,
    hasPortalConfig: !!message.portalConfig,
    portalOrigin: message.portalConfig?.origin || 'none',
    previewId: message.previewId,
    path: message.path || '/',
    snippetName: message.snippetName || 'none',
    iframeReady: iframeReady,
  })

  if (!iframe || !message.config || !message.portalConfig?.origin) {
    debug.warn('Missing required elements for navigation:', {
      iframe: !!iframe,
      config: !!message.config,
      portalOrigin: message.portalConfig?.origin || 'none',
    })
    return
  }

  const portalMessage = {
    preview_id: message.previewId || 'default-preview-id',
    path: message.path || '/',
    snippet_name: undefined,
    // No content for navigation messages
    action: PortalPreviewAction.NAVIGATE,
  }

  if (iframeReady) {
    debug.log('Iframe is ready, sending navigate message immediately')
    sendMessageToIframe(portalMessage)
  } else {
    debug.log('Iframe not ready, storing navigate message as pending')
    pendingMessage = portalMessage
  }
}


/**
 * Handles messages received from both extension and iframe
 * @param event - The message event
 */
window.addEventListener('message', function(event: MessageEvent) {
  const message = event.data
  if (event.source === iframe?.contentWindow) {
    debug.log('Received message from portal iframe:', message)
    handlePortalMessage(message)
    return
  }
  debug.log('Received message from extension:', {
    type: message.type,
    hasContent: !!(message.content),
    contentPreview: message.content ? message.content.substring(0, 100) + '...' : 'N/A',
    previewId: message.previewId,
    path: message.path || 'N/A',
    snippetName: message.snippetName || 'N/A',
  })
  switch (message.type) {
    case 'webview:update:content':
      handleContentUpdate(message)
      break
    case 'webview:update:config':
      handleConfigUpdate(message)
      break
    case 'webview:refresh':
      handleRefreshPreview(message)
      break
    case 'webview:navigate':
      handleNavigate(message)
      break
    case 'webview:loading':
      handleLoadingState(message)
      break
    default:
      debug.log('Unknown message type:', message.type)
  }
})


/** Sets up iframe load and error event listeners for portal preview lifecycle */
if (iframe) {
  iframe.addEventListener('load', function() {
    const currentUrl = iframe.src || 'unknown'
    debug.log('Iframe load event fired - waiting for portal ready signal', {
      url: currentUrl,
      hasPendingMessage: !!pendingMessage,
      pendingContentLength: pendingMessage?.content?.length || 0,
    })
    iframeReady = false
    clearReadyTimeout()
    startReadyTimeout()
    debug.log('Waiting for portal:preview:ready message from iframe...')
    // Notify extension that iframe has loaded (triggers snippet injection reset)
    vscode.postMessage({ type: 'webview:iframe:loaded' })
  })
  iframe.addEventListener('error', function(event) {
    console.error('Iframe failed to load:', event)
    clearReadyTimeout()
    iframeReady = false
    showError(
      'Failed to load the portal preview. Please check the Dev Portal Base URL in settings.',
      'load-failed',
      'Iframe load error',
    )
  })
}


/** Initializes loading state and starts ready timeout if needed */
if (iframe && loadingOverlay) {
  showLoading()
  if (iframe.src && iframe.src !== 'about:blank') {
    startReadyTimeout()
  }
}


/**
 * Viewport switcher
 *
 * Scales the portal iframe into fixed device widths (tablet/mobile) so the page
 * renders at its true layout width, then shrinks to fit the panel. Desktop
 * fills the container. All logic is guarded on the toolbar elements existing,
 * so the fallback HTML template (no toolbar) keeps working.
 */

/** Preset for a viewport frame: a null height means the desktop canonical view */
interface ViewportPreset {
  /** Fixed frame width in pixels */
  width: number | null
  /** Fixed frame height in pixels used for the height-fit term, or null for desktop */
  height: number | null
}

/** Known viewport keys and their frame presets
 * Tablet is iPad portrait (768x1024); desktop renders at the canonical
 * 1440px portal desktop width, scaled down to fit narrower panels */
const VIEWPORT_PRESETS: Record<string, ViewportPreset> = {
  desktop: { width: 1440, height: null },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 430, height: 932 },
}

/** The default viewport used when nothing valid is persisted */
const DEFAULT_VIEWPORT = 'desktop'

/** Storage key for the persisted viewport choice in webview state */
const VIEWPORT_STATE_KEY = 'portalPreviewViewport'

/**
 * Computes the frame geometry for a viewport inside a container
 * @param viewport - The viewport key
 * @param containerWidth - Measured container width in pixels
 * @param containerHeight - Measured container height in pixels
 * @returns Frame size in pixels and scale. Width is always a fixed preset
 *   width; height is null for desktop, which renders at container height.
 */
function computeFrameGeometry(
  viewport: string,
  containerWidth: number,
  containerHeight: number,
): { width: number, height: number | null, scale: number } {
  const preset = VIEWPORT_PRESETS[viewport] || VIEWPORT_PRESETS[DEFAULT_VIEWPORT]
  const frameWidth = preset.width as number
  // Desktop: render the canonical width and zoom out to fit narrower
  // panels, capped at 1 so a wider panel never zooms in. The frame height
  // is containerHeight / scale so the scaled height fills the pane.
  if (preset.height === null) {
    const scale = Math.min(1, containerWidth / frameWidth)
    return { width: frameWidth, height: containerHeight / scale, scale }
  }
  // Fixed device viewports: scale to fit both axes so a short or narrow
  // panel never clips the frame
  const scale = Math.min(
    1,
    containerWidth / frameWidth,
    containerHeight / preset.height,
  )
  return { width: frameWidth, height: preset.height, scale }
}

/** Returns the iframe element if viewport switching is available, else null */
function getViewportContext(): {
  iframe: HTMLIFrameElement
  container: HTMLElement
  switcher: HTMLElement
  buttons: HTMLButtonElement[]
} | null {
  if (!iframe) return null
  const container = document.getElementById('iframe-container')
  const switcher = document.getElementById('viewport-switcher')
  if (!container || !switcher) return null
  const buttons = Array.from(switcher.querySelectorAll<HTMLButtonElement>('[data-viewport]'))
  if (buttons.length === 0) return null
  return { iframe, container, switcher, buttons }
}

/**
 * Applies a viewport to the iframe: renders the frame at the preset's fixed
 * width, scaled to fit the container
 * @param viewport - The viewport key to apply
 */
function applyViewport(viewport: string): void {
  const ctx = getViewportContext()
  if (!ctx) return
  const { iframe: frame, container, buttons } = ctx

  // Highlight the active button and update ARIA state
  for (const button of buttons) {
    const isActive = button.dataset.viewport === viewport
    button.classList.toggle('active', isActive)
    button.setAttribute('aria-selected', isActive ? 'true' : 'false')
  }
  container.classList.toggle('viewport-tablet', viewport === 'tablet')
  container.classList.toggle('viewport-mobile', viewport === 'mobile')

  const geometry = computeFrameGeometry(viewport, container.clientWidth, container.clientHeight)
  // Explicit inline sizes plus transform: Chrome does not evaluate CSS-class
  // sizes of a cross-origin iframe inside a transformed subtree reliably
  frame.style.width = `${geometry.width}px`
  frame.style.height = `${geometry.height}px`
  frame.style.transform = `scale(${geometry.scale})`
  frame.style.transformOrigin = 'top center'
}

/**
 * Validates a persisted viewport key against known presets
 * @param value - The stored value to validate
 * @returns The value if known, else the default viewport
 */
function normalizeViewport(value: unknown): string {
  return typeof value === 'string' && value in VIEWPORT_PRESETS ? value : DEFAULT_VIEWPORT
}

/** Sets up viewport switching: restore state, wire clicks, observe resizes */
function setupViewportSwitcher(): void {
  const ctx = getViewportContext()
  if (!ctx) return
  const { container } = ctx

  try {
    const saved = vscode.getState()?.[VIEWPORT_STATE_KEY]
    currentViewport = normalizeViewport(saved)
  } catch (error) {
    debug.warn('Failed to read persisted viewport:', error)
    currentViewport = DEFAULT_VIEWPORT
  }

  applyViewport(currentViewport)

  for (const button of ctx.buttons) {
    button.addEventListener('click', () => {
      const next = normalizeViewport(button.dataset.viewport)
      if (next === currentViewport) return
      currentViewport = next
      applyViewport(currentViewport)
      try {
        vscode.setState({ [VIEWPORT_STATE_KEY]: currentViewport })
      } catch (error) {
        debug.warn('Failed to persist viewport:', error)
      }
    })
  }

  // Re-fit when the panel resizes. ResizeObserver fires once on observe,
  // which performs the initial fit; debounce avoids thrash during drags.
  if (typeof ResizeObserver === 'undefined') return
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  const observer = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => applyViewport(currentViewport), 50)
  })
  observer.observe(container)
}

/** Tracks the active viewport key */
let currentViewport: string = DEFAULT_VIEWPORT

setupViewportSwitcher()
