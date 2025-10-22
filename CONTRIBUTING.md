# Contributing

Thank you for your interest in contributing to the Konnect Dev Portal Toolkit! This guide will help you get started with local development and testing.

## Getting Started

### Prerequisites

- **Node.js**: Version 22.0.0 or higher
- **pnpm**: Version 10.4.0 or higher
- **VS Code**: Version 1.85.0 or higher

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/vscode-konnect-portal.git
cd vscode-konnect-portal
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build the Extension

```bash
# Build for development
pnpm build

# Or watch mode for continuous development
pnpm dev
```

## Development Workflow

### Run and Debug

The extension includes pre-configured debug setups in `.vscode/launch.json`:

1. **Launch Extension Development Host**
   - Open the project in VS Code
   - Press `F5` or go to Run and Debug view (`Ctrl+Shift+D`)
   - Select **"Run Extension"** configuration
   - Click the green play button

   This will:
   - Automatically run `pnpm build` (pre-launch task)
   - Open a new VS Code window with your extension loaded
   - Enable debugging with breakpoints in TypeScript files (if present)

2. **Development with Watch Mode** (Recommended)
   ```bash
   # Terminal 1: Start watch mode for continuous builds
   pnpm dev

   # Then use F5 to launch Extension Development Host
   # Press Ctrl+R in the Extension Development Host to reload after changes
   ```

3. **Run Tests**
   - Select **"Extension Tests"** configuration in Run and Debug
   - This runs the test suite with debugging enabled

### Testing Your Changes

1. **Create Test Content**
   ```markdown
   # Test Document

   This is test content for the preview.

   ## Features
   - Live preview updates
   - Konnect portal integration
   ```

2. **Test Commands**
   - Right-click → "Open Portal Preview"
   - Command Palette (`Ctrl+Shift+P`) → "Portal Preview: Open Preview"
   - Use editor toolbar buttons

3. **Configure Extension** (if needed)
   - Command Palette → "Portal Preview: Configure Konnect Token"
   - Command Palette → "Portal Preview: Select Portal"

### Debugging Tips

- **Extension Code**: Set breakpoints in `.ts` files, use VS Code debugger
- **Webview Content**: Open Developer Tools in Extension Development Host (`Help > Toggle Developer Tools`)
- **Extension Logs**: View → Output → "Log (Extension Host)"
- **Debug Mode**: Enable `portalPreview.debug` setting for verbose logging

## Code Quality

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint
pnpm lint:fix

# Full build
pnpm build
```

## Making Changes

### Development Guidelines

- **TypeScript**: Use TypeScript for all code
- **Code Style**: No semicolons, single quotes, trailing commas
- **Imports**: Use `verbatimModuleSyntax` (separate type imports)
- **Comments**: Add JSDoc comments for public APIs
- **Testing**: Test thoroughly in Extension Development Host

### Adding Features

1. **Plan Your Changes**
   - Check existing issues first
   - Create an issue for major features
   - Follow existing patterns

2. **Common Tasks**

   **Adding Configuration Options:**
   ```typescript
   // 1. Update package.json contributes.configuration.properties
   // 2. Add type to src/types/index.ts
   // 3. Handle in getConfiguration() function
   ```

   **Modifying Webview:**
   ```typescript
   // 1. Update generateWebviewHTML() in src/utils/webview.ts
   // 2. Modify CSS in src/webview/webview.css
   // 3. Update JS in src/webview/webview.js
   ```

### Committing Changes

[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

This repo uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

[Commitizen](https://github.com/commitizen/cz-cli) and [Commitlint](https://github.com/conventional-changelog/commitlint) are used to help build and enforce commit messages.

It is **highly recommended** to use the following command in order to create your commits:

```sh
pnpm commit
```

This will trigger the Commitizen interactive prompt for building your commit message.

#### Enforcing Commit Format

[Lefthook](https://github.com/evilmartians/lefthook) is used to manage Git Hooks within the repo.

- A `commit-msg` hook is automatically setup that enforces commit message stands with `commitlint`, see [`lefthook.ymal`](./lefthook.yaml)
- A `pre-push` hook is used that runs `eslint` before allowing you to push your changes to the repository

Additionally, CI will use `commitlint` to validate the commits associated with a PR in the `Lint and Validate` job.

### Approvals

- All pull requests require review and approval from authorized team members.
- Automated approvals through workflows are strictly prohibited.
  - There is an exception for automated pull request approvals originating from generated dependency updates that satisfy status checks and other requirements.
- Protected branches require at least one approval from code owners.
- All status checks must pass before a pull request may be merged.

## Troubleshooting

**Extension Not Loading**: Check Extension Development Host console for errors
**Preview Not Working**: Check webview Developer Tools and verify Konnect token/portal setup
**Build Issues**: Run `pnpm typecheck` and `pnpm lint` to identify problems

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/Kong/vscode-konnect-portal/issues)
- **Documentation**: [README.md](README.md)

---

Thank you for contributing! 🚀
