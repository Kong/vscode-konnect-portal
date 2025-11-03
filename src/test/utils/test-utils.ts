import { vi, type MockedFunction } from 'vitest'
import type * as vscode from 'vscode'

/**
 * Creates a mock VS Code TextDocument for testing
 */
export function createMockTextDocument(options: {
  fileName: string
  fsPath: string
  content: string
  languageId?: string
}): vscode.TextDocument {
  return {
    uri: {
      fsPath: options.fsPath,
      scheme: 'file',
      authority: '',
      path: options.fsPath,
      query: '',
      fragment: '',
      with: vi.fn(),
      toJSON: vi.fn(),
    },
    fileName: options.fileName,
    isUntitled: false,
    languageId: options.languageId || 'markdown',
    version: 1,
    isDirty: false,
    isClosed: false,
    getText: vi.fn().mockReturnValue(options.content),
    save: vi.fn(),
    eol: 1, // \n
    lineCount: options.content.split('\n').length,
    lineAt: vi.fn(),
    offsetAt: vi.fn(),
    positionAt: vi.fn(),
    getWordRangeAtPosition: vi.fn(),
    validateRange: vi.fn(),
    validatePosition: vi.fn(),
  } as any
}

/**
 * Creates a mock VS Code WorkspaceFolder
 */
export function createMockWorkspaceFolder(options: {
  name: string
  fsPath: string
}): vscode.WorkspaceFolder {
  return {
    uri: {
      fsPath: options.fsPath,
      scheme: 'file',
      authority: '',
      path: options.fsPath,
      query: '',
      fragment: '',
      with: vi.fn(),
      toJSON: vi.fn(),
    },
    name: options.name,
    index: 0,
  }
}

/**
 * Creates a mock VS Code ExtensionContext for testing
 */
export function createMockExtensionContext(options: {
  extensionPath: string
  name?: string
  version?: string
}): vscode.ExtensionContext {
  return {
    subscriptions: [],
    workspaceState: {
      get: vi.fn(),
      update: vi.fn(),
      keys: vi.fn(),
    },
    globalState: {
      get: vi.fn(),
      update: vi.fn(),
      keys: vi.fn(),
      setKeysForSync: vi.fn(),
    },
    secrets: {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      onDidChange: vi.fn(),
    },
    extensionUri: {
      fsPath: options.extensionPath,
      scheme: 'file',
      authority: '',
      path: options.extensionPath,
      query: '',
      fragment: '',
      with: vi.fn(),
      toJSON: vi.fn(),
    },
    extensionPath: options.extensionPath,
    environmentVariableCollection: {} as any,
    asAbsolutePath: vi.fn().mockImplementation((relativePath: string) =>
      `${options.extensionPath}/${relativePath}`,
    ),
    storageUri: undefined,
    storagePath: undefined,
    globalStorageUri: {
      fsPath: '/mock/global/storage',
      scheme: 'file',
      authority: '',
      path: '/mock/global/storage',
      query: '',
      fragment: '',
      with: vi.fn(),
      toJSON: vi.fn(),
    },
    globalStoragePath: '/mock/global/storage',
    logUri: {
      fsPath: '/mock/logs',
      scheme: 'file',
      authority: '',
      path: '/mock/logs',
      query: '',
      fragment: '',
      with: vi.fn(),
      toJSON: vi.fn(),
    },
    logPath: '/mock/logs',
    extensionMode: 3, // Test mode
    extension: {
      id: 'kong.vscode-konnect-portal',
      extensionUri: {
        fsPath: options.extensionPath,
        scheme: 'file',
        authority: '',
        path: options.extensionPath,
        query: '',
        fragment: '',
        with: vi.fn(),
        toJSON: vi.fn(),
      },
      extensionPath: options.extensionPath,
      isActive: true,
      packageJSON: {
        name: options.name || 'vscode-konnect-portal',
        version: options.version || '1.0.0',
      },
      extensionKind: 1, // UI
      exports: undefined,
      activate: vi.fn(),
    },
  } as any
}

/**
 * Creates mock VS Code API modules for testing
 */
export function createMockVSCodeAPI() {
  const mockWorkspace = {
    getWorkspaceFolder: vi.fn(),
    workspaceFolders: [],
    getConfiguration: vi.fn(),
    onDidChangeConfiguration: vi.fn(),
    onDidChangeWorkspaceFolders: vi.fn(),
  }

  const mockWindow = {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    activeTextEditor: undefined,
    onDidChangeActiveTextEditor: vi.fn(),
  }

  const mockCommands = {
    executeCommand: vi.fn(),
    registerCommand: vi.fn(),
  }

  return {
    workspace: mockWorkspace,
    window: mockWindow,
    commands: mockCommands,
    Uri: {
      file: vi.fn().mockImplementation((path: string) => ({
        fsPath: path,
        scheme: 'file',
        authority: '',
        path,
        query: '',
        fragment: '',
        with: vi.fn(),
        toJSON: vi.fn(),
      })),
      parse: vi.fn(),
    },
    ViewColumn: {
      Active: -1,
      Beside: -2,
      One: 1,
      Two: 2,
      Three: 3,
    },
  }
}

/**
 * Helper to create a mock function with specific return values for different calls
 */
export function createMockWithReturnValues<T extends (...args: any[]) => any>(
  returnValues: Array<ReturnType<T>>,
): MockedFunction<T> {
  const mock = vi.fn() as MockedFunction<T>
  returnValues.forEach((value) => {
    mock.mockReturnValueOnce(value as any)
  })
  return mock
}
