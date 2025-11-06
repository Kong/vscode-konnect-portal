import * as assert from 'assert'
import * as vscode from 'vscode'

/** Test suite for Portal Preview configuration functionality */
suite('Configuration Tests', () => {
  /** Original configuration values to restore after tests */
  let originalConfig: Record<string, unknown>

  /** Configuration section name */
  const configSection = 'kong.konnect.devPortal'

  setup(async () => {
    // Store original configuration to restore later
    const config = vscode.workspace.getConfiguration(configSection)
    originalConfig = {
      autoOpenPreview: config.get('autoOpenPreview'),
      previewUpdateDelay: config.get('previewUpdateDelay'),
      readyTimeout: config.get('readyTimeout'),
      debug: config.get('debug'),
      showMDCRecommendation: config.get('showMDCRecommendation'),
      pagesDirectory: config.get('pagesDirectory'),
      snippetsDirectory: config.get('snippetsDirectory'),
    }
  })

  teardown(async () => {
    // Restore original configuration after each test
    const config = vscode.workspace.getConfiguration(configSection)
    for (const [key, value] of Object.entries(originalConfig)) {
      await config.update(key, value, vscode.ConfigurationTarget.Global)
    }
  })

  test('should have default configuration values', async () => {
    const config = vscode.workspace.getConfiguration(configSection)

    // Test default values match expected defaults
    assert.strictEqual(config.get('autoOpenPreview'), false, 'autoOpenPreview should default to false')
    assert.strictEqual(config.get('previewUpdateDelay'), 500, 'previewUpdateDelay should default to 500')
    assert.strictEqual(config.get('readyTimeout'), 5000, 'readyTimeout should default to 5000')
    assert.strictEqual(config.get('debug'), false, 'debug should default to false')
    assert.strictEqual(config.get('showMDCRecommendation'), true, 'showMDCRecommendation should default to true')
    assert.strictEqual(config.get('pagesDirectory'), 'pages', 'pagesDirectory should default to "pages"')
    assert.strictEqual(config.get('snippetsDirectory'), 'snippets', 'snippetsDirectory should default to "snippets"')
  })

  test('should allow updating boolean configuration values', async () => {
    const config = vscode.workspace.getConfiguration(configSection)

    // Test autoOpenPreview: verify default, change, verify new value
    assert.strictEqual(config.get('autoOpenPreview'), false, 'autoOpenPreview should start with default value false')
    await config.update('autoOpenPreview', true, vscode.ConfigurationTarget.Global)
    const updatedConfig1 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig1.get('autoOpenPreview'), true, 'autoOpenPreview should be updated to true')

    // Test debug: verify default, change, verify new value
    assert.strictEqual(updatedConfig1.get('debug'), false, 'debug should start with default value false')
    await config.update('debug', true, vscode.ConfigurationTarget.Global)
    const updatedConfig2 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig2.get('debug'), true, 'debug should be updated to true')

    // Test showMDCRecommendation: verify default, change, verify new value
    assert.strictEqual(updatedConfig2.get('showMDCRecommendation'), true, 'showMDCRecommendation should start with default value true')
    await config.update('showMDCRecommendation', false, vscode.ConfigurationTarget.Global)
    const updatedConfig3 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig3.get('showMDCRecommendation'), false, 'showMDCRecommendation should be updated to false')
  })

  test('should allow updating numeric configuration values', async () => {
    const config = vscode.workspace.getConfiguration(configSection)

    // Test previewUpdateDelay: verify default, change, verify new value
    assert.strictEqual(config.get('previewUpdateDelay'), 500, 'previewUpdateDelay should start with default value 500')
    await config.update('previewUpdateDelay', 1000, vscode.ConfigurationTarget.Global)
    const updatedConfig1 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig1.get('previewUpdateDelay'), 1000, 'previewUpdateDelay should be updated to 1000')

    // Test readyTimeout: verify default, change, verify new value
    assert.strictEqual(updatedConfig1.get('readyTimeout'), 5000, 'readyTimeout should start with default value 5000')
    await config.update('readyTimeout', 8000, vscode.ConfigurationTarget.Global)
    const updatedConfig2 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig2.get('readyTimeout'), 8000, 'readyTimeout should be updated to 8000')
  })

  test('should allow updating string configuration values', async () => {
    const config = vscode.workspace.getConfiguration(configSection)

    // Test pagesDirectory: verify default, change, verify new value
    assert.strictEqual(config.get('pagesDirectory'), 'pages', 'pagesDirectory should start with default value "pages"')
    await config.update('pagesDirectory', 'docs', vscode.ConfigurationTarget.Global)
    const updatedConfig1 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig1.get('pagesDirectory'), 'docs', 'pagesDirectory should be updated to "docs"')

    // Test snippetsDirectory: verify default, change, verify new value
    assert.strictEqual(updatedConfig1.get('snippetsDirectory'), 'snippets', 'snippetsDirectory should start with default value "snippets"')
    await config.update('snippetsDirectory', 'includes', vscode.ConfigurationTarget.Global)
    const updatedConfig2 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig2.get('snippetsDirectory'), 'includes', 'snippetsDirectory should be updated to "includes"')
  })

  test('should validate numeric ranges for previewUpdateDelay', async () => {
    const config = vscode.workspace.getConfiguration(configSection)

    // Test minimum value: verify default, change, verify new value
    assert.strictEqual(config.get('previewUpdateDelay'), 500, 'previewUpdateDelay should start with default value 500')
    await config.update('previewUpdateDelay', 100, vscode.ConfigurationTarget.Global)
    const updatedConfig1 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig1.get('previewUpdateDelay'), 100, 'previewUpdateDelay should accept minimum value of 100')

    // Test maximum value: verify current, change, verify new value
    assert.strictEqual(updatedConfig1.get('previewUpdateDelay'), 100, 'previewUpdateDelay should currently be 100')
    await config.update('previewUpdateDelay', 5000, vscode.ConfigurationTarget.Global)
    const updatedConfig2 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig2.get('previewUpdateDelay'), 5000, 'previewUpdateDelay should accept maximum value of 5000')
  })

  test('should validate numeric ranges for readyTimeout', async () => {
    const config = vscode.workspace.getConfiguration(configSection)

    // Test minimum value: verify default, change, verify new value
    assert.strictEqual(config.get('readyTimeout'), 5000, 'readyTimeout should start with default value 5000')
    await config.update('readyTimeout', 1000, vscode.ConfigurationTarget.Global)
    const updatedConfig1 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig1.get('readyTimeout'), 1000, 'readyTimeout should accept minimum value of 1000')

    // Test maximum value: verify current, change, verify new value
    assert.strictEqual(updatedConfig1.get('readyTimeout'), 1000, 'readyTimeout should currently be 1000')
    await config.update('readyTimeout', 15000, vscode.ConfigurationTarget.Global)
    const updatedConfig2 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig2.get('readyTimeout'), 15000, 'readyTimeout should accept maximum value of 15000')
  })

  test('should handle empty string directory configurations', async () => {
    const config = vscode.workspace.getConfiguration(configSection)

    // Test empty pagesDirectory: verify default, change, verify new value
    assert.strictEqual(config.get('pagesDirectory'), 'pages', 'pagesDirectory should start with default value "pages"')
    await config.update('pagesDirectory', '', vscode.ConfigurationTarget.Global)
    const updatedConfig1 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig1.get('pagesDirectory'), '', 'pagesDirectory should accept empty string')

    // Test empty snippetsDirectory: verify default, change, verify new value
    assert.strictEqual(updatedConfig1.get('snippetsDirectory'), 'snippets', 'snippetsDirectory should start with default value "snippets"')
    await config.update('snippetsDirectory', '', vscode.ConfigurationTarget.Global)
    const updatedConfig2 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig2.get('snippetsDirectory'), '', 'snippetsDirectory should accept empty string')
  })

  test('should handle whitespace-only directory configurations', async () => {
    const config = vscode.workspace.getConfiguration(configSection)

    // Test whitespace-only pagesDirectory: verify default, change, verify new value
    assert.strictEqual(config.get('pagesDirectory'), 'pages', 'pagesDirectory should start with default value "pages"')
    await config.update('pagesDirectory', '   ', vscode.ConfigurationTarget.Global)
    const updatedConfig1 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig1.get('pagesDirectory'), '   ', 'pagesDirectory should accept whitespace-only string')

    // Test whitespace-only snippetsDirectory: verify default, change, verify new value
    assert.strictEqual(updatedConfig1.get('snippetsDirectory'), 'snippets', 'snippetsDirectory should start with default value "snippets"')
    await config.update('snippetsDirectory', '\\t\\n', vscode.ConfigurationTarget.Global)
    const updatedConfig2 = vscode.workspace.getConfiguration(configSection)
    assert.strictEqual(updatedConfig2.get('snippetsDirectory'), '\\t\\n', 'snippetsDirectory should accept whitespace-only string')
  })

  test('should preserve configuration across extension reloads', async () => {
    const config = vscode.workspace.getConfiguration(configSection)

    // Verify starting values
    assert.strictEqual(config.get('autoOpenPreview'), false, 'autoOpenPreview should start with default value false')
    assert.strictEqual(config.get('previewUpdateDelay'), 500, 'previewUpdateDelay should start with default value 500')
    assert.strictEqual(config.get('pagesDirectory'), 'pages', 'pagesDirectory should start with default value "pages"')

    // Set custom values
    await config.update('autoOpenPreview', true, vscode.ConfigurationTarget.Global)
    await config.update('previewUpdateDelay', 750, vscode.ConfigurationTarget.Global)
    await config.update('pagesDirectory', 'my-pages', vscode.ConfigurationTarget.Global)

    // Simulate reload by getting fresh configuration
    const reloadedConfig = vscode.workspace.getConfiguration(configSection)

    // Verify values persist
    assert.strictEqual(reloadedConfig.get('autoOpenPreview'), true, 'autoOpenPreview should persist across reloads')
    assert.strictEqual(reloadedConfig.get('previewUpdateDelay'), 750, 'previewUpdateDelay should persist across reloads')
    assert.strictEqual(reloadedConfig.get('pagesDirectory'), 'my-pages', 'pagesDirectory should persist across reloads')
  })
})
