import eslintKongUiConfig from '@kong/eslint-config-kong-ui'

export default [
  ...eslintKongUiConfig,
  {
    ignores: [
      'dist/**/*',
      'out/**/*',
      '.vscode/**/*',
      '.vscode-test/**/*',
      'coverage/**/*',
      'node_modules/**/*',
      // Ignore generated `src/webview/webview.js`
      'src/webview/webview.js',
    ],
  },
  {
    files: ['src/webview/**/*.js'],
    languageOptions: {
      globals: {
        acquireVsCodeApi: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Date: 'readonly',
      },
    },
  },
]
