import { describe, expect, it } from "vitest"

import { resolveCreationParentPath } from "@/lib/utils"

describe("resolveCreationParentPath", () => {
  it("returns the folder path when last-clicked is a folder", () => {
    expect(
      resolveCreationParentPath(
        { path: "/home/user/projects/src", kind: "folder" },
        "/home/user/projects",
      ),
    ).toBe("/home/user/projects/src")
  })

  it("returns parent directory when last-clicked is a file", () => {
    expect(
      resolveCreationParentPath(
        { path: "/home/user/projects/src/index.ts", kind: "file" },
        "/home/user/projects",
      ),
    ).toBe("/home/user/projects/src")
  })

  it("returns workspace root when nothing has been clicked", () => {
    expect(resolveCreationParentPath(null, "/home/user/projects")).toBe("/home/user/projects")
  })

  it("returns workspace root when file is at workspace root", () => {
    expect(
      resolveCreationParentPath(
        { path: "/home/user/projects/readme.md", kind: "file" },
        "/home/user/projects",
      ),
    ).toBe("/home/user/projects")
  })

  it("falls back to workspace root when folder is outside workspace", () => {
    expect(
      resolveCreationParentPath({ path: "/other/path/src", kind: "folder" }, "/home/user/projects"),
    ).toBe("/home/user/projects")
  })

  it("falls back to workspace root when file is outside workspace", () => {
    expect(
      resolveCreationParentPath(
        { path: "/other/path/file.ts", kind: "file" },
        "/home/user/projects",
      ),
    ).toBe("/home/user/projects")
  })

  it("handles deeply nested files", () => {
    expect(
      resolveCreationParentPath(
        { path: "/home/user/projects/src/components/ui/button.tsx", kind: "file" },
        "/home/user/projects",
      ),
    ).toBe("/home/user/projects/src/components/ui")
  })
})
