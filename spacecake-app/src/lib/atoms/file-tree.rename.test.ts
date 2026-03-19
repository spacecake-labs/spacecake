import { createStore } from "jotai"
import { afterEach, describe, expect, it } from "vitest"

import { expandedFoldersAtom, fileTreeAtom, openedFilesAtom } from "@/lib/atoms/atoms"
import {
  clearFileStateAtoms,
  getOrCreateFileStateAtom,
  hasFileStateAtom,
  renameInTreeAtom,
  sortedFileTreeAtom,
} from "@/lib/atoms/file-tree"
import { findItemInTree } from "@/lib/file-event-handler"
import type { File, FileTree, Folder } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"

// --- helpers ---

const file = (path: string): File => ({
  kind: "file",
  name: path.split("/").pop()!,
  path: AbsolutePath(path),
  cid: "abc",
  etag: { mtime: new Date(), size: 100 },
  fileType: "markdown",
})

const folder = (path: string, children: FileTree = []): Folder => ({
  kind: "folder",
  name: path.split("/").pop()!,
  path: AbsolutePath(path),
  cid: "",
  children,
  isExpanded: true,
  resolved: true,
})

afterEach(() => {
  clearFileStateAtoms()
})

// --- file rename ---

describe("renameInTreeAtom — file rename", () => {
  it("renames a root-level file in the tree", () => {
    const store = createStore()
    store.set(fileTreeAtom, [file("/ws/old.md"), file("/ws/other.md")])

    store.set(renameInTreeAtom, {
      oldPath: AbsolutePath("/ws/old.md"),
      newPath: AbsolutePath("/ws/new.md"),
      isFolder: false,
    })

    const tree = store.get(sortedFileTreeAtom)
    expect(findItemInTree(tree, "/ws/new.md")).not.toBeNull()
    expect(findItemInTree(tree, "/ws/old.md")).toBeNull()
    // other file untouched
    expect(findItemInTree(tree, "/ws/other.md")).not.toBeNull()
  })

  it("renames a nested file", () => {
    const store = createStore()
    store.set(fileTreeAtom, [folder("/ws/src", [file("/ws/src/index.ts")])])

    store.set(renameInTreeAtom, {
      oldPath: AbsolutePath("/ws/src/index.ts"),
      newPath: AbsolutePath("/ws/src/main.ts"),
      isFolder: false,
    })

    const tree = store.get(sortedFileTreeAtom)
    expect(findItemInTree(tree, "/ws/src/main.ts")).not.toBeNull()
    expect(findItemInTree(tree, "/ws/src/index.ts")).toBeNull()
  })

  it("transfers the file state atom to the new path", () => {
    const store = createStore()
    const oldPath = AbsolutePath("/ws/target.md")
    const newPath = AbsolutePath("/ws/renamed.md")
    store.set(fileTreeAtom, [file(oldPath)])

    // create a file state atom at the old path
    getOrCreateFileStateAtom(oldPath)
    expect(hasFileStateAtom(oldPath)).toBe(true)

    store.set(renameInTreeAtom, { oldPath, newPath, isFolder: false })

    expect(hasFileStateAtom(oldPath)).toBe(false)
    expect(hasFileStateAtom(newPath)).toBe(true)
  })

  it("updates openedFilesAtom", () => {
    const store = createStore()
    const oldPath = AbsolutePath("/ws/opened.md")
    const newPath = AbsolutePath("/ws/opened-renamed.md")
    store.set(fileTreeAtom, [file(oldPath)])
    store.set(openedFilesAtom, new Set([oldPath]))

    store.set(renameInTreeAtom, { oldPath, newPath, isFolder: false })

    const opened = store.get(openedFilesAtom)
    expect(opened.has(oldPath)).toBe(false)
    expect(opened.has(newPath)).toBe(true)
  })

  it("does nothing if old path is not in tree", () => {
    const store = createStore()
    store.set(fileTreeAtom, [file("/ws/exists.md")])

    store.set(renameInTreeAtom, {
      oldPath: AbsolutePath("/ws/ghost.md"),
      newPath: AbsolutePath("/ws/ghost-new.md"),
      isFolder: false,
    })

    const tree = store.get(sortedFileTreeAtom)
    expect(findItemInTree(tree, "/ws/exists.md")).not.toBeNull()
    expect(tree).toHaveLength(1)
  })
})

// --- folder rename ---

