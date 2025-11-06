# Contributing

Thank you for your interest in contributing to the Konnect Dev Portal Toolkit! This guide will help you get started with local development and testing.

## Getting Started

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
   - Right-click → "Open Preview"
   - Command Palette (`Ctrl+Shift+P`) → "Konnect Portal: Open Preview"
   - Use editor toolbar buttons

3. **Configure Extension** (if needed)
   - Command Palette → "Konnect Portal: Configure Konnect Personal Access Token (PAT)"
   - Command Palette → "Konnect Portal: Select Portal"

### Debugging Tips

- **Extension Code**: Set breakpoints in `.ts` files, use VS Code debugger
- **Webview Content**: Open Developer Tools in Extension Development Host (`Help > Toggle Developer Tools`)
- **Extension Logs**: View → Output → "Log (Extension Host)"
- **Debug Mode**: Enable `kong.konnect.devPortal.debug` setting for verbose logging

## Testing

The project includes comprehensive unit tests for all utility functions and core components. Testing is handled by [Vitest](https://vitest.dev/) for fast, reliable test execution.

### Unit Tests

Unit tests focus on individual functions and components in isolation:

```bash
# Run all unit tests
pnpm test:unit

# Run unit tests with coverage reporting
pnpm test:unit:coverage

# Run unit tests with interactive UI (great for development)
pnpm test:unit:ui
```

### Integration Tests

Integration tests verify the extension works correctly in a VS Code environment:

```bash
# Run VS Code extension integration tests
pnpm test:extension
```

These tests:
- Launch a real VS Code instance with the extension loaded
- Test end-to-end workflows and VS Code API integration
- Verify extension activation and command registration

### Writing Tests

When adding new functionality:

1. **Write unit tests first** for isolated business logic
2. **Mock external dependencies** (VS Code APIs, file system)
3. **Test error conditions** not just happy paths
4. **Use descriptive test names** that explain the scenario
5. **Follow existing patterns** in the test suite

Example test structure:
```typescript
describe('myFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle valid input correctly', () => {
    // Test implementation
  })

  it('should handle invalid input gracefully', () => {
    // Error case testing
  })
})
```

### Continuous Testing

For active development, use watch mode:

```bash
# Terminal 1: Start development build with watch mode
pnpm dev

# Terminal 2: Run tests in watch mode during development
pnpm test:unit:ui
```

The UI mode provides an excellent development experience with:
- **Live test results** as you code
- **Test filtering** and search capabilities
- **Coverage visualization**
- **Failed test debugging** with detailed output

## Code Quality

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint
pnpm lint:fix

# Unit tests
pnpm test:unit

# Unit tests with coverage
pnpm test:unit:coverage

# Full build
pnpm build

# Package
pnpm package
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

## Publishing and Releases

### Version Management

**Important**: Version updates in `package.json` are handled automatically by CI/CD workflows. Do not manually update the version number.

### Release Workflow

#### 1. Automated Releases (Recommended)

The extension is published automatically via CI/CD when:
- Changes are merged to the main branch
- CI builds and tests pass successfully
- Version is automatically bumped based on commit types (via Conventional Commits)

#### 2. Manual Release Process

If manual publishing is required, follow these steps:

**Prerequisites:**
```bash
# Ensure you have publishing permissions and vsce token configured
# Contact repository maintainers for access credentials
```

**Build and Package:**
```bash
# 1. Ensure clean state
pnpm typecheck
pnpm lint
pnpm build

# 2. Create VSIX package for testing
pnpm package
```

**Publishing:**
```bash
# For VS Code Marketplace (requires appropriate permissions)
pnpm publish
```

---

Thank you for contributing! 🚀
