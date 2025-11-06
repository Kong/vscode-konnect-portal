<!-- <p align="center">
<img src="./resources/icon.png" width="377" alt="Konnect Dev Portal Toolkit" />
</p> -->

<h1 align="center">Konnect Dev Portal Toolkit</h1>

<!-- <p align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=arashsheyda.vue-prop-konverter">
<img src="https://img.shields.io/visual-studio-marketplace/v/arashsheyda.vue-prop-konverter?color=42b883&label=VS%20Code%20Marketplace&logo=visual-studio-code" alt="VS Code Marketplace Version" />
</a>
<a href="https://marketplace.visualstudio.com/items?itemName=arashsheyda.vue-prop-konverter">
<img src="https://img.shields.io/badge/Install%20on-VS%20Code-007ACC?logo=visual-studio-code" alt="Install on VS Code" />
</a>
</p> -->

A VS Code extension that provides real-time preview functionality for MDC (Markdown Components) and Markdown files with Konnect portal integration.

---

## Features

- **Real-time Preview**: Live preview updates as you type in MDC and Markdown files
- **Konnect Integration**: Token-based authentication with Kong Konnect allows you to interact securely with Konnect APIs

## Recommended Extensions

For the best experience with MDC (Markdown Components) files, we recommend installing the **MDC - Markdown Components** extension:

