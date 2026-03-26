/**
 * OSC 7 Parser for Terminal Working Directory
 *
 * Parses OSC 7 escape sequences sent by modern shells (bash, zsh, fish, etc.)
 * to communicate the current working directory to the terminal emulator.
 *
 * Format: OSC 7 ; file://[hostname]/path ST
 * Where:
 *   OSC = \x1b]
 *   ; = literal semicolon
 *   file://[hostname]/path = URI-encoded path
 *   ST = \x07 (bell) or \x1b\\ (string terminator)
 *
 * Reference:
 * - https://iterm2.com/documentation-escape-codes.html
 * - https://code.visualstudio.com/docs/terminal/shell-integration
 */

export interface Osc7Data {
  path: string
}

/**
 * Regex to match OSC 7 sequences
 * Handles both terminators: \u0007 (bell) and \u001b\\ (string terminator)
 * Captures the path portion after file://[hostname]/
 */
// eslint-disable-next-line no-control-regex
export const OSC7_RE = /\u001b\]7;file:\/\/(?:[^/]*)?(.+?)(?:\u0007|\u001b\\)/

/**
 * Parse OSC 7 sequence from terminal output
 * @param data - Raw terminal output that may contain OSC 7 sequences
 * @returns Osc7Data with path, or null if no valid sequence found
 */
export function parseOsc7(data: string): Osc7Data | null {
  const match = data.match(OSC7_RE)
  if (!match || !match[1]) {
    return null
  }

  try {
    // Captured group is the path portion after file://[hostname]/
    let path = match[1]

    // Decode URL-encoded characters (%20 → space, etc.)
    path = decodeURIComponent(path)

    // Validate that we have a reasonable path
    if (!path || path.length === 0) {
      return null
    }

    return { path }
  } catch {
    // decodeURIComponent can throw on invalid sequences
    return null
  }
}

/**
 * Fast check for the OSC 7 escape prefix — avoids running the full regex
 * on every PTY data chunk (which is the hottest path in the terminal).
 */
export const OSC7_PREFIX = "\x1b]7;"
