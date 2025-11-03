import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/test/suite/extension.test.ts'),
      formats: ['cjs'],
      fileName: (format, entryName) => `${entryName}.cjs`,
    },
    outDir: 'out/test/suite',
    emptyOutDir: true,
    rollupOptions: {
      external: ['vscode', 'mocha', 'assert', 'path', '@vscode/test-electron', 'glob'],
      output: {
        format: 'cjs',
      },
    },
  },
})
