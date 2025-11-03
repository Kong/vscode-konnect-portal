import { join } from 'path'
import { readFileSync } from 'fs'
import type { PortalPreviewConfig } from '../types'
import type { StoredPortalConfig } from '../types/konnect'
import { debug } from './debug'

/**
 * Adds the preview=true and preview_id query parameters to a URL, and optionally includes a path
 * @param url The base URL to modify
 * @param previewId The unique preview identifier
 * @param path Optional path to append to the URL (defaults to empty string)
 * @returns URL with preview parameters and path added
 */
export function addPreviewParams(url: string, previewId: string, path = ''): string {
  if (!url) return url

  try {
    const urlObj = new URL(url)
    urlObj.searchParams.set('preview', 'true')
    urlObj.searchParams.set('preview_id', previewId)

    // Add path if provided and not just '/'
    if (path && path !== '/') {
      // Ensure path starts with '/' and append to pathname
      const normalizedPath = path.startsWith('/') ? path : `/${path}`
      urlObj.pathname = urlObj.pathname.replace(/\/$/, '') + normalizedPath
    }

    return urlObj.toString()
  } catch (error) {
    debug.warn('Failed to parse URL for preview params:', { url, error })
    // Fallback: simple string manipulation
    const separator = url.includes('?') ? '&' : '?'
    let resultUrl = `${url}${separator}preview=true&preview_id=${encodeURIComponent(previewId)}`

    // Add path if provided and not just '/'
    if (path && path !== '/') {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`
      resultUrl = url.replace(/\/$/, '') + normalizedPath + `${separator}preview=true&preview_id=${encodeURIComponent(previewId)}`
    }

    return resultUrl
  }
}

// ...existing code...
/**
 * Generates the HTML content for the webview by loading and processing the HTML template file.
 * Falls back to a robust inline template if the file cannot be loaded.
 * @param extensionPath Path to the extension directory
 * @param portalConfig Portal configuration
 * @param previewId Unique preview identifier
 * @param cssContent CSS content to include
 * @param jsContent JavaScript content to include
 * @param path Optional page path for the iframe URL (defaults to empty string)
 * @returns Complete HTML string for webview
 */
export function generateWebviewHTML(
  extensionPath: string,
  portalConfig: StoredPortalConfig,
  previewId: string,
  cssContent: string,
  jsContent: string,
  path = '',
): string {
  try {
    const htmlPath = join(extensionPath, 'src', 'webview', 'webview.html')
    let htmlContent = readFileSync(htmlPath, 'utf8')
    const iframeSrc = addPreviewParams(portalConfig.origin, previewId, path)
    // Replace template variables with actual values
    htmlContent = htmlContent.replace(/\{%%TEMPLATE_CSS_CONTENT%%\}/g, `<style>${cssContent}</style>`)
    htmlContent = htmlContent.replace(/\{%%TEMPLATE_JS_CONTENT%%\}/g, `<script>${jsContent}</script>`)
    htmlContent = htmlContent.replace(/\{%%TEMPLATE_IFRAME_SRC%%\}/g, iframeSrc)
    htmlContent = htmlContent.replace(/\{%%TEMPLATE_PORTAL_ORIGIN%%\}/g, portalConfig.origin)
    return htmlContent
  } catch (error) {
    debug.error('Failed to load webview HTML template:', error)
    /**
     * Fallback HTML template is kept inline here to ensure the extension remains functional
     * if the external template file is missing or cannot be loaded. This fallback includes
     * the full loading and error overlays for a consistent user experience.
     */
    const iframeSrc = addPreviewParams(portalConfig.origin, previewId, path)
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src *; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Portal Preview</title>
  <style>
    ${cssContent}
  </>
</head>
<body>
  <div class="container">
    <div class="iframe-container">
       <div class="loading-overlay" id="loading-overlay">
         <div class="loading-content">
           <h3 class="loading-title">Loading Portal Preview</h3>
           <div class="loading-progress">
             <div class="loading-progress-bar"></div>
           </div>
           <p class="loading-text">Connecting to ${portalConfig.origin}</p>
         </div>
       </div>
       <div class="error-overlay hidden" id="error-overlay">
         <div class="error-content">
           <h3 class="error-title">Portal Preview Error</h3>
           <p class="error-text" id="error-message">Unable to connect to the portal preview.</p>
           <div class="error-code" id="error-code" style="display: none;"></div>
         </div>
       </div>
       <iframe
         id="portal-preview"
         src="${iframeSrc}"
         title="Portal Preview"
         width="100%"
         height="100%"
         allow="clipboard-read; clipboard-write; storage-access"
         sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-storage-access-by-user-activation"
         loading="eager"
         style="border: none; display: block;"
         credentialless="false"
       ></iframe>
     </div>
  </div>
  <script>
    ${jsContent}
  </script>
</body>
</html>
`
  }
}

/**
 * Loads CSS content from external file with fallback
 * @param extensionPath Path to the extension directory
 * @returns CSS content string
 */
export function loadWebviewCSS(extensionPath: string): string {
  try {
    const cssPath = join(extensionPath, 'src', 'webview', 'webview.css')
    return readFileSync(cssPath, 'utf8')
  } catch (error) {
    debug.error('Failed to load webview CSS:', error)
    // Return minimal fallback CSS
    return `
        html, body {
          height: 100%;
          margin: 0;
          padding: 0;
          font-family: var(--vscode-font-family);
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
        }
        .container {
          padding: 20px;
          height: 100vh;
          box-sizing: border-box;
        }
      `
  }
}

/**
 * Loads JavaScript content from external file and processes template variables
 * @param extensionPath Path to the extension directory
 * @param config Portal preview configuration
 * @param previewId Unique preview identifier
 * @returns Processed JavaScript content string
 */
export function loadWebviewJS(
  extensionPath: string,
  config: PortalPreviewConfig,
  previewId: string,
): string {
  try {
    // This file is separately compiled from `src/webview/webview.ts` during the build via the `build:webview` script
    const jsPath = join(extensionPath, 'src', 'webview', 'webview.js')
    let jsContent = readFileSync(jsPath, 'utf8')

    // Replace template variables with actual values
    jsContent = jsContent.replace(/\{%%TEMPLATE_PREVIEW_ID%%\}/g, previewId)
    jsContent = jsContent.replace(/\{%%READY_TIMEOUT_MS%%\}/g, config.readyTimeout.toString())

    // Remove export statement (added for testing) as it's not valid in a non-module script context
    jsContent = jsContent.replace(/export\s*\{[^}]*\}\s*;?\s*$/m, '')

    return jsContent
  } catch (error) {
    debug.error('Failed to load webview JavaScript:', error)
    // Return minimal fallback JavaScript
    return `
        console.error('Failed to load webview JavaScript file. Extension functionality may be limited.');
        const vscode = acquireVsCodeApi();
        // Basic error reporting
        vscode.postMessage({
          type: 'webview:error',
          error: 'Failed to load webview JavaScript file'
        });
      `
  }
}
