// Minimal mock file to provide import resolution for 'vscode' in tests
// The actual mocking is done globally in tests/setup.ts via vi.mock('vscode')
// This file exists only because 'vscode' is not available in Node.js runtime

// Export empty object - the real exports come from the global mock
export {}