describe("renameInTreeAtom — folder rename", () => {
  it("renames a folder and rewrites all child paths", () => {
    const store = createStore()
    store.set(fileTreeAtom, [
      folder("/ws/old-dir", [
        file("/ws/old-dir/a.md"),
        folder("/ws/old-dir/sub", [file("/ws/old-dir/sub/b.md")]),
      ]),
    ])

    store.set(renameInTreeAtom, {
      oldPath: AbsolutePath("/ws/old-dir"),
      newPath: AbsolutePath("/ws/new-dir"),
      isFolder: true,
    })

    const tree = store.get(sortedFileTreeAtom)
    expect(findItemInTree(tree, "/ws/new-dir")).not.toBeNull()
    expect(findItemInTree(tree, "/ws/new-dir/a.md")).not.toBeNull()
    expect(findItemInTree(tree, "/ws/new-dir/sub")).not.toBeNull()
    expect(findItemInTree(tree, "/ws/new-dir/sub/b.md")).not.toBeNull()

    // old paths are gone
    expect(findItemInTree(tree, "/ws/old-dir")).toBeNull()
    expect(findItemInTree(tree, "/ws/old-dir/a.md")).toBeNull()
  })

  it("migrates expanded folders to new prefix", () => {
    const store = createStore()
    store.set(fileTreeAtom, [
      folder("/ws/docs", [folder("/ws/docs/api", [file("/ws/docs/api/ref.md")])]),
    ])
    store.set(expandedFoldersAtom, {
      [AbsolutePath("/ws/docs")]: true,
      [AbsolutePath("/ws/docs/api")]: true,
      [AbsolutePath("/ws/unrelated")]: true,
    })

    store.set(renameInTreeAtom, {
      oldPath: AbsolutePath("/ws/docs"),
      newPath: AbsolutePath("/ws/documentation"),
      isFolder: true,
    })

    const expanded = store.get(expandedFoldersAtom)
    expect(expanded[AbsolutePath("/ws/documentation")]).toBe(true)
    expect(expanded[AbsolutePath("/ws/documentation/api")]).toBe(true)
    expect(expanded[AbsolutePath("/ws/unrelated")]).toBe(true)
    // old keys gone
    expect(expanded[AbsolutePath("/ws/docs")]).toBeUndefined()
    expect(expanded[AbsolutePath("/ws/docs/api")]).toBeUndefined()
  })

  it("transfers file state atoms for all children", () => {
    const store = createStore()
    const childA = AbsolutePath("/ws/dir/a.md")
    const childB = AbsolutePath("/ws/dir/sub/b.md")
    store.set(fileTreeAtom, [
      folder("/ws/dir", [file(childA), folder("/ws/dir/sub", [file(childB)])]),
    ])

    getOrCreateFileStateAtom(childA)
    getOrCreateFileStateAtom(childB)

    store.set(renameInTreeAtom, {
      oldPath: AbsolutePath("/ws/dir"),
      newPath: AbsolutePath("/ws/renamed"),
      isFolder: true,
    })

    expect(hasFileStateAtom(childA)).toBe(false)
    expect(hasFileStateAtom(childB)).toBe(false)
    expect(hasFileStateAtom(AbsolutePath("/ws/renamed/a.md"))).toBe(true)
    expect(hasFileStateAtom(AbsolutePath("/ws/renamed/sub/b.md"))).toBe(true)
  })

  it("updates openedFilesAtom for all children under folder", () => {
    const store = createStore()
    const childA = AbsolutePath("/ws/dir/a.md")
    const childB = AbsolutePath("/ws/dir/sub/b.md")
    const unrelated = AbsolutePath("/ws/other.md")
    store.set(fileTreeAtom, [
      folder("/ws/dir", [file(childA), folder("/ws/dir/sub", [file(childB)])]),
      file(unrelated),
    ])
    store.set(openedFilesAtom, new Set([childA, childB, unrelated]))

    store.set(renameInTreeAtom, {
      oldPath: AbsolutePath("/ws/dir"),
      newPath: AbsolutePath("/ws/renamed"),
      isFolder: true,
    })

    const opened = store.get(openedFilesAtom)
    expect(opened.has(childA)).toBe(false)
    expect(opened.has(childB)).toBe(false)
    expect(opened.has(AbsolutePath("/ws/renamed/a.md"))).toBe(true)
    expect(opened.has(AbsolutePath("/ws/renamed/sub/b.md"))).toBe(true)
    // unrelated file untouched
    expect(opened.has(unrelated)).toBe(true)
  })

  it("preserves child names after rename", () => {
    const store = createStore()
    store.set(fileTreeAtom, [
      folder("/ws/pkg", [file("/ws/pkg/readme.md"), file("/ws/pkg/index.ts")]),
    ])

    store.set(renameInTreeAtom, {
      oldPath: AbsolutePath("/ws/pkg"),
      newPath: AbsolutePath("/ws/package"),
      isFolder: true,
    })

    const tree = store.get(sortedFileTreeAtom)
    const readme = findItemInTree(tree, "/ws/package/readme.md")
    expect(readme?.name).toBe("readme.md")
    const idx = findItemInTree(tree, "/ws/package/index.ts")
    expect(idx?.name).toBe("index.ts")
  })
})
