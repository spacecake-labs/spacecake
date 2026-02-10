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
  }
})
