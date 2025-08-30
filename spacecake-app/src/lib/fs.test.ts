import { describe, expect, test } from "vitest"

import type { FileContent } from "@/types/workspace"
import { FileType } from "@/types/workspace"
import { openDirectory, readFile, saveFile, type ElectronAPI } from "@/lib/fs"

// Create test implementations of the ElectronAPI interface
const createTestElectronAPI = (
  overrides: Partial<ElectronAPI> = {}
): ElectronAPI => ({
  showOpenDialog: async () => ({ canceled: false, filePaths: ["/test/path"] }),
  readFile: async () => ({ success: true, file: createTestFileContent() }),
  saveFile: async () => ({ success: true }),
  createFile: async () => ({ success: true }),
  createFolder: async () => ({ success: true }),
  renameFile: async () => ({ success: true }),
  deleteFile: async () => ({ success: true }),
  ...overrides,
})

const createTestFileContent = (
  overrides: Partial<FileContent> = {}
): FileContent => ({
  name: "test.py",
  path: "/test/test.py",
  kind: "file",
  etag: { mtimeMs: 1714732800000, size: 100 },
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
      readFile: async () => ({ success: true, file: testFile }),
    })

    const result = await readFile("/test/test.py", electronAPI)

    expect(result).not.toBeNull()
    expect(result?.content).toBe(testContent)
    expect(result?.cid).toBeDefined()
    expect(result?.cid).not.toBe("test-cid") // Should be computed from content
  })

  test("returns null when read fails", async () => {
    const electronAPI = createTestElectronAPI({
      readFile: async () => ({ success: false, error: "file not found" }),
    })

    const result = await readFile("/nonexistent/file.py", electronAPI)

    expect(result).toBeNull()
  })

  test("returns null when read throws error", async () => {
    const electronAPI = createTestElectronAPI({
      readFile: async () => {
        throw new Error("permission denied")
      },
    })

    const result = await readFile("/protected/file.py", electronAPI)

    expect(result).toBeNull()
  })

  test("handles empty file content", async () => {
    const testFile = createTestFileContent({ content: "" })

    const electronAPI = createTestElectronAPI({
      readFile: async () => ({ success: true, file: testFile }),
    })

    const result = await readFile("/test/empty.py", electronAPI)

    expect(result).not.toBeNull()
    expect(result?.content).toBe("")
    expect(result?.cid).toBeDefined()
  })
})

describe("saveFile", () => {
  test("successfully saves file content", async () => {
    const electronAPI = createTestElectronAPI({
      saveFile: async () => ({ success: true }),
    })

    const result = await saveFile("/test/test.py", "new content", electronAPI)

    expect(result).toBe(true)
  })

  test("returns false when save fails", async () => {
    const electronAPI = createTestElectronAPI({
      saveFile: async () => ({ success: false, error: "disk full" }),
    })

    const result = await saveFile("/test/test.py", "content", electronAPI)

    expect(result).toBe(false)
  })

  test("returns false when save throws error", async () => {
    const electronAPI = createTestElectronAPI({
      saveFile: async () => {
        throw new Error("permission denied")
      },
    })

    const result = await saveFile("/protected/file.py", "content", electronAPI)

    expect(result).toBe(false)
  })

  test("handles empty content", async () => {
    const electronAPI = createTestElectronAPI({
      saveFile: async () => ({ success: true }),
    })

    const result = await saveFile("/test/empty.py", "", electronAPI)

    expect(result).toBe(true)
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
    const electronAPI = createTestElectronAPI({
      showOpenDialog: async () => {
        throw new Error("dialog failed")
      },
    })

    const result = await openDirectory(electronAPI)

    expect(result).toBeNull()
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
