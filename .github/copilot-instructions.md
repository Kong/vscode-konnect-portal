# Project general coding standards

## General coding guidelines
- Always add relevant comments in the code
- Use single-line JSDoc style (/** ... */) for short, single-line comments in JavaScript and TypeScript files.
- Use multi-line JSDoc style for function/interface/type documentation or parameter descriptions.
- Place comments above the relevant code.
- Make minimal changes and/or refactors to code as possible between commits to keep changesets small and reviewable
- Files should be well-organized as per standard conventions in a modern VS Code extension.
- Consult official VS Code extension documentation and linked pages for best practices: https://code.visualstudio.com/api
- Understand that this project will be iterated on and improved over time, so write code that is maintainable and extensible.
- Do not use emojis in code or comments unless explicitly instructed to do so. Do not use em-dash, invisible, other non-standard characters in the codebase.

## Dependency management
- Always use pnpm as the package manager for this project, and run scripts with pnpm
- Only add dependencies and devDependencies that are absolutely necessary
- Properly organize dependencies into dependencies and devDependencies in package.json accordingly
- If you need string or URL manipulation (such as the `scule` or `ufo` packages from https://unjs.io/) or other utilities, we have a preference for packages sourced from the https://unjs.io/ ecosystem.

## Naming Conventions
- Use PascalCase for component names, interfaces, and type aliases
- Use camelCase for variables, functions, and methods
- Use ALL_CAPS for constants
- Use snake_case for JSON properties
- Non-component file names should be lowercase, and kebab-case when multiple words are used

## TypeScript Guidelines
- Use TypeScript for all new code when possible, other than the `src/webview/webview.js` file which must remain JavaScript since it is embedded in the webview HTML.
- Follow functional programming principles where possible
- Use interfaces for data structures and type definitions
- Prefer immutable data (const, readonly)
- Use optional chaining (?.) and nullish coalescing (??) operators
- TypeScript types and interfaces should typically be imported from a file located in the `types` directory
- Follow TypeScript best practices
- Prefer to utilize eslint latest version with the recommended rules for TypeScript projects
- Building the project should utilize type checking and linting
- Ensure `verbatimModuleSyntax` is respected, meaning all type imports should be separate from other imports.
- Prefer single quotes for strings in TypeScript files, except when using template literals, and never use semi-colons.
- All types and interfaces should have a TSDoc or JSDoc comment block describing their purpose
- Whenever the build command is run as part of verifying changes, first always run the typecheck command.

### Error Handling
- Use try/catch blocks for async operations
- Always log errors with contextual information

### VS Code Message Dialog Action Pattern

When implementing VS Code message dialogs (`showInformationMessage`, `showWarningMessage`, `showErrorMessage`) that require conditional logic based on user selections, always use the enum-based action pattern for consistency and type safety.

#### Rule: Use Enums for All Conditional Dialog Actions

**Don't use string literals:**
```typescript
const result = await window.showInformationMessage(
  'Message text',
  'Action 1',  // String literal - error prone
  'Action 2',
)

if (result === 'Action 1') {  // Must match exactly - fragile
  // handle action
}
```

**Do use enum constants:**
```typescript
import { MyDialogActions } from './types/ui-actions'

const result = await window.showInformationMessage(
  'Message text',
  MyDialogActions.ACTION_1,  // Enum value - type safe
  MyDialogActions.ACTION_2,
)

if (result === MyDialogActions.ACTION_1) {  // Type safe, refactor safe
  // handle action
}
```

#### When to Use:
- Any dialog with buttons that trigger different code paths
- Confirmation dialogs with Yes/No/Cancel options
- Setup workflows with multiple action choices
- Warning dialogs with remediation actions

#### When NOT to Use:
- Simple dialogs with no conditional logic (just showing information)
- Dialogs where button selection isn't used programmatically

### Logging
- Always use the debug utility function(s) to handle all logging.
- Always force-log errors, but not needed for log and warn type messages.

## Project description

### Basics

Build a modern VS Code extension using the latest version and standards that allows a user to edit a file that is MDC (.mdc, more info can be found at https://github.com/nuxt-content/mdc) or Markdown (.md) and have it render in real-time a preview of the file as they edit it. The live preview should render the Dev Portal Base URL in a webview panel in VS Code. As the user types and/or modifies the content in the MDC or Markdown file, the entire MDC or Markdown string in the editor (trimmed) should be sent to the webview.

### Configuration Options

All configuration options should be documented in the README, with proper descriptions, examples, etc.

### Extension settings
- Whenever the extension config settings are modified or added/removed, make sure you update the README accordingly.
