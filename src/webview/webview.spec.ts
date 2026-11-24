import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Behavioral tests for the portal preview webview script.
 *
 * The webview source has no exports and runs acquireVsCodeApi() at module top
 * level, so tests stub the API on globalThis, build a minimal DOM, then import
 * the module dynamically. Dynamic import is required because a static import
 * would evaluate before the stub is installed.
 */

/** Minimal VS Code webview API stub */
function createVscodeStub(state: Record<string, unknown> = {}): {
  getState: () => Record<string, unknown>
  setState: (data: Record<string, unknown>) => void
  postMessage: ReturnType<typeof vi.fn>
} {
  let stored = { ...state }
  return {
    getState: () => stored,
    setState: (data: Record<string, unknown>) => {
      stored = { ...stored, ...data }
    },
    postMessage: vi.fn(),
  }
}

/** Builds the DOM the viewport switcher expects, mirroring webview.html */
function buildViewportDom(): void {
  document.body.innerHTML = `
    <div class="container">
      <div class="viewport-toolbar">
        <div class="viewport-switcher" id="viewport-switcher">
          <button type="button" id="viewport-desktop" data-viewport="desktop">Desktop</button>
          <button type="button" id="viewport-tablet" data-viewport="tablet">Tablet</button>
          <button type="button" id="viewport-mobile" data-viewport="mobile">Mobile</button>
        </div>
      </div>
      <div class="iframe-container" id="iframe-container">
        <iframe id="portal-preview" src="https://portal.example.com/"></iframe>
      </div>
    </div>
  `
}

