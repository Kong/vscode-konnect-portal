/// <reference types="vite/client" />

/**
 * Type declarations for Vite raw imports
 * Allows importing files as strings using the ?raw suffix
 */
declare module '*.html?raw' {
  const content: string
  export default content
}

declare module '*.css?raw' {
  const content: string
  export default content
}

declare module '*.js?raw' {
  const content: string
  export default content
}
