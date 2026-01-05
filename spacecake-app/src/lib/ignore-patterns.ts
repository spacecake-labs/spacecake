/**
 * https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/ignorePatterns.ts
 */

/**
 * Common ignore patterns used across multiple tools for basic exclusions.
 * These are the most commonly ignored directories in development projects.
 */
export const COMMON_IGNORE_PATTERNS: string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/bower_components/**",
  "**/.svn/**",
  "**/.hg/**",
]

/**
 * Binary file extension patterns that are typically excluded from text processing.
 */
export const BINARY_FILE_PATTERNS: string[] = [
  "**/*.bin",
  "**/*.exe",
  "**/*.dll",
  "**/*.so",
  "**/*.dylib",
  "**/*.class",
  "**/*.jar",
  "**/*.war",
  "**/*.zip",
  "**/*.tar",
  "**/*.gz",
  "**/*.bz2",
  "**/*.rar",
  "**/*.7z",
  "**/*.doc",
  "**/*.docx",
  "**/*.xls",
  "**/*.xlsx",
  "**/*.ppt",
  "**/*.pptx",
  "**/*.odt",
  "**/*.ods",
  "**/*.odp",
]

/**
 * Media file patterns that require special handling in tools like read-many-files.
 * These files can be processed as inlineData when explicitly requested.
 */
export const MEDIA_FILE_PATTERNS: string[] = [
  "**/*.pdf",
  "**/*.png",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.gif",
  "**/*.webp",
  "**/*.bmp",
  "**/*.svg",
]

/**
 * Common directory patterns that are typically ignored in development projects.
 */
export const COMMON_DIRECTORY_EXCLUDES: string[] = [
  "**/.vscode/**",
  "**/.idea/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.pnpm-store/**",
  // Package managers & Caches
  "**/.yarn/cache/**",
  "**/.yarn/unplugged/**",
  "**/.gradle/**",
  "**/.cache/**",
  "**/tmp/**",
  // Compiled output
  "**/target/**", // Rust, Maven
  "**/out/**", // Common build output
]

/**
 * Python-specific patterns.
 */
export const PYTHON_EXCLUDES: string[] = ["**/*.pyc", "**/*.pyo"]

/**
 * System and environment file patterns.
 */
export const SYSTEM_FILE_EXCLUDES: string[] = ["**/.DS_Store", "**/.env"]

// Stat information is fake for `asar` archives:
// https://www.electronjs.org/docs/latest/tutorial/asar-archives#fake-stat-information-of-fsstat
export const ELECTRON_EXCLUDES: string[] = ["**/*.asar/**"]

/**
 * Comprehensive file exclusion patterns combining all common ignore patterns.
 * These patterns are compatible with glob ignore patterns.
 * Note: Media files (PDF, images) are not excluded here as they need special handling in read-many-files.
 */
export const DEFAULT_FILE_EXCLUDES: string[] = [
  ...COMMON_IGNORE_PATTERNS,
  ...COMMON_DIRECTORY_EXCLUDES,
  ...BINARY_FILE_PATTERNS,
  ...PYTHON_EXCLUDES,
  ...SYSTEM_FILE_EXCLUDES,
  ...ELECTRON_EXCLUDES,
]
