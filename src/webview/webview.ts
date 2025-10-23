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

// VS Code API is available in the webview context
// @ts-ignore - acquireVsCodeApi is injected by VS Code webview runtime
const vscode = acquireVsCodeApi()

const loadingOverlay = document.getElementById('loading-overlay') as HTMLElement | null
const errorOverlay = document.getElementById('error-overlay') as HTMLElement | null
const errorMessage = document.getElementById('error-message') as HTMLElement | null
const errorCode = document.getElementById('error-code') as HTMLElement | null
const iframe = document.getElementById('portal-preview') as HTMLIFrameElement | null

let iframeReady = false
let pendingMessage: any = null
let readyTimeout: ReturnType<typeof setTimeout> | null = null
let debugEnabled = false

const readyTimeoutMs: number = parseInt('{%%READY_TIMEOUT_MS%%}') || 5000

const DEBUG_LOG_PREFIX = '[Portal Preview Webview]'

const debug = {
  log: (message: string, ...args: unknown[]) => debugEnabled && console.log(`${DEBUG_LOG_PREFIX} ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => debugEnabled && console.warn(`${DEBUG_LOG_PREFIX} ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`${DEBUG_LOG_PREFIX} ${message}`, ...args), // Always log errors
}

function showLoading(): void {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden')
  if (errorOverlay) errorOverlay.classList.add('hidden')
}

function hideLoading(): void {
  if (loadingOverlay) loadingOverlay.classList.add('hidden')
}

function showError(message: string, type = 'general', details: string | null = null): void {
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

function clearReadyTimeout(): void {
  if (readyTimeout) {
    debug.log('Clearing ready timeout')
    clearTimeout(readyTimeout)
    readyTimeout = null
  }
}

function handleContentUpdate(message: any): void {
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
  const portalMessage = {
    preview_id: message.previewId || 'default-preview-id',
    path: '/',
    snippet_name: undefined,
    content: message.content || '',
    action: 'portal:preview:update',
  }
  debug.log('Created portal message:', portalMessage)
  if (iframeReady) {
    debug.log('Iframe is ready, sending message immediately')
    sendMessageToIframe(portalMessage)
  } else {
    debug.log('Iframe not ready, storing as pending message')
    pendingMessage = portalMessage
  }
}

function sendMessageToIframe(portalMessage: any): void {
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
  debug.log('Config update processed')
}

function handleRefreshPreview(message: any): void {
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

function handleLoadingState(message: any): void {
  if (message.loading === true) {
    showLoading()
  } else if (message.loading === false) {
    hideLoading()
  }
}

function handlePortalMessage(message: any): void {
  debug.log('Portal message received:', {
    action: message.action,
    type: message.type,
    data: message,
  })
  if (message.action === 'portal:preview:ready') {
    debug.log('Portal is ready! Sending current content...')
    clearReadyTimeout()
    iframeReady = true
    hideLoading()
    if (pendingMessage) {
      debug.log('Sending stored pending message:', pendingMessage)
      sendMessageToIframe(pendingMessage)
      pendingMessage = null
    } else {
      debug.log('No pending message, requesting current content from extension')
      vscode.postMessage({ type: 'webview:request:content' })
    }
  }
}

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

if (iframe && loadingOverlay) {
  showLoading()
  if (iframe.src && iframe.src !== 'about:blank') {
    startReadyTimeout()
  }
}
