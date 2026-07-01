import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression coverage for a real production incident: multiple region
 * fetches running concurrently each call `executeKongctl`, and all of them
 * share the extension's single VS Code terminal (see ../terminal.ts). VS
 * Code's shell integration API is not designed for overlapping concurrent
 * executions against one terminal -- calling `executeCommand` again before a
 * prior execution finishes corrupts output correlation. This must be
 * serialized so only one terminal-backed kongctl command runs at a time,
 * regardless of how many callers invoke executeKongctl concurrently.
 */

interface FakeExecution {
  cmd: string
  read: () => AsyncIterable<string>
}

function createFakeTerminal() {
  const pendingReads = new Map<string, () => void>()
  const executions = new Map<string, FakeExecution>()
  const executeCommand = vi.fn((cmd: string): FakeExecution => {
    const readGate = new Promise<void>((resolve) => {
      pendingReads.set(cmd, resolve)
    })
    // Real terminal.shellIntegration.executeCommand() returns a single object
    // used both to read output AND as the identity correlated against later
    // in onDidEndTerminalShellExecution's `event.execution === execution`
    // check -- the fake must preserve that same identity.
    const execution: FakeExecution = {
      cmd,
      read: () => (async function* () {
        await readGate
        yield JSON.stringify({ data: [], meta: { page: { number: 1, size: 0, total: 0 } } })
      })(),
    }
    executions.set(cmd, execution)
    return execution
  })

  return {
    name: 'kongctl',
    sendText: vi.fn(),
    shellIntegration: { executeCommand },
    dispose: vi.fn(),
    _resolveRead: (cmd: string) => pendingReads.get(cmd)?.(),
    _getExecution: (cmd: string) => executions.get(cmd),
  }
}

describe('executeKongctl terminal concurrency', () => {
  let fakeTerminal: ReturnType<typeof createFakeTerminal>
  let shellExecutionEndListeners: Array<(event: { execution: FakeExecution, exitCode?: number }) => void>

  beforeEach(async () => {
    vi.resetModules()
    fakeTerminal = createFakeTerminal()
    shellExecutionEndListeners = []

    vi.doMock('vscode', () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, def: unknown) => def) })),
      },
      window: {
        showWarningMessage: vi.fn(),
        createTerminal: vi.fn(() => fakeTerminal),
        onDidCloseTerminal: vi.fn(() => ({ dispose: vi.fn() })),
        onDidEndTerminalShellExecution: vi.fn((cb: (event: { execution: FakeExecution, exitCode?: number }) => void) => {
          shellExecutionEndListeners.push(cb)
          return { dispose: vi.fn() }
        }),
      },
    }))
  })

  /**
   * Simulates the terminal finishing a command: emits its output, waits for
   * the real code's for-await loop to drain and register its
   * onDidEndTerminalShellExecution listener, then fires it.
   */
  async function completeExecution(cmd: string, exitCode = 0) {
    const execution = fakeTerminal._getExecution(cmd)
    if (!execution) {
      throw new Error(`No execution found for command: ${cmd}`)
    }
    const listenerCountBefore = shellExecutionEndListeners.length
    fakeTerminal._resolveRead(cmd)

    for (let i = 0; i < 20 && shellExecutionEndListeners.length === listenerCountBefore; i++) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    expect(shellExecutionEndListeners.length).toBeGreaterThan(listenerCountBefore)

    shellExecutionEndListeners.forEach(listener => listener({ execution, exitCode }))
  }

  it('does not start a second terminal command until the first one has fully finished', async () => {
    const { executeKongctl } = await import('./index')

    const cmdA = 'api get "https://us.api.konghq.com/v3/portals" --output json'
    const cmdB = 'api get "https://eu.api.konghq.com/v3/portals" --output json'

    const pA = executeKongctl(cmdA.split(' '))
    const pB = executeKongctl(cmdB.split(' '))

    // Let both calls run up to (and past) their first await -- enough for the
    // lock to have been acquired/queued, but not for either command to finish.
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fakeTerminal.sendText).toHaveBeenCalledTimes(1)
    expect(fakeTerminal.shellIntegration.executeCommand).toHaveBeenCalledTimes(1)
    expect(fakeTerminal.sendText).toHaveBeenCalledWith(`kongctl ${cmdA}`, true)

    // Finish the first command -- only now should the second be allowed to start
    await completeExecution(`kongctl ${cmdA}`)
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fakeTerminal.sendText).toHaveBeenCalledTimes(2)
    expect(fakeTerminal.shellIntegration.executeCommand).toHaveBeenCalledTimes(2)
    expect(fakeTerminal.sendText).toHaveBeenNthCalledWith(2, `kongctl ${cmdB}`, true)

    await completeExecution(`kongctl ${cmdB}`)

    const [resultA, resultB] = await Promise.all([pA, pB])
    expect(resultA.success).toBe(true)
    expect(resultB.success).toBe(true)
  })
})
