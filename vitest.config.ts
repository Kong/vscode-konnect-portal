import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'
import { resolve } from 'path'

export default mergeConfig(viteConfig, defineConfig({
  resolve: {
    alias: {
      // 'vscode' module is not available in Node.js, only in VS Code extension runtime
      // Each test file mocks only the VS Code APIs it needs using vi.mock()
      vscode: resolve(__dirname, 'tests/mocks/vscode.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/**/*.spec.ts',
    ],
    exclude: [
      './dist/**',
      './out/**',
      'node_modules',
      'src/webview/webview.js',
    ],
    deps: {
      optimizer: {
        web: {
          // https://github.com/vitest-dev/vitest/issues/4074
          exclude: ['vue'],
        },
      },
    },
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/webview/webview.js',
      ],
      reporter: ['text', 'html', 'json'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
}))