- **Extension ID**: `Nuxt.mdc`
- **Marketplace Link**: [MDC - Markdown Components](https://marketplace.visualstudio.com/items?itemName=Nuxt.mdc)

This extension provides:

- Enhanced editing experience and syntax highlighting for `.mdc` files
- MDC support for component name and prop suggestions
- Editor document code folding and formatting

You can install it by:

1. Opening the Extensions panel in VS Code (`Ctrl+Shift+X` or `Cmd+Shift+X`)
2. Searching for "MDC" or using the extension ID `Nuxt.mdc`
3. Clicking "Install"

> **Note**: Portal Preview will work without the MDC extension, but you'll get a better authoring experience with it installed.

## Installation

1. Download the extension from the VS Code Marketplace
2. Install it in VS Code
3. Configure your Konnect Personal Access Token
4. Select a Dev Portal from your Konnect account
5. Open an MDC (`.mdc`) or Markdown (`.md`) file
6. Use the "Open Portal Preview" command or click the preview icon

## Configuration

The extension provides several configuration options in VS Code settings. You can access these by going to **Settings** → Search for "Portal Preview":

| Setting | Type | Default | Description | Example |
|---------|------|---------|-------------|---------|
| `kong.konnect.portal.autoOpen` | `boolean` | `false` | Automatically open a live preview when opening MDC/Markdown files | Set to `true` for automatic previews |
| `kong.konnect.portal.updateDelay` | `number` | `500` | Delay in milliseconds before updating preview after content changes (500-3000) | Use `1000` for slower updates |
| `kong.konnect.portal.readyTimeout` | `number` | `5000` | Timeout in milliseconds to wait for the portal to signal ready (3000-10000) | Increase to `8000` for slower portals |
| `kong.konnect.portal.debug` | `boolean` | `false` | Enable debug logging for troubleshooting | Set to `true` to see detailed logs in VS Code |
| `kong.konnect.portal.showMDCRecommendation` | `boolean` | `true` | Show recommendation to install MDC extension | Set to `false` to hide recommendation |
| `kong.konnect.portal.pagesDirectory` | `string` | `"pages"` | Directory relative to workspace root containing your pages (.md/.mdc files). When set, page paths will be calculated relative to this directory. Leave empty to disable path calculation. | `"pages"`, `"docs/pages"`, `"src/content/documentation"` |
| `kong.konnect.portal.snippetsDirectory` | `string` | `"snippets"` | Directory relative to workspace root containing your snippets (.md/.mdc files). When set, snippet names will be extracted from filenames. Subdirectories are not supported. Leave empty to disable snippet detection. | `"snippets"`, `"docs/snippets"`, `"src/content/snippets"` |

## Setup and Usage

### 1. Configure Konnect Token

Before using the extension, you need to configure your Konnect Personal Access Token:

1. **Create a Personal Access Token in Konnect**:
    - Log in to your Kong Konnect account
    - Go to Account Settings → Personal Access Tokens
    - Create a new token (it will automatically be scoped with your permissions)
    - Copy the token (it starts with `kpat_`)

2. **Configure the token in VS Code**:
    - Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
    - Run "Portal Preview: Configure Konnect Token"
    - Paste your Personal Access Token
    - Click OK

### 2. Select a Portal

Once your token is configured:

1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run "Portal Preview: Select Portal"
3. Choose from your available Dev Portals in Konnect
4. The selected portal will be saved for future use

> **Note**: You may select a new Dev Portal at any time by running the "Select Portal" command again.

### 3. Open Preview

There are several ways to open the live preview:

1. **Command Palette**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and type "Open Portal Preview"
2. **Editor Menu**: Right-click in a MDC/Markdown file and select "Open Portal Preview"
3. **Toolbar Button**: Click the preview icon in the editor toolbar when viewing MDC/Markdown files

### 4. Live Preview

Once configured:

1. Open an MDC (.mdc) or Markdown (.md) file
2. Open the preview panel using any of the methods above
3. Start editing your file - the preview will update automatically

## Commands

The extension provides the following commands (accessible via Command Palette):

| Command | Description |
|---------|-------------|
| `Portal Preview: Open Portal Preview` | Opens the preview panel for the current MDC/Markdown file |
| `Portal Preview: Refresh Portal Preview` | Refreshes the preview panel content |
| `Portal Preview: Configure Konnect Token` | Set up your Konnect Personal Access Token |
| `Portal Preview: Select Portal` | Choose a portal from your Konnect account |
| `Portal Preview: Clear Konnect Credentials` | Remove stored token and portal selection |

## File Support

The extension supports the following file types:

- **Markdown**: `.md` files
- **MDC (Markdown Components)**: `.mdc` files

### File Organization

For optimal portal preview experience:

**Pages:**
- **Organize files** in a dedicated pages directory (e.g., `pages/`)
- **Configure** the `kong.konnect.portal.pagesDirectory` setting to match your structure
- **Use subdirectories** to organize content hierarchically (e.g., `pages/getting-started/overview.md` → `/getting-started/overview`)

**Snippets:**
- **Organize files** in a dedicated snippets directory (e.g., `snippets/`)
- **Configure** the `kong.konnect.portal.snippetsDirectory` setting to match your structure
- **Use flat structure** - subdirectories are not supported (files must be in the root of the snippets directory)
- **File names become snippet names** (e.g., `snippets/api-example.md` → snippet name: `api-example`)

## Troubleshooting

### "No portal selected" or Token Issues

If you see configuration warnings:

1. **Configure Konnect Token**: Run "Portal Preview: Configure Konnect Token"
2. **Select Portal**: Run "Portal Preview: Select Portal"
3. **Update Token**: If your token expired, run "Portal Preview: Configure Konnect Token" again

### Token Format Errors

Ensure your Personal Access Token:
- Starts with `kpat_`
- Is copied completely from Konnect
- Has the necessary permissions for portal access

### Preview not updating

If the preview isn't updating when you edit files:

1. Verify your portal selection is valid
2. Check your network connection to Konnect
3. Try refreshing the preview panel
4. Enable debug mode to see detailed logs

### Extension not activating

The extension only activates when:

- Opening MDC (.mdc) files
- Opening Markdown (.md) files
- Running portal preview commands

## Pages vs Snippets

This extension supports two distinct types of content for your Kong Dev Portal:

### Pages
Pages are full portal documents that represent routes in your portal navigation.

**Configuration:**
- Set `kong.konnect.portal.pagesDirectory` to your pages folder (e.g., `"pages"`, `"docs/pages"`)
- Supports nested subdirectories for hierarchical organization

**Path Calculation:**
- File: `pages/getting-started/overview.md` → Portal Path: `/getting-started/overview`
- File: `pages/home.md` or `pages/home.mdc` → Portal Path: `/` (special home page handling)

### Snippets
Snippets are reusable content blocks that can be embedded in pages or other snippets.

**Configuration:**
- Set `kong.konnect.portal.snippetsDirectory` to your snippets folder (e.g., `"snippets"`, `"docs/snippets"`)
- **Flat structure only** - subdirectories are not supported and will show an error

**Important:** Files in snippet subdirectories (e.g., `snippets/category/example.md`) will trigger an error and prevent preview functionality. Move such files to the root of your snippets directory.

### Example Workspace Structure

```
dev-portal-project/
├── pages/                          # Configure: kong.konnect.portal.pagesDirectory = "pages"
│   ├── home.md                     # → Portal Path: "/"
│   ├── getting-started.md          # → Portal Path: "/getting-started"
│   └── getting-started/
│       ├── overview.md             # → Portal Path: "/getting-started/overview"
│       └── installation.md         # → Portal Path: "/getting-started/installation"
└── snippets/                       # Configure: kong.konnect.portal.snippetsDirectory = "snippets"
    ├── api-example.md              # → Snippet Name: "api-example"
    ├── code-samples.md             # → Snippet Name: "code-samples"
    └── troubleshooting.md          # → Snippet Name: "troubleshooting"
```

## Security

- **Token Storage**: Your Konnect Personal Access Token is stored securely using VS Code's SecretStorage API
- **No Plain Text**: Tokens are never stored in plain text configuration files
- **Automatic Cleanup**: Tokens can be cleared using the "Clear Credentials" command
- **Secure Communication**: All API communication uses HTTPS

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/Kong/vscode-konnect-portal.git
cd vscode-konnect-portal

# Install dependencies
pnpm install

# Build the extension
pnpm build

# Watch for changes (development)
pnpm watch
```

#### Build Commands Explained

The extension uses multiple build processes due to different runtime requirements:

- **`pnpm build`** - Complete production build (runs all build steps automatically)
- **`pnpm build:webview`** - Compiles `src/webview/webview.ts` → `src/webview/webview.js` (embedded in webview HTML)
- **`pnpm build:extension-tests`** - Compiles extension test files to CommonJS format for VS Code test runner

### Testing

```bash
# Run linting
pnpm lint

# Run unit tests
pnpm test:unit

# Run unit tests with coverage
pnpm test:unit:coverage

# Run unit tests with UI (interactive)
pnpm test:unit:ui

# Run integration tests
pnpm test:extension

# Package extension
pnpm package
```

> **Note**: For detailed testing instructions and development workflows, see the [Contributing Guide](CONTRIBUTING.md).

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for detailed instructions.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have feature requests, please file them in the GitHub repository issues section.
