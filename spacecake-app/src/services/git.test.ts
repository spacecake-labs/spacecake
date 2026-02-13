import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { describe, expect, vi, beforeEach } from "vitest"

import { FileSystem } from "@/services/file-system"
import { GitService } from "@/services/git"

// Mock simple-git
const mockCheckIsRepo = vi.fn()
const mockBranchLocal = vi.fn()
vi.mock("simple-git", () => ({
  default: () => ({
    checkIsRepo: mockCheckIsRepo,
    branchLocal: mockBranchLocal,
  }),
}))

describe("GitService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to being a git repo
    mockCheckIsRepo.mockResolvedValue(true)
    mockBranchLocal.mockResolvedValue({ current: "main" })
  })

  // Create mock FileSystem layer
  const createMockFileSystem = () => Layer.succeed(FileSystem, {} as unknown as FileSystem)

  // Use DefaultWithoutDependencies (built-in Effect.Service pattern for testing)
  const createTestLayer = () =>
    GitService.DefaultWithoutDependencies.pipe(Layer.provide(createMockFileSystem()))

  describe("isGitRepo", () => {
    it.effect("returns true when checkIsRepo returns true", () =>
      Effect.gen(function* () {
        mockCheckIsRepo.mockResolvedValue(true)
        const service = yield* GitService
        const result = yield* service.isGitRepo("/my/workspace")
        expect(result).toBe(true)
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns false when checkIsRepo returns false", () =>
      Effect.gen(function* () {
        mockCheckIsRepo.mockResolvedValue(false)
        const service = yield* GitService
        const result = yield* service.isGitRepo("/my/workspace")
        expect(result).toBe(false)
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns false when checkIsRepo throws", () =>
      Effect.gen(function* () {
        mockCheckIsRepo.mockRejectedValue(new Error("Not a git repo"))
        const service = yield* GitService
        const result = yield* service.isGitRepo("/my/workspace")
        expect(result).toBe(false)
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getCurrentBranch", () => {
    it.effect("returns the current branch name", () =>
      Effect.gen(function* () {
        mockBranchLocal.mockResolvedValue({ current: "feature-branch" })
        const service = yield* GitService
        const result = yield* service.getCurrentBranch("/my/workspace")
        expect(result).toBe("feature-branch")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })
})
