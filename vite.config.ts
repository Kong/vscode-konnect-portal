import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'node22',
    lib: {
      entry: resolve(__dirname, 'src/extension.ts'),
      name: 'extension',
      fileName: 'extension',
      // CommonJS format for VS Code extensions
      formats: ['cjs'],
    },
    rollupOptions: {
      // Externalize dependencies that shouldn't be bundled
      external: [
        'vscode', // VS Code API should never be bundled
        /^node:/, // Node.js built-in modules with node: prefix
        'path', // Node.js built-in modules
        'fs',
        'os',
        'crypto',
        'buffer',
        'stream',
        'util',
        'events',
        'url',
        'assert',
        'child_process',
        'cluster',
        'dgram',
        'dns',
        'domain',
        'http',
        'https',
        'net',
        'punycode',
        'querystring',
        'readline',
        'repl',
        'string_decoder',
        'sys',
        'timers',
        'tls',
        'tty',
        'vm',
        'zlib',
      ],
    },
    // Generate source maps for debugging
    sourcemap: true,
    // Don't minify in development for better debugging
    minify: process.env.NODE_ENV === 'production',
    // Clear output directory
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
