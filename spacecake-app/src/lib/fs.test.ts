import {
  NotFoundError,
  PermissionDeniedError,
  UnknownFSError,
} from "@/services/file-system"
import { assert, describe, expect, test, vi } from "vitest"

import { left, match, right } from "@/types/adt"
import type { ElectronAPI } from "@/types/electron"
import type { FileContent } from "@/types/workspace"
import { AbsolutePath, FileType } from "@/types/workspace"
import { openDirectory, readFile, saveFile } from "@/lib/fs"

// Create test implementations of the ElectronAPI interface
const createTestElectronAPI = (
  overrides: Partial<ElectronAPI> = {}
): ElectronAPI => ({
  claude: {
    notifySelectionChanged: async () => {},
    notifyAtMentioned: async () => {},
    onStatusChange: () => () => {},
    onOpenFile: () => () => {},
    onStatuslineUpdate: () => () => {},
    ensureServer: async () => {},
    tasks: {
      startWatching: async () => right(undefined),
      list: async () => right([]),
      stopWatching: async () => right(undefined),
      onChange: () => () => {},
    },
    statusline: {
      read: async () => right({ configured: false, isSpacecake: false }),
      update: async () => right(undefined),
      remove: async () => right(undefined),
    },
  },
  showOpenDialog: async () => ({ canceled: false, filePaths: ["/test/path"] }),
  readFile: async () => right(createTestFileContent()),
  saveFile: async () => right(undefined),
  createFolder: async () => right(undefined),
  rename: async () => right(undefined),
  remove: async () => right(undefined),
  readDirectory: async () => right([]),
  startWatcher: async () => right(undefined),
  stopWatcher: async () => right(undefined),
  onFileEvent: () => () => {},
  platform: "test",
  getHomeFolderPath: async () => "/test/.spacecake",
  exists: async () => right(true),
  createTerminal: async () => right(undefined),
  resizeTerminal: async () => right(undefined),
  writeTerminal: async () => right(undefined),
  killTerminal: async () => right(undefined),
  onTerminalOutput: () => () => {},
  ...overrides,
})

const createTestFileContent = (
  overrides: Partial<FileContent> = {}
): FileContent => ({
  name: "test.py",
  path: AbsolutePath("/test/test.py"),
  kind: "file",
  etag: { mtime: new Date(1714732800000), size: 100 },
  content: "print('hello world')",
  fileType: FileType.Python,
  cid: "test-cid",
  ...overrides,
})

describe("readFile", () => {
  test("successfully reads file and computes cid", async () => {
    const testContent = "def hello(): return 'world'"
    const testFile = createTestFileContent({ content: testContent })

    const electronAPI = createTestElectronAPI({
      readFile: async () => right(testFile),
    })

    const result = await readFile(AbsolutePath("/test/test.py"), electronAPI)

    match(result, {
      onLeft: (error) => {
        assert.fail(error.message)
      },
      onRight: (file) => {
        expect(file.content).toBe(testContent)
        expect(file.cid).toBe("test-cid") // Should be computed from content
      },
    })
  })

  test("returns null when read fails", async () => {
    const electronAPI = createTestElectronAPI({
      readFile: async () =>
        left(
          new NotFoundError({
            path: "/nonexistent/file.py",
            description: "file not found",
          })
        ),
    })

    const result = await readFile(
      AbsolutePath("/nonexistent/file.py"),
      electronAPI
    )

    match(result, {
      onLeft: (error) => {
        expect(error.description).toBe("file not found")
      },
      onRight: () => {
        assert.fail("should not be right")
      },
    })
  })

  test("returns null when read throws error", async () => {
    const electronAPI = createTestElectronAPI({
      readFile: async () =>
        left(
          new PermissionDeniedError({
            path: "/protected/file.py",
            description: "permission denied",
          })
        ),
    })

    const result = await readFile(
      AbsolutePath("/protected/file.py"),
      electronAPI
    )

    match(result, {
      onLeft: (error) => {
        expect(error.description).toBe("permission denied")
      },
      onRight: () => {
        assert.fail("should not be right")
      },
    })
  })

  test("handles empty file content", async () => {
    const testFile = createTestFileContent({ content: "" })

    const electronAPI = createTestElectronAPI({
      readFile: async () => right(testFile),
    })

    const result = await readFile(AbsolutePath("/test/empty.py"), electronAPI)

    match(result, {
      onLeft: () => {
        assert.fail("should not be left")
      },
      onRight: (file) => {
        expect(file.content).toBe("")
        expect(file.cid).toBe("test-cid") // Should be computed from content
      },
    })
  })
})

describe("saveFile", () => {
  test("successfully saves file content", async () => {
    const electronAPI = createTestElectronAPI({
      saveFile: async () => right(undefined),
    })

    const result = await saveFile(
      AbsolutePath("/test/test.py"),
      "new content",
      electronAPI
    )

    match(result, {
      onLeft: () => {
        assert.fail("should not be left")
      },
      onRight: (file) => {
        expect(file).toBeUndefined()
      },
    })
  })

  test("returns false when save fails", async () => {
    const electronAPI = createTestElectronAPI({
      saveFile: async () =>
        left(
          new UnknownFSError({
            path: "/test/test.py",
            description: "disk full",
          })
        ),
    })

    const result = await saveFile(
      AbsolutePath("/test/test.py"),
      "content",
      electronAPI
    )

    match(result, {
      onLeft: (error) => {
        expect(error.description).toBe("disk full")
      },
      onRight: () => {
        assert.fail("should not be right")
      },
    })
  })

  test("returns false when save throws error", async () => {
    const electronAPI = createTestElectronAPI({
      saveFile: async () =>
        left(
          new PermissionDeniedError({
            path: "/protected/file.py",
            description: "permission denied",
          })
        ),
    })

    const result = await saveFile(
      AbsolutePath("/protected/file.py"),
      "content",
      electronAPI
    )

    match(result, {
      onLeft: (error) => {
        expect(error.description).toBe("permission denied")
      },
      onRight: () => {
        assert.fail("should not be right")
      },
    })
  })

  test("handles empty content", async () => {
    const electronAPI = createTestElectronAPI({
      saveFile: async () => right(undefined),
    })

    const result = await saveFile(
      AbsolutePath("/test/empty.py"),
      "",
      electronAPI
    )

    match(result, {
      onLeft: (error) => {
        assert.fail(error.message)
      },
      onRight: (file) => {
        expect(file).toBeUndefined()
      },
    })
  })
})

describe("openDirectory", () => {
  test("returns selected directory path when dialog succeeds", async () => {
    const electronAPI = createTestElectronAPI({
      showOpenDialog: async () => ({
        canceled: false,
        filePaths: ["/selected/path"],
      }),
    })

    const result = await openDirectory(electronAPI)

    expect(result).toBe("/selected/path")
  })

  test("returns null when dialog is canceled", async () => {
    const electronAPI = createTestElectronAPI({
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    })

    const result = await openDirectory(electronAPI)

    expect(result).toBeNull()
  })

  test("returns null when dialog throws error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {})

    const electronAPI = createTestElectronAPI({
      showOpenDialog: async () => {
        throw new Error("dialog failed")
      },
    })

    const result = await openDirectory(electronAPI)

    expect(result).toBeNull()
    consoleErrorSpy.mockRestore()
  })

  test("returns first path when multiple paths selected", async () => {
    const electronAPI = createTestElectronAPI({
      showOpenDialog: async () => ({
        canceled: false,
        filePaths: ["/first/path", "/second/path"],
      }),
    })

    const result = await openDirectory(electronAPI)

    expect(result).toBe("/first/path")
  })
})
