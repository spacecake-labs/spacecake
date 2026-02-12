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
export function toIpcPath(inputPath: string): string {
  if (!prefix) return inputPath
  // windows — normalize backslashes to forward slashes and strip drive letter colon
  const normalized = inputPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1")
  const cleaned = normalized.startsWith("/") ? normalized.substring(1) : normalized
  return prefix + cleaned
}
