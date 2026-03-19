import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  addPendingFolderRename,
  addPendingRename,
  findItemInTree,
  handleFileEvent,
} from "@/lib/file-event-handler"
import type { File, FileTree, Folder } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"

// mock fs module used by handleFileEvent
vi.mock("@/lib/fs", () => ({
  readFile: vi.fn(),
}))

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

// --- findItemInTree ---

describe("findItemInTree", () => {
  const tree: FileTree = [
    file("/ws/readme.md"),
    folder("/ws/src", [
      file("/ws/src/index.ts"),
      folder("/ws/src/lib", [file("/ws/src/lib/utils.ts")]),
    ]),
  ]

  it("finds a root-level file", () => {
    expect(findItemInTree(tree, "/ws/readme.md")?.name).toBe("readme.md")
  })

  it("finds a nested file", () => {
    expect(findItemInTree(tree, "/ws/src/index.ts")?.name).toBe("index.ts")
  })

  it("finds a deeply nested file", () => {
    expect(findItemInTree(tree, "/ws/src/lib/utils.ts")?.name).toBe("utils.ts")
  })

  it("finds a folder", () => {
    const result = findItemInTree(tree, "/ws/src")
    expect(result?.kind).toBe("folder")
    expect(result?.name).toBe("src")
  })

  it("returns null for non-existent path", () => {
    expect(findItemInTree(tree, "/ws/nope.ts")).toBeNull()
  })
})

// --- pending rename suppression ---

describe("pending rename suppression", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("suppresses unlinkFile for a pending file rename", async () => {
    const oldPath = AbsolutePath("/ws/old.md")
    const newPath = AbsolutePath("/ws/new.md")
    addPendingRename(oldPath, newPath)

    const setFileTreeEvent = vi.fn()
    const deleteFile = vi.fn()

    await handleFileEvent(
      { kind: "unlinkFile", path: oldPath },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    expect(setFileTreeEvent).not.toHaveBeenCalled()
  })

  it("suppresses addFile for a pending file rename and cleans up", async () => {
    const oldPath = AbsolutePath("/ws/alpha.md")
    const newPath = AbsolutePath("/ws/beta.md")
    addPendingRename(oldPath, newPath)

    const setFileTreeEvent = vi.fn()
    const deleteFile = vi.fn()

    await handleFileEvent(
      { kind: "addFile", path: newPath, etag: { mtime: new Date(), size: 0 } },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    expect(setFileTreeEvent).not.toHaveBeenCalled()

    // after cleanup, a second addFile for the same path should go through
    await handleFileEvent(
      { kind: "addFile", path: newPath, etag: { mtime: new Date(), size: 0 } },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    expect(setFileTreeEvent).toHaveBeenCalledTimes(1)
  })

  it("suppresses unlinkFolder and addFolder under a pending folder rename", async () => {
    const oldFolder = AbsolutePath("/ws/old-dir")
    const newFolder = AbsolutePath("/ws/new-dir")
    addPendingFolderRename(oldFolder, newFolder)

    const setFileTreeEvent = vi.fn()
    const deleteFile = vi.fn()

    // child unlink under old prefix — suppressed
    await handleFileEvent(
      { kind: "unlinkFile", path: AbsolutePath("/ws/old-dir/file.md") },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    // child add under new prefix — suppressed
    await handleFileEvent(
      {
        kind: "addFile",
        path: AbsolutePath("/ws/new-dir/file.md"),
        etag: { mtime: new Date(), size: 0 },
      },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    // folder-level events — suppressed
    await handleFileEvent(
      { kind: "unlinkFolder", path: oldFolder },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    await handleFileEvent(
      { kind: "addFolder", path: newFolder },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    expect(setFileTreeEvent).not.toHaveBeenCalled()
  })

  it("lets unrelated events through while a rename is pending", async () => {
    const oldPath = AbsolutePath("/ws/target.md")
    const newPath = AbsolutePath("/ws/renamed.md")
    addPendingRename(oldPath, newPath)

    const setFileTreeEvent = vi.fn()
    const deleteFile = vi.fn()

    // unrelated file — should pass through
    await handleFileEvent(
      { kind: "unlinkFile", path: AbsolutePath("/ws/other.md") },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    expect(setFileTreeEvent).toHaveBeenCalledTimes(1)
  })

  it("auto-cleans pending renames after timeout", async () => {
    const oldPath = AbsolutePath("/ws/timeout-old.md")
    const newPath = AbsolutePath("/ws/timeout-new.md")
    addPendingRename(oldPath, newPath)

    vi.advanceTimersByTime(5_000)

    const setFileTreeEvent = vi.fn()
    const deleteFile = vi.fn()

    // after timeout, unlink should go through (no longer suppressed)
    await handleFileEvent(
      { kind: "unlinkFile", path: oldPath },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    expect(setFileTreeEvent).toHaveBeenCalledTimes(1)
  })

  it("auto-cleans pending folder renames after timeout", async () => {
    const oldFolder = AbsolutePath("/ws/timeout-dir")
    const newFolder = AbsolutePath("/ws/timeout-renamed")
    addPendingFolderRename(oldFolder, newFolder)

    vi.advanceTimersByTime(5_000)

    const setFileTreeEvent = vi.fn()
    const deleteFile = vi.fn()

    // after timeout, events under old prefix go through
    await handleFileEvent(
      { kind: "unlinkFile", path: AbsolutePath("/ws/timeout-dir/child.md") },
      null,
      setFileTreeEvent,
      AbsolutePath("/ws"),
      [],
      deleteFile,
    )

    expect(setFileTreeEvent).toHaveBeenCalledTimes(1)
  })
})
