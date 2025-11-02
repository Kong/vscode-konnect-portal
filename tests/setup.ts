import { vi } from 'vitest'

// Mock VS Code module globally - must be before any imports that use vscode
vi.mock('vscode', async () => {
  const mockUri = {
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
  }

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

  const mockEnv = {
    clipboard: {
      writeText: vi.fn(),
    },
  }

  return {
    Uri: mockUri,
    workspace: mockWorkspace,
    window: mockWindow,
    commands: mockCommands,
    env: mockEnv,
    ViewColumn: {
      Active: -1,
      Beside: -2,
      One: 1,
      Two: 2,
      Three: 3,
    },
    ExtensionMode: {
      Development: 1,
      Test: 2,
      Production: 3,
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    Range: vi.fn(),
    Position: vi.fn(),
    Selection: vi.fn(),
    TextDocument: vi.fn(),
    WorkspaceFolder: vi.fn(),
    ExtensionContext: vi.fn(),
  }
})

// Setup global test environment
beforeEach(() => {
  vi.clearAllMocks()
})
