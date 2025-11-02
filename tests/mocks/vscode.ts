// Mock implementation of the VS Code API for unit testing
import { vi } from 'vitest'

export const Uri = {
  file: vi.fn((path: string) => ({
    fsPath: path,
    scheme: 'file',
    authority: '',
    path,
    query: '',
    fragment: '',
    with: vi.fn(),
    toJSON: vi.fn(),
  })),
  parse: vi.fn((value: string) => ({
    fsPath: value,
    scheme: 'file',
    authority: '',
    path: value,
    query: '',
    fragment: '',
  })),
}

export const workspace = {
  getWorkspaceFolder: vi.fn(() => null),
  workspaceFolders: [],
  getConfiguration: vi.fn(() => ({
    get: vi.fn(() => undefined),
    has: vi.fn(() => false),
    inspect: vi.fn(() => undefined),
    update: vi.fn(() => Promise.resolve()),
  })),
  onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
}

export const window = {
  showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
  showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
  showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
  showQuickPick: vi.fn(() => Promise.resolve(undefined)),
  showInputBox: vi.fn(() => Promise.resolve(undefined)),
  activeTextEditor: undefined,
  onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
}

export const commands = {
  executeCommand: vi.fn(() => Promise.resolve(undefined)),
  registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
}

export const env = {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
}

export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
  Three: 3,
} as const

export const ExtensionMode = {
  Development: 1,
  Test: 2,
  Production: 3,
} as const

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
} as const

// Mock classes
export class Range {
  constructor(
    public start: any,
    public end: any,
  ) {}
}

export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

export class Selection extends Range {
  constructor(
    public anchor: Position,
    public active: Position,
  ) {
    super(anchor, active)
  }
}

// Export types for compatibility
export interface TextDocument {
  uri: any
  fileName: string
  isUntitled: boolean
  languageId: string
  version: number
  isDirty: boolean
  isClosed: boolean
  save(): Promise<boolean>
  eol: any
  lineCount: number
  lineAt(line: number | Position): any
  offsetAt(position: Position): number
  positionAt(offset: number): Position
  getText(range?: Range): string
  getWordRangeAtPosition(position: Position, regex?: RegExp): Range | undefined
  validateRange(range: Range): Range
  validatePosition(position: Position): Position
}

export interface WorkspaceFolder {
  uri: any
  name: string
  index: number
}

export interface ExtensionContext {
  subscriptions: any[]
  workspaceState: any
  globalState: any
  extensionPath: string
  storagePath?: string
  globalStoragePath: string
  logPath: string
  extensionUri: any
  environmentVariableCollection: any
  extensionMode: any
  secrets: any
  extension: {
    packageJSON: {
      name: string
      version: string
    }
  }
}
