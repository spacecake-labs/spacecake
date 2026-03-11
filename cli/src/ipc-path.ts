/**
 * Cross-platform IPC path utility.
 *
 * On Unix (macOS/Linux): Returns the path unchanged (Unix domain socket),
 *   unless the path exceeds the OS limit for sun_path — in that case, a
 *   deterministic shorter path in os.tmpdir() is returned instead.
 * On Windows: Prepends //./pipe/ prefix (named pipe)
 *
 * Based on the xpipe library pattern.
 */

import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { extname, join } from "node:path"

// macOS limits sun_path to 104 bytes, Linux to 108 (including null terminator)
const UNIX_SOCKET_PATH_MAX = process.platform === "darwin" ? 104 : 108

/**
 * Convert a socket path to a cross-platform IPC path.
 *
 * @example
 * toIpcPath("/tmp/my.sock")
 * // Unix:    "/tmp/my.sock"
 * // Windows: "//./pipe/tmp/my.sock"
 */
export function toIpcPath(inputPath: string): string {
  if (process.platform === "win32") {
    // windows — normalize backslashes to forward slashes and strip drive letter colon
    const normalized = inputPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1")
    const cleaned = normalized.startsWith("/") ? normalized.substring(1) : normalized
    return "//./pipe/" + cleaned
  }

  // unix domain sockets have a path length limit; use a deterministic
  // hash-based path in tmpdir when the original path is too long.
  if (inputPath.length >= UNIX_SOCKET_PATH_MAX) {
    const hash = createHash("md5").update(inputPath).digest("hex").slice(0, 16)
    return join(tmpdir(), `spacecake-${hash}${extname(inputPath)}`)
  }

  return inputPath
}
