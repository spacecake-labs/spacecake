/**
 * Cross-platform IPC path utility.
 *
 * On Unix (macOS/Linux): Returns the path unchanged (Unix domain socket)
 * On Windows: Prepends //./pipe/ prefix (named pipe)
 *
 * Based on the xpipe library pattern.
 */

const prefix = process.platform === "win32" ? "//./pipe/" : ""

/**
 * Convert a socket path to a cross-platform IPC path.
 *
 * @example
 * toIpcPath("/tmp/my.sock")
 * // Unix:    "/tmp/my.sock"
 * // Windows: "//./pipe/tmp/my.sock"
 */
export function toIpcPath(path: string): string {
  if (prefix && path.startsWith("/")) {
    return prefix + path.substring(1)
  }
  return prefix + path
}
