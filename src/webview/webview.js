/**
 * Portal Preview Webview JavaScript
 *
 * !IMPORTANT: This file must remain native JavaScript, not TypeScript.
 *
 * This file contains all the JavaScript functionality for the VS Code webview that hosts
 * the portal preview iframe. It handles:
 * - Communication between VS Code extension and webview
 * - Portal iframe lifecycle management
 * - Message passing to/from the portal
 * - Loading states and error handling
 * - Configuration updates
 */

// Initialize VS Code API and DOM elements
const vscode = acquireVsCodeApi()
const loadingOverlay = document.getElementById('loading-overlay')
const errorOverlay = document.getElementById('error-overlay')
const errorMessage = document.getElementById('error-message')
const errorCode = document.getElementById('error-code')
const iframe = document.getElementById('portal-preview')

// State management
let iframeReady = false
let pendingMessage = null
let readyTimeout = null
let debugEnabled = false

// Configuration values (will be set by template replacement at runtime)
// These will be replaced by actual values when the webview is loaded
let readyTimeoutMs = parseInt('{%%READY_TIMEOUT_MS%%}') || 5000

const DEBUG_LOG_PREFIX = '[Portal Preview Webview]'

/**
 * Simple debug logging wrapper
 */
const debug = {
  log: (message, ...args) => debugEnabled && console.log(`${DEBUG_LOG_PREFIX} ${message}`, ...args),
  warn: (message, ...args) => debugEnabled && console.warn(`${DEBUG_LOG_PREFIX} ${message}`, ...args),
  error: (message, ...args) => console.error(`${DEBUG_LOG_PREFIX} ${message}`, ...args), // Always log errors
}

/**
 * Shows the loading overlay
 */
function showLoading() {
  if (loadingOverlay) {
    loadingOverlay.classList.remove('hidden')
  }
  if (errorOverlay) {
    errorOverlay.classList.add('hidden')
  }
}

/**
 * Hides the loading overlay
 */
function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden')
  }
}

/**
 * Shows an error message in the preview panel
 * @param {string} message - The error message to display
 * @param {string} type - The type of error (general, invalid-url, load-failed, etc.)
 * @param {string} details - Additional error details to display
 */
function showError(message, type = 'general', details = null) {
  console.error('Showing error:', { message, type, details })

  if (errorMessage) {
    errorMessage.textContent = message
  }

  if (errorCode && details) {
    errorCode.textContent = details
    errorCode.style.display = 'block'
  } else if (errorCode) {
    errorCode.style.display = 'none'
  }

  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden')
  }
  if (errorOverlay) {
    errorOverlay.classList.remove('hidden')
  }

  // Send error message to extension
  vscode.postMessage({
    type: 'webview:error',
    error: message,
    errorType: type,
  })
}

/**
 * Starts the timeout for waiting for portal ready signal
 */
function startReadyTimeout() {
  clearTimeout(readyTimeout)
  debug.log(`Starting ready timeout (${readyTimeoutMs}ms)...`)

  readyTimeout = setTimeout(() => {
    debug.warn('Portal ready timeout reached, sending content anyway...')

    // Send warning message to VS Code
    vscode.postMessage({
      type: 'webview:warning',
      warning: 'Portal preview took longer than expected to load. Continuing with content updates, but preview may not work correctly. Check your Dev Portal Base URL and network connection.',
      warningType: 'timeout',
    })

    // Mark as ready and proceed
    iframeReady = true
    hideLoading()

    // Send pending content or request current content
    if (pendingMessage) {
      debug.log('Timeout reached - sending stored pending message:', pendingMessage)
      sendMessageToIframe(pendingMessage)
      pendingMessage = null
    } else {
      debug.log('Timeout reached - requesting current content from extension')
      vscode.postMessage({
        type: 'webview:request:content',
      })
    }
  }, readyTimeoutMs)
}

/**
 * Clears the portal ready timeout
 */
function clearReadyTimeout() {
  if (readyTimeout) {
    debug.log('Clearing ready timeout')
    clearTimeout(readyTimeout)
    readyTimeout = null
  }
}

/**
 * Handles content update messages from the extension
 * @param {Object} message - The content update message
 */
