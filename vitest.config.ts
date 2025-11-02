import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'
import { resolve } from 'path'

export default mergeConfig(viteConfig, defineConfig({
  resolve: {
    alias: {
      // Ensure vscode module can be resolved in test environment
      vscode: resolve(__dirname, 'tests/mocks/vscode.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
    exclude: [
      './dist/**',
      './out/**',
      'node_modules',
      'src/webview/**', // webview tests will be separate
    ],
    setupFiles: ['./tests/setup.ts'],
    deps: {
      optimizer: {
        web: {
          // https://github.com/vitest-dev/vitest/issues/4074
          exclude: ['vue'],
        },
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/webview/**',
        'src/types/**',
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
