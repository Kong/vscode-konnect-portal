<h1 align="center">Konnect Dev Portal Toolkit</h1>

<p align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=konghq.vscode-konnect-dev-portal-toolkit">
<img src="https://img.shields.io/badge/Install%20on-VS%20Code-007ACC?logo=visual-studio-code" alt="Install on VS Code" />
</a>
</p>

A VS Code extension with a live preview for MDC and Markdown files, connected to a Konnect portal.

## Features

- Live preview that updates as you type in MDC and Markdown files
- Property, layout, and snippet suggestions in page front matter, with `layout` validation
- Token-based authentication with Kong Konnect
- Integration with the [`kongctl` CLI](https://github.com/Kong/kongctl) for portal management

## Setup and usage

### 1. Configure the directory structure

The extension reads pages and snippets from two directories in your workspace. The defaults are `pages/` and `snippets/`.

Pages support subdirectories. Snippets do not: keep every snippet file in the root of `snippets/`. The file name is the snippet name, so `snippets/api-example.md` has the name `api-example`.

If your files live in other folders, set both directories in VS Code settings:

1. Open Settings (`Cmd+,`).
2. Set `kong.konnect.devPortal.pagesDirectory` to your pages folder.
3. Set `kong.konnect.devPortal.snippetsDirectory` to your snippets folder.
4. Use paths relative to the workspace root, for example `docs/pages`.

Files in snippet subdirectories cause errors. Move them to the root of `snippets/`.

### 2. Configure the Konnect Personal Access Token

Create a Personal Access Token (PAT) in Konnect:

1. Log in to Kong Konnect.
2. Go to Account Settings, then Personal Access Tokens.
3. Create a token and copy it. The token starts with `kpat_`.

Store the token in VS Code:

1. Open the Command Palette (`Cmd+Shift+P`).
2. Run "Konnect Portal: Configure Konnect Personal Access Token (PAT)".
3. Paste the token and click OK.

### 3. Select a portal

1. Open the Command Palette (`Cmd+Shift+P`).
2. Run "Konnect Portal: Select Portal".
3. Choose a Dev Portal. The extension saves the selection.

Run the command again at any time to select another portal.

### 4. Open the preview

Open the preview for the active file in one of these ways:

- Command Palette: run "Open Portal Preview".
- Editor menu: right-click in an MDC or Markdown file and select "Open Portal Preview".
- Toolbar: click the preview icon in the editor toolbar.

### 5. Edit with the live preview

Open an `.mdc` or `.md` file, open the preview, and edit. The preview updates as you type.

## Recommended extension

Install the Comark extension (`Nuxt.mdc`) for syntax highlighting and component suggestions in `.mdc` files. Search for "Comark" in the Extensions panel and click Install. The preview works without it.

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `kong.konnect.devPortal.autoOpenPreview` | `boolean` | `false` | Open the preview when an MDC or Markdown file opens |
| `kong.konnect.devPortal.previewUpdateDelay` | `number` | `500` | Delay in milliseconds before the preview and validation update (500-3000) |
| `kong.konnect.devPortal.readyTimeout` | `number` | `8000` | Wait time in milliseconds for the portal ready signal (3000-10000) |
| `kong.konnect.devPortal.debug` | `boolean` | `false` | Write debug logs |
| `kong.konnect.devPortal.showMDCRecommendation` | `boolean` | `true` | Recommend the MDC extension on `.mdc` files |
| `kong.konnect.devPortal.pagesDirectory` | `string` | `"pages"` | Pages folder, relative to the workspace root. Empty disables path calculation. |
| `kong.konnect.devPortal.snippetsDirectory` | `string` | `"snippets"` | Snippets folder, relative to the workspace root. Empty disables snippet detection. Subdirectories are not supported. |

## Commands

| Command | Description |
|---------|-------------|
| `Konnect Portal: Open Portal Preview` | Opens the preview panel for the current file |
| `Konnect Portal: Refresh Portal Preview` | Refreshes the preview panel content |
| `Konnect Portal: Configure Konnect Personal Access Token (PAT)` | Set up your Konnect Personal Access Token |
| `Konnect Portal: Select Portal` | Choose a portal from your Konnect account |
| `Konnect Portal: Delete Access Token` | Remove the stored token and portal selection |

## File support

The extension previews `.md` and `.mdc` files.

## Front matter autocompletion and validation

### Property suggestions

- Typing in the front matter block suggests `title`, `description`, `tagline`, `image`, `layout`, and `layout-options`.
- Properties already in the block are not suggested again.
- `layout-options` opens child properties: `sidebar-left`, `sidebar-right`, and `header`.

### Value suggestions

- `layout` suggests the layouts `guide`, `reference`, `wide`, `center`, and `custom`.
- `layout-options` children suggest the snippet names from your selected portal.

### Validation

- An unrecognized `layout` value shows a warning in the Problems panel with the valid values.
- Warnings update after the delay set by `kong.konnect.devPortal.previewUpdateDelay`.
- Warnings do not block saving. Unrecognized properties are never flagged.

Front matter features require a selected portal. They apply to documents with a closed `---` block at the top. Documents in the snippets directory are excluded, because snippets carry their own front matter. Front matter owned by MDC components, such as a `::snippet` block, is also excluded. Plain Markdown files that use front matter for other purposes, for example Jekyll `layout` values, still receive the suggestions and warnings.

## Pages and snippets

Pages are portal documents with routes in the portal navigation. Snippets are reusable blocks that pages and other snippets embed.

Page paths map from the file path under `pagesDirectory`:

| File | Portal path |
|------|-------------|
| `pages/home.md` | `/` |
| `pages/getting-started.md` | `/getting-started` |
| `pages/getting-started/overview.md` | `/getting-started/overview` |

Snippet names map from the file name under `snippetsDirectory`:

| File | Snippet name |
|------|--------------|
| `snippets/api-example.md` | `api-example` |

### Example workspace structure

```
dev-portal-project/
├── pages/                          # kong.konnect.devPortal.pagesDirectory = "pages"
│   ├── home.md                     # Portal path: "/"
│   ├── getting-started.md          # Portal path: "/getting-started"
│   └── getting-started/
│       ├── overview.md             # Portal path: "/getting-started/overview"
│       └── installation.md         # Portal path: "/getting-started/installation"
└── snippets/                       # kong.konnect.devPortal.snippetsDirectory = "snippets"
    ├── api-example.md              # Snippet name: "api-example"
    ├── code-samples.md             # Snippet name: "code-samples"
    └── troubleshooting.md          # Snippet name: "troubleshooting"
```

## Troubleshooting

### Token problems

1. Run "Konnect Portal: Configure Konnect Personal Access Token (PAT)".
2. Run "Konnect Portal: Select Portal".
3. If the token expired, configure it again.

Make sure that the token starts with `kpat_`, is complete, and has the portal permissions.

### Preview not updating

1. Make sure that the portal selection is valid.
2. Make sure that you can reach Konnect from your network.
3. Refresh the preview panel.
4. Set `kong.konnect.devPortal.debug` to `true` and read the logs.

### Extension not activating

The extension activates when you open an `.mdc` or `.md` file, or run a preview command.

## Security

- VS Code SecretStorage holds the token. No configuration file contains it in plain text.
- The "Delete Access Token" command clears the token and the portal selection.
- All API communication uses HTTPS.

## Development

### Build from source

```bash
git clone https://github.com/Kong/vscode-konnect-portal.git
cd vscode-konnect-portal
pnpm install
pnpm build
pnpm watch   # watch mode for development
```

Build commands:

- `pnpm build` runs the complete production build.
- `pnpm build:webview` compiles `src/webview/webview.ts` to `src/webview/webview.js`. You do not need to run it separately.
- `pnpm build:extension-tests` compiles the extension tests for the VS Code test runner.

### Local API override

When you develop the extension from source, you can point all Konnect API traffic at another environment. The traffic covers the portal list, snippets, region discovery, kongctl commands, and the preview. Set the `KONNECT_API_DOMAIN` environment variable:

1. Copy `.env.local.example` to `.env.local`.
2. Set `KONNECT_API_DOMAIN` in `.env.local`.

The value is the domain of the target environment. The extension builds regional hosts from it as `{region}.api.{domain}`. The production domain is `konghq.com`, and it is also the default:

```dotenv
KONNECT_API_DOMAIN=konghq.com
```

The "Run Extension" debug target loads `.env.local` at start. `.env.local` is gitignored, so local values stay out of the repository.

Rules:

- The variable is optional. Without it, all traffic uses the production API.
- The value must be `konghq.<tld>`, for example `konghq.com`. Subdomains and other domains are ignored. The extension then uses the production API.
- The override works only when the extension runs unpackaged from source. Installed builds always use the production API.
- kongctl commands follow the same domain. A recent kongctl build is required for this.
- You can also set the variable in your shell, or in the `env` block of a launch configuration.

### Testing

```bash
pnpm lint
pnpm test:unit
pnpm test:unit:coverage
pnpm test:unit:ui
pnpm test:extension
pnpm package
```

See the [Contributing Guide](CONTRIBUTING.md) for testing details and workflows.

## Agentic reviewer

See the reference for the `/muthur` agentic reviewer in [docs/agentic-reviewer.md](./docs/agentic-reviewer.md).

## Contributing

See the [Contributing Guide](CONTRIBUTING.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Support

File issues and feature requests in the GitHub repository issue tracker.
