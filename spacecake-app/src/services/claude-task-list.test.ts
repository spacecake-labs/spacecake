import { it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, vi } from "vitest"

import { WatcherService } from "@/main-process/watcher"
import { ClaudeConfig } from "@/services/claude-config"
import { ClaudeTaskListService } from "@/services/claude-task-list"
import { FileSystem, UnknownFSError } from "@/services/file-system"
import { GitIgnoreLive } from "@/services/git-ignore-parser"
import { makeSpacecakeHomeTestLayer } from "@/services/spacecake-home"
import { ClaudeTaskError } from "@/types/claude-task"

// Mock node:fs module
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
  },
}))

const mockFs = fs as unknown as {
  existsSync: ReturnType<typeof vi.fn>
  readFileSync: ReturnType<typeof vi.fn>
  readdirSync: ReturnType<typeof vi.fn>
}

// Mock WatcherService
const MockWatcherService = Layer.succeed(WatcherService, {
  _tag: "app/WatcherService",
  startWorkspace: () => Effect.succeed(true),
  stopWorkspace: () => Effect.succeed(true),
  startFile: () => Effect.succeed(true),
  stopFile: () => Effect.succeed(true),
  startDir: () => Effect.succeed(true),
  stopDir: () => Effect.succeed(true),
} as WatcherService)

const SpacecakeHomeTestLayer = makeSpacecakeHomeTestLayer({
  homeDir: "/test/.spacecake",
})

// Create a mock FileSystem layer
const createMockFileSystem = () => {
  const mockFileSystem: Partial<FileSystem> = {
    createFolder: vi.fn(() => Effect.void),
    startDirWatcher: vi.fn(() => Effect.succeed(true)),
    stopDirWatcher: vi.fn(() => Effect.succeed(true)),
    readTextFile: vi.fn(() => Effect.fail(new UnknownFSError({ description: "not implemented" }))),
    writeTextFile: vi.fn(() => Effect.void),
    remove: vi.fn(() => Effect.void),
    rename: vi.fn(() => Effect.void),
    exists: vi.fn(() => Effect.succeed(true)),
    readDirectory: vi.fn(() => Effect.succeed([])),
    startWatcher: vi.fn(() => Effect.succeed(true)),
    stopWatcher: vi.fn(() => Effect.succeed(true)),
    startFileWatcher: vi.fn(() => Effect.succeed(true)),
    stopFileWatcher: vi.fn(() => Effect.succeed(true)),
  }

  return Layer.succeed(FileSystem, mockFileSystem as FileSystem)
}

// Create a test layer with custom taskListId
const makeTestConfigLayer = (options: { taskListId?: string; configDir?: string } = {}) => {
  const configDir = options.configDir ?? "/tmp/test-claude"
  return Layer.succeed(ClaudeConfig, {
    configDir,
    ideDir: path.join(configDir, "ide"),
    socketPath: path.join(configDir, "spacecake.sock"),
    tasksDir: path.join(configDir, "tasks"),
    settingsPath: path.join(configDir, "settings.json"),
    taskListId: options.taskListId ? Option.some(options.taskListId) : Option.none(),
  } as ClaudeConfig)
}

// Build base test layers
const BaseTestLayer = Layer.mergeAll(MockWatcherService, GitIgnoreLive, SpacecakeHomeTestLayer)

