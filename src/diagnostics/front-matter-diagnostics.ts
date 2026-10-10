import { Diagnostic, DiagnosticSeverity, Range, Uri, languages, workspace } from 'vscode'
import type { DiagnosticCollection, TextDocument } from 'vscode'
import {
  MDC_PAGE_FRONT_MATTER_PROPERTIES,
  getComparableFrontMatterValue,
  getFrontMatterValueBounds,
  opensMultilineValue,
  parseMdcFrontMatterProps,
} from '../utils/mdc-front-matter'
import { getSnippetsDirectory, isSnippetDocument } from '../utils/page-path'
import type { PortalStorageService } from '../storage'
import { debug } from '../utils/debug'

/** Diagnostic source shown in the Problems panel */
const DIAGNOSTIC_SOURCE = 'Konnect Portal'

/** Document language ids front matter diagnostics apply to */
const SUPPORTED_LANGUAGE_IDS = ['markdown', 'mdc']

/**
 * Checks whether the document language can hold portal front matter.
 * @param document The VS Code document to check
 */
function isSupportedLanguage(document: TextDocument): boolean {
  return SUPPORTED_LANGUAGE_IDS.includes(document.languageId)
    || /\.(md|mdc)$/i.test(document.fileName)
}

/**
 * Computes warnings for invalid values of the `layout` front matter property.
 *
 * The `layout` name is validated against `MDC_PAGE_FRONT_MATTER_PROPERTIES`,
 * whose values come from `MDC_PAGE_LAYOUT_NAMES`. Unrecognized properties are
 * ignored, and warnings use `Warning` severity so they never block saving.
 *
 * @param document The VS Code document to validate
 * @returns The front matter diagnostics for the document
 */
export function getFrontMatterDiagnostics(document: TextDocument): Diagnostic[] {
  const lines = document.getText().split(/\r?\n/)
  const props = parseMdcFrontMatterProps(lines)
  const layoutProp = props.find(prop => prop.indent === 0 && prop.name === 'layout')
  const layoutSchema = MDC_PAGE_FRONT_MATTER_PROPERTIES.find(prop => prop.name === 'layout')
  const layoutValues = layoutSchema?.type === 'enum' ? layoutSchema.values : undefined
  if (!layoutProp || !layoutValues?.length) return []

  // An empty or comment-only value is a YAML null and stays valid
  const value = getComparableFrontMatterValue(layoutProp.value)
  if (!value) return []

  // Child properties under `layout` form a mapping, not a scalar value
  let message: string | undefined
  if (layoutProp.children.length && !opensMultilineValue(layoutProp.value)) {
    message = `'layout' must be a single-line value. Valid values: ${layoutValues.join(', ')}.`
  } else if (!layoutValues.includes(value)) {
    message = `Invalid value "${value}" for 'layout'. Valid values: ${layoutValues.join(', ')}.`
  }
  if (!message) return []

  const bounds = getFrontMatterValueBounds(lines[layoutProp.lineNumber] ?? '')
  if (!bounds) return []

  const diagnostic = new Diagnostic(
    new Range(layoutProp.lineNumber, bounds.start, layoutProp.lineNumber, bounds.end),
    message,
    DiagnosticSeverity.Warning,
  )
  diagnostic.source = DIAGNOSTIC_SOURCE
  // Renders as a clickable link in the Problems panel
  const docsUrl = layoutSchema?.docsUrl
  if (docsUrl) {
    diagnostic.code = { value: "View the 'layout' docs", target: Uri.parse(docsUrl) }
  }
  return [diagnostic]
}

/** Reports front matter warnings for Markdown and MDC documents in the Problems panel */
export class FrontMatterDiagnostics {
  /** Underlying VS Code diagnostic collection */
  private readonly collection: DiagnosticCollection

  /**
   * @param storageService Authentication and portal selection storage
   */
  constructor(private readonly storageService: PortalStorageService) {
    this.collection = languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE)
  }

  /**
   * Recomputes diagnostics for a document, clearing them when the document is out of scope.
   *
   * The portal check is asynchronous, so each call computes diagnostics from the document
   * content read after the check; concurrent calls for the same document are self-correcting.
   */
  async update(document: TextDocument): Promise<void> {
    try {
      // Snippet files render their own front matter, so page front matter never applies to them
      if (!isSupportedLanguage(document) || isSnippetDocument(document, getSnippetsDirectory())) {
        this.collection.delete(document.uri)
        return
      }

      // Front matter tooling is portal content assistance, so it requires a selected portal.
      // The document may also have been closed while the asynchronous check was in flight.
      const portal = await this.storageService.getSelectedPortal()
      if (!portal || !workspace.textDocuments.includes(document)) {
        this.collection.delete(document.uri)
        return
      }

      this.collection.set(document.uri, getFrontMatterDiagnostics(document))
    } catch (error) {
      debug.error('Failed to update front matter diagnostics:', error)
    }
  }

  /** Recomputes diagnostics for every open document, for example after the portal selection changes. */
  async refreshAll(): Promise<void> {
    await Promise.all(workspace.textDocuments.map(document => this.update(document)))
  }

  /** Clears diagnostics for a document that is no longer open. */
  remove(uri: Uri): void {
    this.collection.delete(uri)
  }

  /** Disposes the underlying diagnostic collection. */
  dispose(): void {
    this.collection.dispose()
  }
}
