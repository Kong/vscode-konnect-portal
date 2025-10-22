import eslintKongUiConfig from '@kong/eslint-config-kong-ui'

export default [
  ...eslintKongUiConfig,
  {
    ignores: [
      'dist/**/*',
      'out/**/*',
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
