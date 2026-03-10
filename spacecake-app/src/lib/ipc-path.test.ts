import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { toIpcPath } from "@/lib/ipc-path"

describe("toIpcPath", () => {
  const isWindows = process.platform === "win32"

  if (isWindows) {
    it("prepends //./pipe/ prefix on Windows", () => {
      expect(toIpcPath("/tmp/my.sock")).toBe("//./pipe/tmp/my.sock")
      expect(toIpcPath("/Users/me/.claude/spacecake.sock")).toBe(
        "//./pipe/Users/me/.claude/spacecake.sock",
      )
    })

    it("handles paths without leading slash on Windows", () => {
      expect(toIpcPath("tmp/my.sock")).toBe("//./pipe/tmp/my.sock")
    })

    it("normalizes Windows drive letter paths", () => {
      expect(toIpcPath("C:\\Users\\user\\.claude\\spacecake.sock")).toBe(
        "//./pipe/C/Users/user/.claude/spacecake.sock",
      )
    })

    it("normalizes Windows drive letter with forward slashes", () => {
      expect(toIpcPath("C:/Users/user/.claude/spacecake.sock")).toBe(
        "//./pipe/C/Users/user/.claude/spacecake.sock",
      )
    })
  } else {
    it("returns the path unchanged on Unix", () => {
      expect(toIpcPath("/tmp/my.sock")).toBe("/tmp/my.sock")
      expect(toIpcPath("/Users/me/.claude/spacecake.sock")).toBe("/Users/me/.claude/spacecake.sock")
    })

    it("shortens paths that exceed the unix socket limit", () => {
      const longPath = "/private/var/folders/xx/" + "a".repeat(80) + "/cli.sock"
      const result = toIpcPath(longPath)

      expect(result.length).toBeLessThan(104)
      expect(result).toMatch(/^.*spacecake-[0-9a-f]{16}\.sock$/)
      expect(path.dirname(result)).toBe(os.tmpdir())
    })

    it("returns a deterministic result for the same long path", () => {
      const longPath = "/private/var/folders/xx/" + "b".repeat(80) + "/cli.sock"
      expect(toIpcPath(longPath)).toBe(toIpcPath(longPath))
    })

    it("returns different results for different long paths", () => {
      const longA = "/private/var/folders/xx/" + "c".repeat(80) + "/a.sock"
      const longB = "/private/var/folders/xx/" + "d".repeat(80) + "/b.sock"
      expect(toIpcPath(longA)).not.toBe(toIpcPath(longB))
    })
  }
})
