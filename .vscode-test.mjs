import { defineConfig } from '@vscode/test-cli'
import { tmpdir } from 'os'
import { join } from 'path'

/** Short user-data-dir so the IPC socket path stays under the 103-char Unix socket limit.
 *  Workspace paths like .worktrees/<long-branch-name> exceed the limit otherwise. */
const userDataDir = join(tmpdir(), 'vscode-konnect-portal-tests')

export default defineConfig({
  files: 'out/test/**/*.test.cjs',
  launchArgs: ['--user-data-dir', userDataDir],
})
