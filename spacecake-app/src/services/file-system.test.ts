import { FileSystem as EffectFileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import fs from "node:fs"
import path from "node:path"
import { describe, expect } from "vitest"

import { WatcherService } from "@/main-process/watcher"
import { FileMode, FileSystem } from "@/services/file-system"
import { GitIgnoreLive } from "@/services/git-ignore-parser"
import { makeSpacecakeHomeTestLayer } from "@/services/spacecake-home"
import { AbsolutePath } from "@/types/workspace"

// Mock WatcherService - we're not testing watcher functionality here
const MockWatcherService = Layer.succeed(WatcherService, {
  _tag: "app/WatcherService",
  startWorkspace: () => Effect.succeed(true),
  stopWorkspace: () => Effect.succeed(true),
  startFile: () => Effect.succeed(true),
  stopFile: () => Effect.succeed(true),
  startDir: () => Effect.succeed(true),
  stopDir: () => Effect.succeed(true),
} as WatcherService)

// Test layer with real filesystem but mocked watcher
// NodeFileSystem.layer provides Effect's FileSystem.FileSystem
// We merge it so both our FileSystem service and direct usage work
const SpacecakeHomeTestLayer = makeSpacecakeHomeTestLayer({
  homeDir: "/test/.spacecake",
})

const TestLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  FileSystem.Default.pipe(
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(GitIgnoreLive),
    Layer.provide(MockWatcherService),
    Layer.provide(SpacecakeHomeTestLayer),
  ),
)

describe("FileSystem service", () => {
  describe("writeTextFile", () => {
    it.scoped("writes file with content", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const filePath = AbsolutePath(path.join(tempDir, "test.txt"))

        yield* fileSystem.writeTextFile(filePath, "hello world")

        // Verify with Node's fs
        const content = fs.readFileSync(filePath, "utf8")
        expect(content).toBe("hello world")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.scoped("writes file with executable mode", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const filePath = AbsolutePath(path.join(tempDir, "script.sh"))

        yield* fileSystem.writeTextFile(filePath, "#!/bin/bash\necho hello", {
          mode: FileMode.EXECUTABLE,
        })

        // Verify file exists and has correct content
        const content = fs.readFileSync(filePath, "utf8")
        expect(content).toBe("#!/bin/bash\necho hello")

        // Verify permissions (0o755 = rwxr-xr-x)
        const stats = fs.statSync(filePath)
        const mode = stats.mode & 0o777
        expect(mode).toBe(0o755)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.scoped("writes file with private mode", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const filePath = AbsolutePath(path.join(tempDir, "secret.txt"))

        yield* fileSystem.writeTextFile(filePath, "secret data", {
          mode: FileMode.PRIVATE,
        })

        // Verify permissions (0o600 = rw-------)
        const stats = fs.statSync(filePath)
        const mode = stats.mode & 0o777
        expect(mode).toBe(0o600)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.scoped("overwrites existing file", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const filePath = AbsolutePath(path.join(tempDir, "test.txt"))

        yield* fileSystem.writeTextFile(filePath, "first content")
        yield* fileSystem.writeTextFile(filePath, "second content")

        const content = fs.readFileSync(filePath, "utf8")
        expect(content).toBe("second content")
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("readTextFile", () => {
    it.scoped("reads file content", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const filePath = AbsolutePath(path.join(tempDir, "test.txt"))

        // Create file with Node's fs
        fs.writeFileSync(filePath, "test content")

        const result = yield* fileSystem.readTextFile(filePath)

        expect(result.content).toBe("test content")
        expect(result.name).toBe("test.txt")
        expect(result.path).toBe(filePath)
        expect(result.kind).toBe("file")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.scoped("returns NotFoundError for missing file", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const filePath = AbsolutePath(path.join(tempDir, "nonexistent.txt"))

        const result = yield* fileSystem.readTextFile(filePath).pipe(
          Effect.map(() => "success" as const),
          Effect.catchTag("NotFoundError", () => Effect.succeed("not-found")),
        )

        expect(result).toBe("not-found")
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("createFolder", () => {
    it.scoped("creates directory", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const folderPath = path.join(tempDir, "new-folder")

        yield* fileSystem.createFolder(folderPath)

        expect(fs.existsSync(folderPath)).toBe(true)
        expect(fs.statSync(folderPath).isDirectory()).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.scoped("creates nested directories with recursive option", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const nestedPath = path.join(tempDir, "a", "b", "c")

        yield* fileSystem.createFolder(nestedPath, { recursive: true })

        expect(fs.existsSync(nestedPath)).toBe(true)
        expect(fs.statSync(nestedPath).isDirectory()).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("exists", () => {
    it.scoped("returns true for existing file", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const filePath = path.join(tempDir, "test.txt")
        fs.writeFileSync(filePath, "content")

        const result = yield* fileSystem.exists(filePath)

        expect(result).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.scoped("returns false for non-existent file", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const filePath = path.join(tempDir, "nonexistent.txt")

        const result = yield* fileSystem.exists(filePath)

        expect(result).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.scoped("returns true for existing directory", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const folderPath = path.join(tempDir, "folder")
        fs.mkdirSync(folderPath)

        const result = yield* fileSystem.exists(folderPath)

        expect(result).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("remove", () => {
    it.scoped("removes file", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const filePath = path.join(tempDir, "test.txt")
        fs.writeFileSync(filePath, "content")

        yield* fileSystem.remove(filePath)

        expect(fs.existsSync(filePath)).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )

    it.scoped("removes directory recursively", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const folderPath = path.join(tempDir, "folder")
        fs.mkdirSync(folderPath)
        fs.writeFileSync(path.join(folderPath, "file.txt"), "content")

        yield* fileSystem.remove(folderPath, true)

        expect(fs.existsSync(folderPath)).toBe(false)
      }).pipe(Effect.provide(TestLayer)),
    )
  })

  describe("rename", () => {
    it.scoped("renames file", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const oldPath = path.join(tempDir, "old.txt")
        const newPath = path.join(tempDir, "new.txt")
        fs.writeFileSync(oldPath, "content")

        yield* fileSystem.rename(oldPath, newPath)

        expect(fs.existsSync(oldPath)).toBe(false)
        expect(fs.existsSync(newPath)).toBe(true)
        expect(fs.readFileSync(newPath, "utf8")).toBe("content")
      }).pipe(Effect.provide(TestLayer)),
    )

    it.scoped("renames directory", () =>
      Effect.gen(function* () {
        const effectFs = yield* EffectFileSystem.FileSystem
        const fileSystem = yield* FileSystem

        const tempDir = yield* effectFs.makeTempDirectoryScoped()
        const oldPath = path.join(tempDir, "old-folder")
        const newPath = path.join(tempDir, "new-folder")
        fs.mkdirSync(oldPath)

        yield* fileSystem.rename(oldPath, newPath)

        expect(fs.existsSync(oldPath)).toBe(false)
        expect(fs.existsSync(newPath)).toBe(true)
        expect(fs.statSync(newPath).isDirectory()).toBe(true)
      }).pipe(Effect.provide(TestLayer)),
    )
  })
})

describe("FileMode constants", () => {
  it("EXECUTABLE is 0o755", () => {
    expect(FileMode.EXECUTABLE).toBe(0o755)
  })

  it("READ_WRITE is 0o644", () => {
    expect(FileMode.READ_WRITE).toBe(0o644)
  })

  it("PRIVATE is 0o600", () => {
    expect(FileMode.PRIVATE).toBe(0o600)
  })
})
