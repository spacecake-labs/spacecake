/**
 * Ignore patterns for spacecake.
 *
 * - WATCHER_IGNORE_PATTERNS: Files/dirs that should not trigger file watcher events
 * - EXCLUDED_ENTRIES: Entry names (files and dirs) to skip during file tree traversal (performance/stability)
 */

/**
 * Patterns for the file watcher (parcel).
 * These prevent unnecessary file events from being generated.
 * Includes common development tool directories and system files.
 */
export const WATCHER_IGNORE_PATTERNS: string[] = [
  // version control - exclude noisy/large .git subdirectories but allow
  // state-relevant files (HEAD, index, refs/) to trigger git panel updates
  "**/.git/objects/**",
  "**/.git/logs/**",
  "**/.git/hooks/**",
  "**/.git/info/**",
  "**/.git/lfs/**",
  "**/.git/worktrees/**",
  "**/.git/modules/**",
  "**/.git/COMMIT_EDITMSG",
  "**/.git/MERGE_MSG",
  "**/.git/description",
  "**/.svn/**",
  "**/.hg/**",
  "**/.jj/**",

  // Package managers & dependencies
  "**/node_modules/**",

  // Build outputs
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/target/**",

  // IDE/editor caches
  "**/.vscode/**",
  "**/.idea/**",
  "**/.zed/**",

  // System files
  "**/.DS_Store",
  "**/Thumbs.db",

  // Temporary files
  "**/*.swp",
  "**/*.swo",

  // Electron asar archives (fake fs.stat)
  "**/*.asar/**",
]

/**
 * Entry names (files and directories) that should be excluded during file tree traversal.
 * Uses simple name matching for performance during directory walk.
 * These entries either cause issues (broken symlinks), are extremely large,
 * or have no value to display in the UI.
 *
 * Aligns with VSCode and Zed exclusion patterns for consistency.
 */
export const EXCLUDED_ENTRIES = new Set([
  // Directories
  ".git",
  ".svn",
  ".hg",
  ".jj",
  "node_modules",
  ".vscode",
  ".idea",
  ".zed",
  "dist",
  "build",
  "out",
  "target",
  ".cache",
  ".pnpm-store",
  ".yarn",
  ".gradle",
  "__pycache__",
  "bower_components",
  // Files
  ".DS_Store",
  "Thumbs.db",
])
