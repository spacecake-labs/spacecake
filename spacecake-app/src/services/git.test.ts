import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { describe, expect, vi, beforeEach } from "vitest"

import { FileSystem, UnknownFSError } from "@/services/file-system"
import { GitError, GitService } from "@/services/git"
import { AbsolutePath } from "@/types/workspace"

// Mock simple-git
const mockCheckIsRepo = vi.fn()
vi.mock("simple-git", () => ({
  default: () => ({
    checkIsRepo: mockCheckIsRepo,
    branchLocal: vi.fn(),
  }),
}))

describe("GitService", () => {
  // Mocks that can be configured per test
  let mockStartDirWatcher: ReturnType<typeof vi.fn>
  let mockStopDirWatcher: ReturnType<typeof vi.fn>
  let mockExists: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mocks to default success behavior
    mockStartDirWatcher = vi.fn(() => Effect.succeed(true))
    mockStopDirWatcher = vi.fn(() => Effect.succeed(true))
    mockExists = vi.fn(() => Effect.succeed(true)) // Default: .git exists
    // Default to being a git repo
    mockCheckIsRepo.mockResolvedValue(true)
  })

  // Create mock FileSystem layer with current mock state
  const createMockFileSystem = () =>
    Layer.succeed(FileSystem, {
      startDirWatcher: (...args: unknown[]) => mockStartDirWatcher(...args),
      stopDirWatcher: (...args: unknown[]) => mockStopDirWatcher(...args),
      exists: (...args: unknown[]) => mockExists(...args),
    } as unknown as FileSystem)

  // Use DefaultWithoutDependencies (built-in Effect.Service pattern for testing)
  const createTestLayer = () =>
    GitService.DefaultWithoutDependencies.pipe(Layer.provide(createMockFileSystem()))

  describe("startWatching", () => {
    it.effect("calls FileSystem.startDirWatcher with correct git directory path and channel", () =>
      Effect.gen(function* () {
        const service = yield* GitService
        yield* service.startWatching("/my/workspace")

        expect(mockStartDirWatcher).toHaveBeenCalledTimes(1)
        expect(mockStartDirWatcher).toHaveBeenCalledWith(
          AbsolutePath("/my/workspace/.git"),
          "git:changed",
          expect.any(Function),
        )
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("transforms FileSystem errors into GitError", () => {
      // Configure mock to fail
      mockStartDirWatcher = vi.fn(() =>
        Effect.fail(new UnknownFSError({ description: "Watch failed" })),
      )

      return Effect.gen(function* () {
        const service = yield* GitService
        const result = yield* service.startWatching("/test/workspace").pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GitError)
          expect(result.left.description).toBe("Failed to watch git directory")
          expect(result.left.cause).toBeDefined()
        }
      }).pipe(Effect.provide(createTestLayer()))
    })

    it.effect("does not start watcher when .git directory does not exist", () => {
      // Configure mock to return false (.git doesn't exist)
      mockExists = vi.fn(() => Effect.succeed(false))

      return Effect.gen(function* () {
        const service = yield* GitService
        yield* service.startWatching("/not/a/git/repo")

        // Should have checked if .git exists
        expect(mockExists).toHaveBeenCalledWith(AbsolutePath("/not/a/git/repo/.git"))
        // Should not have called the directory watcher
        expect(mockStartDirWatcher).not.toHaveBeenCalled()
      }).pipe(Effect.provide(createTestLayer()))
    })

    it.effect("filter function correctly identifies git state files", () =>
      Effect.gen(function* () {
        const service = yield* GitService
        yield* service.startWatching("/my/workspace")

        // Get the filter function that was passed to startDirWatcher
        const filterFn = mockStartDirWatcher.mock.calls[0][2] as (path: string) => boolean

        // Should match HEAD (branch switch)
        expect(filterFn("/my/workspace/.git/HEAD")).toBe(true)

        // Should match index (staging area)
        expect(filterFn("/my/workspace/.git/index")).toBe(true)

        // Should match refs (commits, branches, stash)
        expect(filterFn("/my/workspace/.git/refs/heads/main")).toBe(true)
        expect(filterFn("/my/workspace/.git/refs/remotes/origin/main")).toBe(true)
        expect(filterFn("/my/workspace/.git/refs/stash")).toBe(true)

        // Should not match other files
        expect(filterFn("/my/workspace/.git/config")).toBe(false)
        expect(filterFn("/my/workspace/.git/COMMIT_EDITMSG")).toBe(false)
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("stopWatching", () => {
    it.effect("calls FileSystem.stopDirWatcher with correct git directory path", () =>
      Effect.gen(function* () {
        const service = yield* GitService
        yield* service.stopWatching("/my/workspace")

        expect(mockStopDirWatcher).toHaveBeenCalledTimes(1)
        expect(mockStopDirWatcher).toHaveBeenCalledWith(AbsolutePath("/my/workspace/.git"))
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("transforms FileSystem errors into GitError", () => {
      // Configure mock to fail
      mockStopDirWatcher = vi.fn(() =>
        Effect.fail(new UnknownFSError({ description: "Stop failed" })),
      )

      return Effect.gen(function* () {
        const service = yield* GitService
        const result = yield* service.stopWatching("/test/workspace").pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GitError)
          expect(result.left.description).toBe("Failed to stop git watcher")
          expect(result.left.cause).toBeDefined()
        }
      }).pipe(Effect.provide(createTestLayer()))
    })
  })
})
