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
  let mockStartFileWatcher: ReturnType<typeof vi.fn>
  let mockStopFileWatcher: ReturnType<typeof vi.fn>
  let mockExists: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mocks to default success behavior
    mockStartFileWatcher = vi.fn(() => Effect.succeed(true))
    mockStopFileWatcher = vi.fn(() => Effect.succeed(true))
    mockExists = vi.fn(() => Effect.succeed(true)) // Default: .git/HEAD exists
    // Default to being a git repo
    mockCheckIsRepo.mockResolvedValue(true)
  })

  // Create mock FileSystem layer with current mock state
  const createMockFileSystem = () =>
    Layer.succeed(FileSystem, {
      startFileWatcher: (...args: unknown[]) => mockStartFileWatcher(...args),
      stopFileWatcher: (...args: unknown[]) => mockStopFileWatcher(...args),
      exists: (...args: unknown[]) => mockExists(...args),
    } as unknown as FileSystem)

  // Use DefaultWithoutDependencies (built-in Effect.Service pattern for testing)
  const createTestLayer = () =>
    GitService.DefaultWithoutDependencies.pipe(Layer.provide(createMockFileSystem()))

  describe("startWatching", () => {
    it.effect("calls FileSystem.startFileWatcher with correct git HEAD path and channel", () =>
      Effect.gen(function* () {
        const service = yield* GitService
        yield* service.startWatching("/my/workspace")

        expect(mockStartFileWatcher).toHaveBeenCalledTimes(1)
        expect(mockStartFileWatcher).toHaveBeenCalledWith(
          AbsolutePath("/my/workspace/.git/HEAD"),
          "git:branch:changed",
        )
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("transforms FileSystem errors into GitError", () => {
      // Configure mock to fail
      mockStartFileWatcher = vi.fn(() =>
        Effect.fail(new UnknownFSError({ description: "Watch failed" })),
      )

      return Effect.gen(function* () {
        const service = yield* GitService
        const result = yield* service.startWatching("/test/workspace").pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(GitError)
          expect(result.left.description).toBe("Failed to watch git HEAD")
          expect(result.left.cause).toBeDefined()
        }
      }).pipe(Effect.provide(createTestLayer()))
    })

    it.effect("does not start watcher when .git/HEAD does not exist", () => {
      // Configure mock to return false (.git/HEAD doesn't exist)
      mockExists = vi.fn(() => Effect.succeed(false))

      return Effect.gen(function* () {
        const service = yield* GitService
        yield* service.startWatching("/not/a/git/repo")

        // Should have checked if .git/HEAD exists
        expect(mockExists).toHaveBeenCalledWith(AbsolutePath("/not/a/git/repo/.git/HEAD"))
        // Should not have called the file watcher
        expect(mockStartFileWatcher).not.toHaveBeenCalled()
      }).pipe(Effect.provide(createTestLayer()))
    })
  })

  describe("stopWatching", () => {
    it.effect("calls FileSystem.stopFileWatcher with correct git HEAD path", () =>
      Effect.gen(function* () {
        const service = yield* GitService
        yield* service.stopWatching("/my/workspace")

        expect(mockStopFileWatcher).toHaveBeenCalledTimes(1)
        expect(mockStopFileWatcher).toHaveBeenCalledWith(AbsolutePath("/my/workspace/.git/HEAD"))
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("transforms FileSystem errors into GitError", () => {
      // Configure mock to fail
      mockStopFileWatcher = vi.fn(() =>
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
