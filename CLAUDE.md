# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Primary Reference

**See `AGENTS.md`** for comprehensive coding standards, architecture, and development guidelines. All AI coding assistants should follow those standards.

## Claude Code Specifics

### Quick Reference Commands

```bash
# Before making changes
pnpm typecheck

# Development
pnpm dev                          # Watch mode
pnpm build                        # Production build

# Testing
pnpm test:unit                    # Unit tests
pnpm test:unit path/to/file.spec.ts  # Single test file
pnpm build && pnpm test:extension # Integration tests

# Quality
pnpm lint
pnpm lint:fix
```

### Key Patterns to Remember

1. **Webview Code**: Never edit `src/webview/webview.js` directly - always edit `src/webview/webview.ts` and run `pnpm build:webview`

2. **Document References**: When responding to user actions (like refresh), always check `window.activeTextEditor?.document` first, then fall back to `panelState.currentDocument`

3. **Message Protocol**: Extension and webview communicate via message passing - see Architecture section in AGENTS.md for message types

4. **Testing Limitations**: Webview code cannot be unit tested - manual testing in VS Code debugger is required

### Tool Usage Notes

- Use **Task tool with Explore agent** when investigating codebase structure or understanding cross-file relationships
- Use **Read tool** for reading specific files you already know about
- Use **Grep tool** for searching code when you know what to search for
- Always run `pnpm typecheck` before suggesting `pnpm build`

### Architecture Quick Map

```
src/
├── extension.ts           # Entry point, command registration
├── preview-provider.ts    # Webview panel lifecycle manager
├── storage.ts            # Secure token storage
├── portal-selection.ts   # Portal selection workflow
├── webview/
│   ├── webview.ts        # Webview logic (TypeScript source)
│   ├── webview.js        # Build artifact (DO NOT EDIT)
│   ├── webview.html      # Webview template
│   └── webview.css       # Webview styles
├── utils/
│   ├── page-path.ts      # Path calculation logic
│   ├── webview.ts        # HTML generation utilities
│   └── debug.ts          # Logging utilities
├── konnect/              # Konnect API integration
└── types/                # TypeScript type definitions
```

### Testing Strategy

- **Extension logic**: Unit tests with Vitest (good coverage possible) `pnpm test:unit`
- **Integration**: VS Code test runner (`src/test/suite/`) `pnpm test:extension`

When adding tests, focus on extension-side logic. Do not create superficial integration tests that only test message passing - those provide false confidence without real validation.
