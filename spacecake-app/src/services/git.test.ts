import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { describe, expect, vi, beforeEach } from "vitest"

import { FileSystem } from "@/services/file-system"
import { GitService } from "@/services/git"

// Mock simple-git
const mockCheckIsRepo = vi.fn()
const mockBranchLocal = vi.fn()
const mockRevparse = vi.fn()
const mockLog = vi.fn()
vi.mock("simple-git", () => ({
  default: () => ({
    checkIsRepo: mockCheckIsRepo,
    branchLocal: mockBranchLocal,
    revparse: mockRevparse,
    log: mockLog,
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

  describe("getCommitLog", () => {
    it.effect("returns empty array when repo has no commits", () =>
      Effect.gen(function* () {
        mockRevparse.mockRejectedValue(
          new Error("fatal: your current branch 'master' does not have any commits yet"),
        )
        const service = yield* GitService
        const result = yield* service.getCommitLog("/my/workspace")
        expect(result).toEqual([])
        expect(mockLog).not.toHaveBeenCalled()
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns commits when repo has commits", () =>
      Effect.gen(function* () {
        mockRevparse.mockResolvedValue("abc1234")
        mockLog.mockResolvedValue({
          all: [
            {
              hash: "abc1234",
              message: "initial commit",
              author_name: "user",
              date: "2024-01-01T00:00:00.000Z",
              diff: { files: [{ file: "src/index.ts" }] },
            },
          ],
        })
        const service = yield* GitService
        const result = yield* service.getCommitLog("/my/workspace", 10)
        expect(result).toHaveLength(1)
        expect(result[0].hash).toBe("abc1234")
        expect(result[0].files).toEqual(["src/index.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )
  })
})
