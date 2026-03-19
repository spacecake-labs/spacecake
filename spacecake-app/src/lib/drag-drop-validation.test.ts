import { describe, expect, it } from "vitest"

import { canDropItem } from "@/lib/drag-drop-validation"
import type { FileTree } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"

const tree: FileTree = [
  {
    kind: "folder",
    name: "src",
    path: AbsolutePath("/home/user/projects/src"),
    cid: "",
    children: [
      {
        kind: "file",
        name: "index.ts",
        path: AbsolutePath("/home/user/projects/src/index.ts"),
        cid: "abc",
        fileType: "typescript",
        etag: { mtime: new Date(), size: 100 },
      },
      {
        kind: "folder",
        name: "utils",
        path: AbsolutePath("/home/user/projects/src/utils"),
        cid: "",
        children: [],
        isExpanded: false,
        resolved: true,
      },
    ],
    isExpanded: true,
    resolved: true,
  },
  {
    kind: "folder",
    name: "docs",
    path: AbsolutePath("/home/user/projects/docs"),
    cid: "",
    children: [],
    isExpanded: false,
    resolved: true,
  },
  {
    kind: "folder",
    name: ".spacecake",
    path: AbsolutePath("/home/user/projects/.spacecake"),
    cid: "",
    children: [],
    isExpanded: false,
    resolved: true,
    isSystemFolder: true,
  },
  {
    kind: "file",
    name: "readme.md",
    path: AbsolutePath("/home/user/projects/readme.md"),
    cid: "def",
    fileType: "markdown",
    etag: { mtime: new Date(), size: 200 },
  },
]

describe("canDropItem", () => {
  it("allows dropping a file into a different folder", () => {
    const result = canDropItem(
      AbsolutePath("/home/user/projects/src/index.ts"),
      "file",
      AbsolutePath("/home/user/projects/docs"),
      tree,
    )
    expect(result).toEqual({ valid: true })
  })

  it("rejects dropping onto itself", () => {
    const result = canDropItem(
      AbsolutePath("/home/user/projects/src"),
      "folder",
      AbsolutePath("/home/user/projects/src"),
      tree,
    )
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("itself")
  })

  it("rejects dropping a folder into its own descendant", () => {
    const result = canDropItem(
      AbsolutePath("/home/user/projects/src"),
      "folder",
      AbsolutePath("/home/user/projects/src/utils"),
      tree,
    )
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("descendant")
  })

  it("rejects no-op move (same parent)", () => {
    const result = canDropItem(
      AbsolutePath("/home/user/projects/src/index.ts"),
      "file",
      AbsolutePath("/home/user/projects/src"),
      tree,
    )
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("already in this folder")
  })

  it("rejects dropping into a system folder", () => {
    const result = canDropItem(
      AbsolutePath("/home/user/projects/readme.md"),
      "file",
      AbsolutePath("/home/user/projects/.spacecake"),
      tree,
    )
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("system folder")
  })

  it("rejects dropping when name conflicts in target", () => {
    // add a file named "index.ts" to docs
    const treeWithConflict: FileTree = [
      ...tree.slice(0, 1),
      {
        kind: "folder",
        name: "docs",
        path: AbsolutePath("/home/user/projects/docs"),
        cid: "",
        children: [
          {
            kind: "file",
            name: "index.ts",
            path: AbsolutePath("/home/user/projects/docs/index.ts"),
            cid: "xyz",
            fileType: "typescript",
            etag: { mtime: new Date(), size: 50 },
          },
        ],
        isExpanded: false,
        resolved: true,
      },
      ...tree.slice(2),
    ]

    const result = canDropItem(
      AbsolutePath("/home/user/projects/src/index.ts"),
      "file",
      AbsolutePath("/home/user/projects/docs"),
      treeWithConflict,
    )
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("already exists")
  })

  it("allows dropping a folder into a different folder", () => {
    const result = canDropItem(
      AbsolutePath("/home/user/projects/src/utils"),
      "folder",
      AbsolutePath("/home/user/projects/docs"),
      tree,
    )
    expect(result).toEqual({ valid: true })
  })
})