function handleContentUpdate(message) {
  debug.log('handleContentUpdate called with:', {
    hasIframe: !!iframe,
    hasConfig: !!message.config,
    hasPortalConfig: !!message.portalConfig,
    portalOrigin: message.portalConfig?.origin || 'none',
    contentLength: message.content ? message.content.length : 0,
    previewId: message.previewId,
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

  // Ensure we always have content and action as per PostPortalStudioMessageData interface
  const portalMessage = {
    preview_id: message.previewId || 'default-preview-id',
    path: '/',
    snippet_name: undefined,
    content: message.content || '', // Always include content, even if empty
    action: 'portal:preview:update', // Always include this specific action
  }

  debug.log('Created portal message:', portalMessage)

  if (iframeReady) {
    debug.log('Iframe is ready, sending message immediately')
    sendMessageToIframe(portalMessage)
  } else {
    debug.log('Iframe not ready, storing as pending message')
    // Store the message to send when iframe is ready
    pendingMessage = portalMessage
  }
}

/**
 * Sends a message to the portal iframe
 * @param {Object} portalMessage - The message to send to the portal
 */
function sendMessageToIframe(portalMessage) {
  debug.log('Attempting to send message to iframe:', {
    hasIframe: !!iframe,
    hasContentWindow: !!(iframe && iframe.contentWindow),
    messageAction: portalMessage.action,
    messageContentLength: portalMessage.content ? portalMessage.content.length : 0,
    previewId: portalMessage.preview_id,
  })

  try {
    if (iframe && iframe.contentWindow) {
      debug.log('Sending postMessage to iframe with:', portalMessage)

      // Use '*' as targetOrigin to allow cross-origin communication
      iframe.contentWindow.postMessage(portalMessage, '*')

      debug.log('postMessage sent successfully!')
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
 * @param {Object} message - The configuration update message
 */
function handleConfigUpdate(message) {
  debug.log('Handling config update:', {
    hasConfig: !!message.config,
  })

  if (!message.config) {
    debug.error('No config provided in update message')
    return
  }

  // Update debug setting
  if (message.config.debug !== undefined) {
    debugEnabled = message.config.debug
    console.log(`${DEBUG_LOG_PREFIX}  Debug logging updated:`, { debugEnabled }) // Always show this
  }

  // Configuration updates no longer handle portal URL changes
  // Portal URL is now managed through portal selection
  debug.log('Config update processed')
}

/**
 * Handles refresh preview messages from the extension
 * @param {Object} message - The refresh message
 */
function handleRefreshPreview(message) {
  debug.log('Refreshing preview iframe with content update', {
    hasMessage: !!message,
    hasContent: !!(message && message.content),
    contentLength: message?.content?.length || 0,
    hasPreviewId: !!(message && message.previewId),
    hasConfig: !!(message && message.config),
  })

  if (iframe && iframe.src) {
    clearReadyTimeout()
    iframeReady = false

    // Store current content to send when portal signals ready
    if (message && message.content !== undefined) {
      pendingMessage = {
        preview_id: message.previewId || 'default-preview-id',
        path: '/',
        snippet_name: undefined,
        content: message.content || '',
        action: 'portal:preview:update',
      }
      debug.log('Stored content for post-refresh portal:ready signal:', {
        contentLength: pendingMessage.content.length,
        previewId: pendingMessage.preview_id,
        contentPreview: pendingMessage.content.substring(0, 100) + '...',
      })
    } else {
      debug.warn('No content provided for refresh, will request from extension when portal ready')
      pendingMessage = null
    }

    showLoading()
    // Force reload - content will be sent when portal sends "ready" message
    const currentSrc = iframe.src
    debug.log('Reloading iframe, will wait for portal:preview:ready signal')
    iframe.src = 'about:blank'
    setTimeout(() => {
      debug.log('Setting iframe src back to:', currentSrc)
      iframe.src = currentSrc
      // Start timeout to handle case where portal doesn't send ready signal
      startReadyTimeout()
    }, 100)
  } else {
    console.error('Cannot refresh - no iframe or src available')
  }
}

/**
 * Handles loading state messages from the extension
 * @param {Object} message - The loading state message
 */
function handleLoadingState(message) {
  if (message.loading === true) {
    showLoading()
  } else if (message.loading === false) {
    hideLoading()
  }
}

/**
 * Handles messages received from the portal iframe
 * @param {Object} message - The message from the portal
 */
function handlePortalMessage(message) {
  debug.log('Portal message received:', {
    action: message.action,
    type: message.type,
    data: message,
  })

  // Handle portal:preview:ready message
  if (message.action === 'portal:preview:ready') {
    debug.log('Portal is ready! Sending current content...')

    // Clear timeout and mark iframe as ready
    clearReadyTimeout()
    iframeReady = true

    // Hide loading overlay
    hideLoading()

    // Send pending message if we have one, or request current content
    if (pendingMessage) {
      debug.log('Sending stored pending message:', pendingMessage)
      sendMessageToIframe(pendingMessage)
      pendingMessage = null
    } else {
      debug.log('No pending message, requesting current content from extension')
      // Request current content from extension
      vscode.postMessage({
        type: 'webview:request:content',
      })
    }
  }
}

// Listen for messages from both extension and iframe
window.addEventListener('message', function(event) {
  const message = event.data

  // Check if message is from the iframe (portal)
  if (event.source === iframe?.contentWindow) {
    debug.log('Received message from portal iframe:', message)
    handlePortalMessage(message)
    return
  }

  // Handle messages from extension
  debug.log('Received message from extension:', {
    type: message.type,
    hasContent: !!(message.content),
    contentPreview: message.content ? message.content.substring(0, 100) + '...' : 'N/A',
    previewId: message.previewId,
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
    case 'webview:loading':
      handleLoadingState(message)
      break
    default:
      debug.log('Unknown message type:', message.type)
  }
})

// Handle iframe load events
if (iframe) {
  iframe.addEventListener('load', function() {
    const currentUrl = iframe.src || 'unknown'
    debug.log('Iframe load event fired - waiting for portal ready signal', {
      url: currentUrl,
      hasPendingMessage: !!pendingMessage,
      pendingContentLength: pendingMessage?.content?.length || 0,
    })

    // Reset state and start timeout for portal ready signal
    iframeReady = false
    clearReadyTimeout()
    startReadyTimeout()

    // Wait for portal to send "portal:preview:ready" message
    debug.log('Waiting for portal:preview:ready message from iframe...')
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

// Initial loading state and setup
if (iframe && loadingOverlay) {
  showLoading()

  // Start initial timeout if iframe src is already set
  if (iframe.src && iframe.src !== 'about:blank') {
    startReadyTimeout()
  }
}