describe('webview viewport switcher', () => {
  /** Container size override applied per test; jsdom reports 0 for layout */
  let containerSize: { width: number, height: number }

  beforeEach(() => {
    vi.resetModules()
    containerSize = { width: 1200, height: 900 }
    // clientWidth/clientHeight are 0 in jsdom, so route the measurement
    // through a stubbed prototype getter
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.id === 'iframe-container' ? containerSize.width : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.id === 'iframe-container' ? containerSize.height : 0
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    delete (globalThis as Record<string, unknown>).acquireVsCodeApi
  })

  /** Imports the webview module with a VS Code API stub and fresh DOM.
   * The path is held in a variable and targets the TS source explicitly:
   * webview.ts is intentionally a script (no exports), so TS rejects a
   * literal import, and vite would otherwise resolve './webview' to the
   * stale compiled webview.js build artifact. */
  async function importWebview(state: Record<string, unknown> = {}) {
    const vscodeStub = createVscodeStub(state)
    ;(globalThis as Record<string, unknown>).acquireVsCodeApi = () => vscodeStub
    const modulePath = './webview.ts'
    await import(modulePath)
    return vscodeStub
  }

  it('renders desktop at the canonical 1440px width scaled to fit', async () => {
    buildViewportDom()
    containerSize = { width: 800, height: 900 }
    await importWebview()

    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    // Scale 800 / 1440, height stretched by 1 / scale to fill the pane
    expect(iframe.style.width).toBe('1440px')
    expect(iframe.style.height).toBe(`${900 / (800 / 1440)}px`)
    const expectedDesktopScale = 800 / 1440
    expect(iframe.style.transform).toBe(`scale(${expectedDesktopScale})`)
    expect(document.getElementById('viewport-desktop')?.classList.contains('active')).toBe(true)
  })

  it('applies no geometry while the container has no layout', async () => {
    buildViewportDom()
    containerSize = { width: 0, height: 0 }
    await importWebview()

    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    expect(iframe.style.width).toBe('')
    expect(iframe.style.transform).toBe('')
  })

  it('marks the active button with aria-pressed', async () => {
    buildViewportDom()
    await importWebview()

    document.getElementById('viewport-tablet')?.dispatchEvent(new MouseEvent('click'))
    expect(document.getElementById('viewport-tablet')?.getAttribute('aria-pressed')).toBe('true')
    expect(document.getElementById('viewport-desktop')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('applies tablet geometry at iPad portrait size and scales down', async () => {
    buildViewportDom()
    containerSize = { width: 800, height: 900 }
    await importWebview()

    document.getElementById('viewport-tablet')?.dispatchEvent(new MouseEvent('click'))
    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    expect(iframe.style.width).toBe('768px')
    expect(iframe.style.height).toBe('1024px')
    // Height term limits: 900 / 1024
    const expectedScale = 900 / 1024
    expect(iframe.style.transform).toBe(`scale(${expectedScale})`)
    expect(iframe.style.transformOrigin).toBe('top center')
    expect(document.getElementById('viewport-tablet')?.classList.contains('active')).toBe(true)
    expect(document.getElementById('viewport-desktop')?.classList.contains('active')).toBe(false)
  })

  it('applies mobile geometry with height-limited scale in a short container', async () => {
    buildViewportDom()
    containerSize = { width: 1200, height: 800 }
    await importWebview()

    document.getElementById('viewport-mobile')?.dispatchEvent(new MouseEvent('click'))
    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    expect(iframe.style.width).toBe('430px')
    expect(iframe.style.height).toBe('932px')
    // Height term limits: scale = 800 / 932
    const expectedScale = 800 / 932
    expect(iframe.style.transform).toBe(`scale(${expectedScale})`)
  })

  it('applies mobile geometry unscaled when the container is larger than the frame', async () => {
    buildViewportDom()
    containerSize = { width: 2000, height: 1200 }
    await importWebview()

    document.getElementById('viewport-mobile')?.dispatchEvent(new MouseEvent('click'))
    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    expect(iframe.style.width).toBe('430px')
    expect(iframe.style.height).toBe('932px')
    expect(iframe.style.transform).toBe('scale(1)')
  })

  it('clears to desktop geometry when switching back to desktop', async () => {
    buildViewportDom()
    containerSize = { width: 800, height: 900 }
    await importWebview()

    document.getElementById('viewport-tablet')?.dispatchEvent(new MouseEvent('click'))
    document.getElementById('viewport-desktop')?.dispatchEvent(new MouseEvent('click'))
    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    expect(iframe.style.width).toBe('1440px')
    const expectedDesktopScale = 800 / 1440
    expect(iframe.style.transform).toBe(`scale(${expectedDesktopScale})`)
    expect(document.getElementById('viewport-desktop')?.classList.contains('active')).toBe(true)
  })

  it('persists the viewport choice through the VS Code state API', async () => {
    buildViewportDom()
    const vscodeStub = await importWebview()

    document.getElementById('viewport-mobile')?.dispatchEvent(new MouseEvent('click'))
    expect(vscodeStub.getState()).toEqual({ portalPreviewViewport: 'mobile' })
  })

  it('restores a persisted tablet viewport at startup', async () => {
    buildViewportDom()
    await importWebview({ portalPreviewViewport: 'tablet' })

    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    expect(iframe.style.width).toBe('768px')
    expect(iframe.style.height).toBe('1024px')
    expect(document.getElementById('viewport-tablet')?.classList.contains('active')).toBe(true)
  })

  it('falls back to desktop when the persisted viewport is unknown', async () => {
    buildViewportDom()
    containerSize = { width: 800, height: 900 }
    await importWebview({ portalPreviewViewport: 'widescreen' })

    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    expect(iframe.style.width).toBe('1440px')
    expect(document.getElementById('viewport-desktop')?.classList.contains('active')).toBe(true)
  })

  it('falls back to desktop when persisted state holds an inherited object key', async () => {
    buildViewportDom()
    containerSize = { width: 800, height: 900 }
    await importWebview({ portalPreviewViewport: 'toString' })

    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    expect(iframe.style.width).toBe('1440px')
    expect(document.getElementById('viewport-desktop')?.classList.contains('active')).toBe(true)
  })

  it('does nothing when the toolbar is missing from the DOM', async () => {
    document.body.innerHTML = `
      <div class="container">
        <div class="iframe-container" id="iframe-container">
          <iframe id="portal-preview" src="https://portal.example.com/"></iframe>
        </div>
      </div>
    `
    await importWebview()

    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    expect(iframe.style.width).toBe('')
    expect(iframe.style.transform).toBe('')
  })

  it('re-fits the frame when the container resizes', async () => {
    buildViewportDom()
    containerSize = { width: 800, height: 900 }
    // Capture constructed observers so a test can fire their callbacks
    const observers: Array<{ callback: ResizeObserverCallback }> = []
    class FakeResizeObserver {
      callback: ResizeObserverCallback
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
        observers.push(this)
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    await importWebview()

    document.getElementById('viewport-tablet')?.dispatchEvent(new MouseEvent('click'))
    containerSize = { width: 500, height: 900 }

    // Fire the captured observer callback, then flush the 50ms debounce
    vi.useFakeTimers()
    expect(observers).toHaveLength(1)
    observers[0]!.callback([], {} as ResizeObserver)
    vi.advanceTimersByTime(50)

    const iframe = document.getElementById('portal-preview') as HTMLIFrameElement
    // Width term limits: 500 / 768
    const expectedScale = 500 / 768
    expect(iframe.style.transform).toBe(`scale(${expectedScale})`)
    vi.useRealTimers()
  })
})