describe("ClaudeTaskListService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("resolveListId", () => {
    it.effect("falls back to sessionId when config env var not set", () =>
      Effect.gen(function* () {
        const service = yield* ClaudeTaskListService
        const listId = service.resolveListId("session-456")

        expect(listId).toBe("session-456")
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )

    it.effect("returns null when both config and sessionId are empty", () =>
      Effect.gen(function* () {
        const service = yield* ClaudeTaskListService
        const listId = service.resolveListId(undefined)

        expect(listId).toBeNull()
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )
  })

  describe("readAllTasks", () => {
    it.effect("parses valid JSON task files", () =>
      Effect.gen(function* () {
        mockFs.existsSync.mockReturnValue(true)
        mockFs.readdirSync.mockReturnValue(["task-1.json", "task-2.json"])
        mockFs.readFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes("task-1.json")) {
            return JSON.stringify({
              id: "task-1",
              subject: "First task",
              description: "Do something",
              status: "pending",
            })
          }
          if (filePath.includes("task-2.json")) {
            return JSON.stringify({
              id: "task-2",
              subject: "Second task",
              description: "Do something else",
              status: "in_progress",
            })
          }
          throw new Error("File not found")
        })

        const service = yield* ClaudeTaskListService
        const tasks = service.readAllTasks("test-list")

        expect(tasks).toHaveLength(2)
        expect(tasks[0].id).toBe("task-1")
        expect(tasks[0].subject).toBe("First task")
        expect(tasks[1].id).toBe("task-2")
        expect(tasks[1].status).toBe("in_progress")
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )

    it.effect("skips invalid JSON files", () =>
      Effect.gen(function* () {
        mockFs.existsSync.mockReturnValue(true)
        mockFs.readdirSync.mockReturnValue(["invalid.json"])
        mockFs.readFileSync.mockReturnValue("not valid json {{{")

        const service = yield* ClaudeTaskListService
        const tasks = service.readAllTasks("test-list")

        // Invalid JSON should be skipped
        expect(tasks).toHaveLength(0)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )

    it.effect("validates against schema and skips invalid tasks", () =>
      Effect.gen(function* () {
        mockFs.existsSync.mockReturnValue(true)
        mockFs.readdirSync.mockReturnValue(["valid.json", "invalid-schema.json"])
        mockFs.readFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes("valid.json")) {
            return JSON.stringify({
              id: "valid-task",
              subject: "Valid task",
              description: "Has all required fields",
              status: "pending",
            })
          }
          if (filePath.includes("invalid-schema.json")) {
            // Missing required fields
            return JSON.stringify({
              id: "invalid-task",
              // missing subject, description, status
            })
          }
          throw new Error("File not found")
        })

        const service = yield* ClaudeTaskListService
        const tasks = service.readAllTasks("test-list")

        // Only valid task should be returned
        expect(tasks).toHaveLength(1)
        expect(tasks[0].id).toBe("valid-task")
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )

    it.effect("handles empty directory", () =>
      Effect.gen(function* () {
        mockFs.existsSync.mockReturnValue(true)
        mockFs.readdirSync.mockReturnValue([])

        const service = yield* ClaudeTaskListService
        const tasks = service.readAllTasks("empty-list")

        expect(tasks).toHaveLength(0)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )

    it.effect("returns empty array when directory does not exist", () =>
      Effect.gen(function* () {
        mockFs.existsSync.mockReturnValue(false)

        const service = yield* ClaudeTaskListService
        const tasks = service.readAllTasks("nonexistent-list")

        expect(tasks).toHaveLength(0)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )

    it.effect("only reads .json files", () =>
      Effect.gen(function* () {
        mockFs.existsSync.mockReturnValue(true)
        mockFs.readdirSync.mockReturnValue(["task.json", "readme.md", "notes.txt", ".gitkeep"])
        mockFs.readFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes("task.json")) {
            return JSON.stringify({
              id: "task-1",
              subject: "Task",
              description: "Description",
              status: "pending",
            })
          }
          throw new Error("Should not read non-JSON files")
        })

        const service = yield* ClaudeTaskListService
        const tasks = service.readAllTasks("test-list")

        expect(tasks).toHaveLength(1)
        expect(mockFs.readFileSync).toHaveBeenCalledTimes(1)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )
  })

  describe("startWatching", () => {
    it.effect("fails with ClaudeTaskError when no listId available", () =>
      Effect.gen(function* () {
        const service = yield* ClaudeTaskListService
        const result = yield* service.startWatching(undefined).pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(ClaudeTaskError)
          expect(result.left.description).toBe("No task list ID available")
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )
  })

  describe("stopWatching", () => {
    it.effect("does nothing when no watcher is active", () =>
      Effect.gen(function* () {
        const service = yield* ClaudeTaskListService
        // Should not throw when nothing is watching
        yield* service.stopWatching()
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )
  })

  describe("listTasks", () => {
    it.effect("returns tasks for resolved list ID", () =>
      Effect.gen(function* () {
        mockFs.existsSync.mockReturnValue(true)
        mockFs.readdirSync.mockReturnValue(["task.json"])
        mockFs.readFileSync.mockReturnValue(
          JSON.stringify({
            id: "task-1",
            subject: "Test",
            description: "Desc",
            status: "pending",
          }),
        )

        const service = yield* ClaudeTaskListService
        const tasks = service.listTasks("session-123")

        expect(tasks).toHaveLength(1)
        expect(tasks[0].id).toBe("task-1")
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )

    it.effect("returns empty array when no listId available", () =>
      Effect.gen(function* () {
        const service = yield* ClaudeTaskListService
        const tasks = service.listTasks(undefined)

        expect(tasks).toHaveLength(0)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          ClaudeTaskListService.Default.pipe(
            Layer.provide(makeTestConfigLayer({})),
            Layer.provide(createMockFileSystem()),
            Layer.provide(BaseTestLayer),
          ),
        ),
      ),
    )
  })
})
