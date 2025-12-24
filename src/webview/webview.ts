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


/** Timeout in milliseconds to wait for portal ready signal (replaced at runtime via template variable) */
const readyTimeoutMs: number = parseInt('{%%READY_TIMEOUT_MS%%}') || 5000


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
    vscode.postMessage({
      type: 'webview:warning',
      warning: 'Portal preview took longer than expected to load. Continuing with content updates, but preview may not work correctly. Check your Dev Portal Base URL and network connection.',
      warningType: 'timeout',
    })
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
    iframe.src = 'about:blank'
    setTimeout(() => {
      debug.log('Setting iframe src back to:', currentSrc)
      iframe.src = currentSrc
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
