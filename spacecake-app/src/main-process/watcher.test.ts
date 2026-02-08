import { FileSystem } from "@effect/platform"
import * as PlatformError from "@effect/platform/Error"
import { it } from "@effect/vitest"
import {
  Chunk,
  Duration,
  Effect,
  Fiber,
  Layer,
  Option,
  Queue,
  Ref,
  Schedule,
  Stream,
  TestClock,
  TestContext,
} from "effect"
import { afterEach, beforeEach, describe, expect, vi } from "vitest"

import { convertToFileTreeEvent } from "@/main-process/watcher"
import { AbsolutePath } from "@/types/workspace"

// Mock BrowserWindow for tests
const mockBrowserWindow = {
  getAllWindows: vi.fn(() => []),
}

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => mockBrowserWindow.getAllWindows(),
  },
}))

describe("watcher retry behavior", () => {
  beforeEach(() => {
    mockBrowserWindow.getAllWindows.mockReturnValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it.effect("retry schedule uses exponential backoff capped at 30 seconds", () =>
    Effect.gen(function* () {
      // Create the same schedule as in the watcher
      const retrySchedule = Schedule.exponential("1 second").pipe(
        Schedule.jittered,
        Schedule.union(Schedule.spaced("30 seconds")),
      )

      // Run the schedule to collect delays
      const delays = yield* Schedule.run(
        Schedule.delays(retrySchedule),
        Date.now(),
        [1, 2, 3, 4, 5, 6, 7, 8], // 8 retry attempts
      )

      const delayArray = Chunk.toArray(delays).map(Duration.toMillis)

      // First delay should be around 1 second (with jitter)
      expect(delayArray[0]).toBeGreaterThanOrEqual(0)
      expect(delayArray[0]).toBeLessThanOrEqual(2000) // 1s + jitter

      // Delays should grow exponentially but cap at 30 seconds
      // After enough iterations, all delays should be capped at 30s
      const lastFewDelays = delayArray.slice(-3)
      lastFewDelays.forEach((delay) => {
        expect(delay).toBeLessThanOrEqual(30000)
      })
    }),
  )

  it.effect("stream retry restarts after failure with delay", () =>
    Effect.gen(function* () {
      const attemptCount = yield* Ref.make(0)
      const eventQueue = yield* Queue.unbounded<string>()

      // Create a mock watch effect that tracks attempts
      const watchEffect = Effect.gen(function* () {
        const attempt = yield* Ref.updateAndGet(attemptCount, (n) => n + 1)
        yield* Queue.offer(eventQueue, `attempt-${attempt}`)

        // Fail on first 2 attempts, succeed on 3rd
        if (attempt < 3) {
          yield* Effect.fail(
            new PlatformError.SystemError({
              reason: "Unknown",
              module: "FileSystem",
              method: "watch",
              pathOrDescriptor: "/test",
              cause: { message: "simulated failure" },
            }),
          )
        }

        yield* Queue.offer(eventQueue, "success")
      })

      // Apply retry with a faster schedule for testing
      const retrySchedule = Schedule.exponential("100 millis").pipe(
        Schedule.intersect(Schedule.recurs(3)),
      )

      const retriedEffect = watchEffect.pipe(Effect.retry(retrySchedule), Effect.fork)

      // Run the effect
      const fiber = yield* retriedEffect

      // Advance time to allow retries
      yield* TestClock.adjust("1 second")

      // Wait for fiber to complete
      yield* Fiber.join(fiber)

      // Verify we got all attempts
      const count = yield* Ref.get(attemptCount)
      expect(count).toBe(3)

      // Verify we got the success event
      const events: string[] = []
      let event = yield* Queue.poll(eventQueue)
      while (Option.isSome(event)) {
        events.push(event.value)
        event = yield* Queue.poll(eventQueue)
      }

      expect(events).toContain("attempt-1")
      expect(events).toContain("attempt-2")
      expect(events).toContain("attempt-3")
      expect(events).toContain("success")
    }).pipe(Effect.provide(TestContext.TestContext)),
  )

  it.effect("convertToFileTreeEvent filters temp files", () =>
    Effect.sync(() => {
      // Test the temp file regex pattern used in watcher.ts
      const TEMP_FILE_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp|\.\d+$/

      // These should be filtered
      expect(TEMP_FILE_RE.test("/path/.file.swp")).toBe(true)
      expect(TEMP_FILE_RE.test("/path/.file.swx")).toBe(true)
      expect(TEMP_FILE_RE.test("/path/file~")).toBe(true)
      expect(TEMP_FILE_RE.test("/path/.subl123.tmp")).toBe(true)
      expect(TEMP_FILE_RE.test("/path/file.12345")).toBe(true)

      // These should NOT be filtered
      expect(TEMP_FILE_RE.test("/path/file.ts")).toBe(false)
      expect(TEMP_FILE_RE.test("/path/file.py")).toBe(false)
      expect(TEMP_FILE_RE.test("/path/normal.txt")).toBe(false)
    }),
  )

  it.effect("tapError logs before retry", () =>
    Effect.gen(function* () {
      const logs: string[] = []
      const attemptCount = yield* Ref.make(0)

      const failingEffect = Effect.gen(function* () {
        const attempt = yield* Ref.updateAndGet(attemptCount, (n) => n + 1)
        if (attempt < 2) {
          yield* Effect.fail(`error-${attempt}`)
        }
        return "success"
      })

      const withLogging = failingEffect.pipe(
        Effect.tapError((e) =>
          Effect.sync(() => {
            logs.push(`logged: ${e}`)
          }),
        ),
        Effect.retry(Schedule.recurs(2)),
      )

      const result = yield* withLogging

      expect(result).toBe("success")
      expect(logs).toContain("logged: error-1")
    }),
  )
})

describe("watcher schedule properties", () => {
  it.effect("exponential schedule doubles delay each iteration", () =>
    Effect.gen(function* () {
      const schedule = Schedule.exponential("1 second")

      const delays = yield* Schedule.run(Schedule.delays(schedule), Date.now(), [1, 2, 3, 4, 5])

      const delayArray = Chunk.toArray(delays).map(Duration.toMillis)

      // 1s, 2s, 4s, 8s, 16s
      expect(delayArray[0]).toBe(1000)
      expect(delayArray[1]).toBe(2000)
      expect(delayArray[2]).toBe(4000)
      expect(delayArray[3]).toBe(8000)
      expect(delayArray[4]).toBe(16000)
    }),
  )

  it.effect("union with spaced caps the delay", () =>
    Effect.gen(function* () {
      // Exponential that would grow beyond 5s
      const exponential = Schedule.exponential("1 second")
      // Cap at 5 seconds
      const capped = Schedule.union(exponential, Schedule.spaced("5 seconds"))

      const delays = yield* Schedule.run(
        Schedule.delays(capped),
        Date.now(),
        [1, 2, 3, 4, 5, 6, 7, 8],
      )

      const delayArray = Chunk.toArray(delays).map(Duration.toMillis)

      // First few follow exponential: 1s, 2s, 4s
      expect(delayArray[0]).toBe(1000)
      expect(delayArray[1]).toBe(2000)
      expect(delayArray[2]).toBe(4000)

      // After that, capped at 5s
      expect(delayArray[3]).toBe(5000)
      expect(delayArray[4]).toBe(5000)
      expect(delayArray[5]).toBe(5000)
    }),
  )
})

// --- Behavior tests for convertToFileTreeEvent ---

// Helper to create a mock FileSystem layer
const createMockFileSystem = (options: {
  statResult?: (path: string) => FileSystem.File.Info
  statError?: PlatformError.PlatformError
  readFileStringResult?: (path: string) => string
  readFileStringError?: PlatformError.PlatformError
}) => {
  const mockStat = (path: string) => {
    if (options.statError) {
      return Effect.fail(options.statError)
    }
    if (options.statResult) {
      return Effect.succeed(options.statResult(path))
    }
    // Default: return a file
    return Effect.succeed(createFileInfo("File"))
  }

  const mockReadFileString = (path: string) => {
    if (options.readFileStringError) {
      return Effect.fail(options.readFileStringError)
    }
    if (options.readFileStringResult) {
      return Effect.succeed(options.readFileStringResult(path))
    }
    return Effect.succeed("file content")
  }

  // Create a minimal mock FileSystem
  const mockFs = FileSystem.make({
    stat: mockStat,
    readFile: () => Effect.succeed(new Uint8Array()),
    access: () => Effect.void,
    copy: () => Effect.void,
    copyFile: () => Effect.void,
    chmod: () => Effect.void,
    chown: () => Effect.void,
    link: () => Effect.void,
    makeDirectory: () => Effect.void,
    makeTempDirectory: () => Effect.succeed("/tmp/test"),
    makeTempDirectoryScoped: () => Effect.succeed("/tmp/test"),
    makeTempFile: () => Effect.succeed("/tmp/test.txt"),
    makeTempFileScoped: () => Effect.succeed("/tmp/test.txt"),
    open: () => Effect.fail(notImplemented("open")),
    readDirectory: () => Effect.succeed([]),
    readLink: () => Effect.succeed("/link"),
    realPath: () => Effect.succeed("/real"),
    remove: () => Effect.void,
    rename: () => Effect.void,
    symlink: () => Effect.void,
    truncate: () => Effect.void,
    utimes: () => Effect.void,
    watch: () => Stream.empty,
    writeFile: () => Effect.void,
  })

  // Override readFileString since it's derived
  const fsWithReadFileString = {
    ...mockFs,
    readFileString: mockReadFileString,
  }

  return Layer.succeed(FileSystem.FileSystem, fsWithReadFileString)
}

const notImplemented = (method: string) =>
  new PlatformError.SystemError({
    reason: "Unknown",
    module: "FileSystem",
    method,
    pathOrDescriptor: "test",
    cause: new Error("not implemented"),
  })

// Helper to create File.Info
const createFileInfo = (type: "File" | "Directory", size = 100): FileSystem.File.Info => ({
  type,
  mtime: Option.some(new Date()),
  atime: Option.some(new Date()),
  birthtime: Option.some(new Date()),
  dev: 0,
  ino: Option.none(),
  mode: 0o644,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: FileSystem.Size(size),
  blksize: Option.none(),
  blocks: Option.none(),
})

const WORKSPACE = AbsolutePath("/workspace")

describe("convertToFileTreeEvent behavior", () => {
  it.effect("Create event for file emits addFile", () =>
    Effect.gen(function* () {
      const event = FileSystem.WatchEventCreate({ path: "/workspace/test.ts" })

      const result = yield* convertToFileTreeEvent(event, WORKSPACE)

      expect(result).not.toBeNull()
      expect(result?.kind).toBe("addFile")
      expect(result?.path).toBe("/workspace/test.ts")
    }).pipe(Effect.provide(createMockFileSystem({ statResult: () => createFileInfo("File") }))),
  )

  it.effect("Create event for directory emits addFolder", () =>
    Effect.gen(function* () {
      const event = FileSystem.WatchEventCreate({ path: "/workspace/src" })

      const result = yield* convertToFileTreeEvent(event, WORKSPACE)

      expect(result).not.toBeNull()
      expect(result?.kind).toBe("addFolder")
      expect(result?.path).toBe("/workspace/src")
    }).pipe(
      Effect.provide(createMockFileSystem({ statResult: () => createFileInfo("Directory") })),
    ),
  )

  it.effect("Update event for file emits contentChange", () =>
    Effect.gen(function* () {
      const event = FileSystem.WatchEventUpdate({ path: "/workspace/test.ts" })

      const result = yield* convertToFileTreeEvent(event, WORKSPACE)

      expect(result).not.toBeNull()
      expect(result?.kind).toBe("contentChange")
      expect(result?.path).toBe("/workspace/test.ts")
      if (result?.kind === "contentChange") {
        expect(result.content).toBe("file content")
      }
    }).pipe(
      Effect.provide(
        createMockFileSystem({
          statResult: () => createFileInfo("File"),
          readFileStringResult: () => "file content",
        }),
      ),
    ),
  )

  it.effect("Update event for directory returns null (skips)", () =>
    Effect.gen(function* () {
      const event = FileSystem.WatchEventUpdate({ path: "/workspace/src" })

      const result = yield* convertToFileTreeEvent(event, WORKSPACE)

      // Directories don't have content changes - should be skipped
      expect(result).toBeNull()
    }).pipe(
      Effect.provide(createMockFileSystem({ statResult: () => createFileInfo("Directory") })),
    ),
  )

  it.effect("Create event with stat error returns null (graceful skip)", () =>
    Effect.gen(function* () {
      const event = FileSystem.WatchEventCreate({
        path: "/workspace/deleted.ts",
      })

      const result = yield* convertToFileTreeEvent(event, WORKSPACE)

      // File was deleted between event and stat - should skip gracefully
      expect(result).toBeNull()
    }).pipe(
      Effect.provide(
        createMockFileSystem({
          statError: new PlatformError.SystemError({
            reason: "NotFound",
            module: "FileSystem",
            method: "stat",
            pathOrDescriptor: "/workspace/deleted.ts",
            cause: new Error("ENOENT"),
          }),
        }),
      ),
    ),
  )

  it.effect("temp file (.swp) returns null (filtered)", () =>
    Effect.gen(function* () {
      const event = FileSystem.WatchEventCreate({
        path: "/workspace/.test.swp",
      })

      const result = yield* convertToFileTreeEvent(event, WORKSPACE)

      expect(result).toBeNull()
    }).pipe(Effect.provide(createMockFileSystem({}))),
  )

  it.effect("path outside workspace returns null (filtered)", () =>
    Effect.gen(function* () {
      const event = FileSystem.WatchEventCreate({
        path: "/other/project/file.ts",
      })

      const result = yield* convertToFileTreeEvent(event, WORKSPACE)

      expect(result).toBeNull()
    }).pipe(Effect.provide(createMockFileSystem({}))),
  )

  it.effect("Windows-style paths are normalized correctly", () =>
    Effect.gen(function* () {
      // Simulate Windows: workspace has backslashes, event has backslashes
      const windowsWorkspace = AbsolutePath("D:\\a\\spacecake\\workspace")
      const event = FileSystem.WatchEventCreate({
        path: "D:\\a\\spacecake\\workspace\\test.ts",
      })

      const result = yield* convertToFileTreeEvent(event, windowsWorkspace)

      expect(result).not.toBeNull()
      expect(result?.kind).toBe("addFile")
      // Path should be normalized to forward slashes
      expect(result?.path).toBe("D:/a/spacecake/workspace/test.ts")
    }).pipe(Effect.provide(createMockFileSystem({ statResult: () => createFileInfo("File") }))),
  )

  it.effect("Remove event for file emits unlinkFile", () =>
    Effect.gen(function* () {
      const event = FileSystem.WatchEventRemove({
        path: "/workspace/deleted.ts",
      })

      const result = yield* convertToFileTreeEvent(event, WORKSPACE)

      expect(result).not.toBeNull()
      expect(result?.kind).toBe("unlinkFile")
      expect(result?.path).toBe("/workspace/deleted.ts")
    }).pipe(Effect.provide(createMockFileSystem({}))),
  )

  it.effect("Remove event for folder emits unlinkFolder", () =>
    Effect.gen(function* () {
      // No extension = treated as folder for Remove events
      const event = FileSystem.WatchEventRemove({
        path: "/workspace/old-folder",
      })

      const result = yield* convertToFileTreeEvent(event, WORKSPACE)

      expect(result).not.toBeNull()
      expect(result?.kind).toBe("unlinkFolder")
      expect(result?.path).toBe("/workspace/old-folder")
    }).pipe(Effect.provide(createMockFileSystem({}))),
  )
})
