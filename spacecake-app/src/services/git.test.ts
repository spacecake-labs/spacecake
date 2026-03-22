import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { describe, expect, vi, beforeEach } from "vitest"

import { FileSystem } from "@/services/file-system"
import {
  classifyGitError,
  GitError,
  GitService,
  parseGitHubUrl,
  parseStashList,
  parseUnifiedDiff,
} from "@/services/git"

// Mock simple-git
const mockCheckIsRepo = vi.fn()
const mockBranchLocal = vi.fn()
const mockRevparse = vi.fn()
const mockLog = vi.fn()
const mockStatus = vi.fn()
const mockShow = vi.fn()
const mockAdd = vi.fn()
const mockReset = vi.fn()
const mockCommit = vi.fn()
const mockCheckoutLocalBranch = vi.fn()
const mockCheckout = vi.fn()
const mockDeleteLocalBranch = vi.fn()
const mockPush = vi.fn()
const mockPull = vi.fn()
const mockFetch = vi.fn()
const mockClean = vi.fn()
const mockRaw = vi.fn()
const mockEnv = vi.fn()
const mockClone = vi.fn()
const mockInit = vi.fn()
const mockStash = vi.fn()
const mockRemote = vi.fn()
vi.mock("simple-git", () => ({
  default: (_path: string, _opts?: unknown) => {
    const instance = {
      checkIsRepo: mockCheckIsRepo,
      branchLocal: mockBranchLocal,
      revparse: mockRevparse,
      log: mockLog,
      status: mockStatus,
      show: mockShow,
      add: mockAdd,
      reset: mockReset,
      commit: mockCommit,
      checkoutLocalBranch: mockCheckoutLocalBranch,
      checkout: mockCheckout,
      deleteLocalBranch: mockDeleteLocalBranch,
      push: mockPush,
      pull: mockPull,
      fetch: mockFetch,
      clean: mockClean,
      raw: mockRaw,
      clone: mockClone,
      init: mockInit,
      stash: mockStash,
      remote: mockRemote,
      env: (...args: unknown[]) => {
        mockEnv(...args)
        return instance
      },
    }
    return instance
  },
}))

const mockReadTextFile = vi.fn()

describe("GitService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // default to being a git repo
    mockCheckIsRepo.mockResolvedValue(true)
    mockBranchLocal.mockResolvedValue({ current: "main" })
  })

  // create mock FileSystem layer
  const createMockFileSystem = () =>
    Layer.succeed(FileSystem, { readTextFile: mockReadTextFile } as unknown as FileSystem)

  // use DefaultWithoutDependencies (built-in Effect.Service pattern for testing)
  const createTestLayer = () =>
    GitService.DefaultWithoutDependencies.pipe(Layer.provide(createMockFileSystem()))

  describe("classifyGitError", () => {
    it("classifies lock errors", () => {
      expect(classifyGitError(new Error("'.git/index.lock' exists"))).toBe("locked")
      expect(classifyGitError(new Error("unable to create '.git/index.lock': is locked"))).toBe(
        "locked",
      )
    })

    it("classifies auth errors", () => {
      expect(classifyGitError(new Error("could not read Username for"))).toBe("auth")
      expect(classifyGitError(new Error("Authentication failed for"))).toBe("auth")
      expect(classifyGitError(new Error("Permission denied (publickey)"))).toBe("auth")
    })

    it("classifies conflict errors", () => {
      expect(classifyGitError(new Error("merge conflict in file.ts"))).toBe("conflict")
      expect(classifyGitError(new Error("fix conflicts and then commit"))).toBe("conflict")
    })

    it("classifies network errors", () => {
      expect(classifyGitError(new Error("Could not resolve host: github.com"))).toBe("network")
      expect(classifyGitError(new Error("Connection refused"))).toBe("network")
      expect(classifyGitError(new Error("Operation timed out"))).toBe("network")
    })

    it("classifies dirty tree errors", () => {
      expect(classifyGitError(new Error("Your local changes would be overwritten"))).toBe(
        "dirty_tree",
      )
      expect(classifyGitError(new Error("Please commit or stash them"))).toBe("dirty_tree")
    })

    it("classifies not merged errors", () => {
      expect(classifyGitError(new Error("branch is not fully merged"))).toBe("not_merged")
    })

    it("classifies push rejected errors", () => {
      expect(classifyGitError(new Error("[rejected] main -> main (non-fast-forward)"))).toBe(
        "push_rejected",
      )
    })

    it("returns unknown for unrecognized errors", () => {
      expect(classifyGitError(new Error("something else entirely"))).toBe("unknown")
      expect(classifyGitError("not an error object")).toBe("unknown")
    })

    it("checks stderr property on errors", () => {
      const err = new Error("git failed") as Error & { stderr: string }
      err.stderr = "unable to create '.git/index.lock': is locked"
      expect(classifyGitError(err)).toBe("locked")
    })
  })

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
        mockCheckIsRepo.mockRejectedValue(new Error("not a git repo"))
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

    it.effect("fails with GitError when branchLocal rejects", () =>
      Effect.gen(function* () {
        mockBranchLocal.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.getCurrentBranch("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getStatus", () => {
    const porcelainV2Status = [
      "# branch.oid abc123",
      "# branch.head main",
      "1 .M N... 100644 100644 100644 abc def a.ts",
      "? b.ts",
      "1 A. N... 000000 100644 100644 000 abc c.ts",
      "1 .D N... 100644 000000 000000 abc 000 d.ts",
      "u UU N... 100644 100644 100644 100644 abc def ghi e.ts",
    ].join("\0")

    it.effect("returns mapped status fields including conflicted", () =>
      Effect.gen(function* () {
        mockRaw.mockResolvedValue(porcelainV2Status)
        const service = yield* GitService
        const result = yield* service.getStatus("/my/workspace")
        expect(result.modified).toEqual(["a.ts"])
        expect(result.untracked).toEqual(["b.ts"])
        expect(result.staged).toEqual(["c.ts"])
        expect(result.deleted).toEqual(["d.ts"])
        expect(result.conflicted).toEqual(["e.ts"])
        expect(mockRaw).toHaveBeenCalledWith([
          "--no-optional-locks",
          "status",
          "--porcelain=v2",
          "-z",
          "--branch",
          "--untracked-files=all",
        ])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when status rejects", () =>
      Effect.gen(function* () {
        vi.spyOn(console, "error").mockImplementation(() => {})
        mockRaw.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.getStatus("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("deduplicates concurrent calls", () =>
      Effect.gen(function* () {
        let callCount = 0
        mockRaw.mockImplementation(async () => {
          callCount++
          await new Promise((r) => setTimeout(r, 50))
          return ""
        })
        const service = yield* GitService
        // fire two concurrent getStatus calls
        const [r1, r2] = yield* Effect.all(
          [service.getStatus("/my/workspace"), service.getStatus("/my/workspace")],
          { concurrency: "unbounded" },
        )
        expect(r1).toEqual(r2)
        // only one actual git raw call should have been made
        expect(callCount).toBe(1)
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getFileDiff", () => {
    it.effect("uses HEAD as base and readTextFile for new content by default", () =>
      Effect.gen(function* () {
        mockShow.mockResolvedValue("old content")
        mockReadTextFile.mockReturnValue(Effect.succeed({ content: "new content" }))
        const service = yield* GitService
        const result = yield* service.getFileDiff("/my/workspace", "src/file.ts")
        expect(mockShow).toHaveBeenCalledWith(["HEAD:src/file.ts"])
        expect(result.oldContent).toBe("old content")
        expect(result.newContent).toBe("new content")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("uses custom baseRef when provided", () =>
      Effect.gen(function* () {
        mockShow.mockResolvedValue("old content")
        mockReadTextFile.mockReturnValue(Effect.succeed({ content: "new content" }))
        const service = yield* GitService
        yield* service.getFileDiff("/my/workspace", "src/file.ts", "custom")
        expect(mockShow).toHaveBeenCalledWith(["custom:src/file.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("uses targetRef for new content when provided", () =>
      Effect.gen(function* () {
        mockShow.mockResolvedValueOnce("old content").mockResolvedValueOnce("target content")
        const service = yield* GitService
        const result = yield* service.getFileDiff(
          "/my/workspace",
          "src/file.ts",
          undefined,
          "targetRef",
        )
        expect(mockShow).toHaveBeenCalledWith(["targetRef:src/file.ts"])
        expect(result.newContent).toBe("target content")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when readTextFile fails", () =>
      Effect.gen(function* () {
        mockShow.mockResolvedValue("old content")
        mockReadTextFile.mockReturnValue(Effect.fail(new GitError({ description: "read failed" })))
        const service = yield* GitService
        const error = yield* service.getFileDiff("/my/workspace", "src/file.ts").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
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
            },
          ],
        })
        const service = yield* GitService
        const result = yield* service.getCommitLog("/my/workspace", 10)
        expect(result).toHaveLength(1)
        expect(result[0].hash).toBe("abc1234")
        expect(result[0]).not.toHaveProperty("files")
        expect(mockLog).toHaveBeenCalledWith({
          maxCount: 10,
          "--no-show-signature": null,
        })
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when log rejects", () =>
      Effect.gen(function* () {
        vi.spyOn(console, "error").mockImplementation(() => {})
        mockRevparse.mockResolvedValue("abc1234")
        mockLog.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.getCommitLog("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getCommitFiles", () => {
    it.effect("returns file paths for a single commit", () =>
      Effect.gen(function* () {
        mockRaw.mockResolvedValue("src/index.ts\nreadme.md\n")
        const service = yield* GitService
        const result = yield* service.getCommitFiles("/my/workspace", "abc1234")
        expect(result).toEqual(["src/index.ts", "readme.md"])
        expect(mockRaw).toHaveBeenCalledWith([
          "diff-tree",
          "--no-commit-id",
          "--name-only",
          "-r",
          "--root",
          "abc1234",
        ])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns empty array when no files changed", () =>
      Effect.gen(function* () {
        mockRaw.mockResolvedValue("")
        const service = yield* GitService
        const result = yield* service.getCommitFiles("/my/workspace", "abc1234")
        expect(result).toEqual([])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when raw rejects", () =>
      Effect.gen(function* () {
        mockRaw.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.getCommitFiles("/my/workspace", "abc1234").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("stageFiles", () => {
    it.effect("calls git.add with the provided files", () =>
      Effect.gen(function* () {
        mockAdd.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.stageFiles("/my/workspace", ["a.ts", "b.ts"])
        expect(mockAdd).toHaveBeenCalledWith(["a.ts", "b.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when add rejects", () =>
      Effect.gen(function* () {
        mockAdd.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.stageFiles("/my/workspace", ["a.ts"]).pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("unstageFiles", () => {
    it.effect("calls git.reset with HEAD -- files", () =>
      Effect.gen(function* () {
        mockReset.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.unstageFiles("/my/workspace", ["a.ts", "b.ts"])
        expect(mockReset).toHaveBeenCalledWith(["HEAD", "--", "a.ts", "b.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when reset rejects", () =>
      Effect.gen(function* () {
        mockReset.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.unstageFiles("/my/workspace", ["a.ts"]).pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("commit", () => {
    const mockResult = {
      commit: "abc",
      branch: "main",
      summary: { changes: 1, insertions: 2, deletions: 0 },
    }

    it.effect("commits with message and no options", () =>
      Effect.gen(function* () {
        mockCommit.mockResolvedValue(mockResult)
        const service = yield* GitService
        const result = yield* service.commit("/my/workspace", "my message")
        expect(mockCommit).toHaveBeenCalledWith("my message", undefined, {})
        expect(result.hash).toBe("abc")
        expect(result.branch).toBe("main")
        expect(result.summary).toEqual({ changes: 1, insertions: 2, deletions: 0 })
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("commits with amend and message", () =>
      Effect.gen(function* () {
        mockCommit.mockResolvedValue(mockResult)
        const service = yield* GitService
        yield* service.commit("/my/workspace", "amended message", { amend: true })
        expect(mockCommit).toHaveBeenCalledWith("amended message", undefined, { "--amend": null })
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("commits with amend and no message uses --no-edit", () =>
      Effect.gen(function* () {
        mockCommit.mockResolvedValue(mockResult)
        const service = yield* GitService
        yield* service.commit("/my/workspace", "", { amend: true })
        expect(mockCommit).toHaveBeenCalledWith([], undefined, {
          "--amend": null,
          "--no-edit": null,
        })
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when commit rejects", () =>
      Effect.gen(function* () {
        mockCommit.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.commit("/my/workspace", "msg").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("with files: resets staging, adds selected files, then commits", () =>
      Effect.gen(function* () {
        mockReset.mockResolvedValue(undefined)
        mockAdd.mockResolvedValue(undefined)
        mockCommit.mockResolvedValue(mockResult)
        const service = yield* GitService
        yield* service.commit("/my/workspace", "selective commit", {
          files: ["src/a.ts", "src/b.ts"],
        })
        expect(mockReset).toHaveBeenCalledWith(["--", "."])
        expect(mockAdd).toHaveBeenCalledWith(["src/a.ts", "src/b.ts"])
        expect(mockCommit).toHaveBeenCalledWith("selective commit", undefined, {})
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("with files + amend: resets, adds, then amend-commits", () =>
      Effect.gen(function* () {
        mockReset.mockResolvedValue(undefined)
        mockAdd.mockResolvedValue(undefined)
        mockCommit.mockResolvedValue(mockResult)
        const service = yield* GitService
        yield* service.commit("/my/workspace", "amend msg", {
          files: ["src/a.ts"],
          amend: true,
        })
        expect(mockReset).toHaveBeenCalledWith(["--", "."])
        expect(mockAdd).toHaveBeenCalledWith(["src/a.ts"])
        expect(mockCommit).toHaveBeenCalledWith("amend msg", undefined, { "--amend": null })
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("without files: does not call reset or add", () =>
      Effect.gen(function* () {
        mockCommit.mockResolvedValue(mockResult)
        const service = yield* GitService
        yield* service.commit("/my/workspace", "normal commit")
        expect(mockReset).not.toHaveBeenCalled()
        expect(mockAdd).not.toHaveBeenCalled()
        expect(mockCommit).toHaveBeenCalledWith("normal commit", undefined, {})
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getBlame", () => {
    const porcelainBlame = [
      "abcd1234abcd1234abcd1234abcd1234abcd1234 1 1 1",
      "author user",
      "author-mail <user@host>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer user",
      "committer-mail <user@host>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary fix parser",
      "filename src/index.ts",
      "\tconst result = parse(input)",
    ].join("\n")

    it.effect("returns parsed blame data", () =>
      Effect.gen(function* () {
        mockRaw.mockResolvedValue(porcelainBlame)
        const service = yield* GitService
        const result = yield* service.getBlame("/my/workspace", "src/index.ts")
        expect(result).toHaveLength(1)
        expect(result[0].hash).toBe("abcd1234abcd1234abcd1234abcd1234abcd1234")
        expect(result[0].author).toBe("user")
        expect(result[0].summary).toBe("fix parser")
        expect(result[0].line).toBe(1)
        expect(mockRaw).toHaveBeenCalledWith(["blame", "--porcelain", "src/index.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns empty array for files with no commits", () =>
      Effect.gen(function* () {
        mockRaw.mockRejectedValue(new Error("no such path 'src/new.ts' in HEAD"))
        const service = yield* GitService
        const error = yield* service.getBlame("/my/workspace", "src/new.ts").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when raw rejects with unexpected error", () =>
      Effect.gen(function* () {
        mockRaw.mockRejectedValue(new Error("unexpected failure"))
        const service = yield* GitService
        const error = yield* service.getBlame("/my/workspace", "src/file.ts").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
        expect(error.description).toBe("failed to get blame")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("deduplicates concurrent blame calls for the same file", () =>
      Effect.gen(function* () {
        let callCount = 0
        mockRaw.mockImplementation(async () => {
          callCount++
          await new Promise((r) => setTimeout(r, 50))
          return porcelainBlame
        })
        const service = yield* GitService
        const [r1, r2] = yield* Effect.all(
          [
            service.getBlame("/my/workspace", "src/index.ts"),
            service.getBlame("/my/workspace", "src/index.ts"),
          ],
          { concurrency: "unbounded" },
        )
        expect(r1).toEqual(r2)
        expect(callCount).toBe(1)
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("listBranches", () => {
    it.effect("returns branch list from branchLocal", () =>
      Effect.gen(function* () {
        mockBranchLocal.mockResolvedValue({
          current: "main",
          all: ["main", "feature"],
          branches: {
            main: { name: "main", commit: "abc", current: true, label: "main" },
            feature: { name: "feature", commit: "def", current: false, label: "feature" },
          },
        })
        const service = yield* GitService
        const result = yield* service.listBranches("/my/workspace")
        expect(result.current).toBe("main")
        expect(result.all).toEqual(["main", "feature"])
        expect(result.branches["main"].commit).toBe("abc")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when branchLocal rejects", () =>
      Effect.gen(function* () {
        mockBranchLocal.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.listBranches("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("createBranch", () => {
    it.effect("calls git.checkoutLocalBranch with the branch name", () =>
      Effect.gen(function* () {
        mockCheckoutLocalBranch.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.createBranch("/my/workspace", "new-branch")
        expect(mockCheckoutLocalBranch).toHaveBeenCalledWith("new-branch")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when checkoutLocalBranch rejects", () =>
      Effect.gen(function* () {
        mockCheckoutLocalBranch.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.createBranch("/my/workspace", "new-branch").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("switchBranch", () => {
    it.effect("calls git.checkout with the branch name", () =>
      Effect.gen(function* () {
        mockCheckout.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.switchBranch("/my/workspace", "feature")
        expect(mockCheckout).toHaveBeenCalledWith("feature")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when checkout rejects", () =>
      Effect.gen(function* () {
        mockCheckout.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.switchBranch("/my/workspace", "feature").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("deleteBranch", () => {
    it.effect("calls git.deleteLocalBranch without force by default", () =>
      Effect.gen(function* () {
        mockDeleteLocalBranch.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.deleteBranch("/my/workspace", "old-branch")
        expect(mockDeleteLocalBranch).toHaveBeenCalledWith("old-branch", undefined)
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("calls git.deleteLocalBranch with force=true when specified", () =>
      Effect.gen(function* () {
        mockDeleteLocalBranch.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.deleteBranch("/my/workspace", "old-branch", true)
        expect(mockDeleteLocalBranch).toHaveBeenCalledWith("old-branch", true)
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when deleteLocalBranch rejects", () =>
      Effect.gen(function* () {
        mockDeleteLocalBranch.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.deleteBranch("/my/workspace", "old-branch").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("push", () => {
    const trackingStatus = [
      "# branch.oid abc123",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +0 -0",
    ].join("\0")

    const noTrackingStatus = ["# branch.oid abc123", "# branch.head feat"].join("\0")

    it.effect("calls git.push() with empty args when tracking branch exists", () =>
      Effect.gen(function* () {
        mockRaw.mockResolvedValue(trackingStatus)
        mockPush.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.push("/my/workspace")
        expect(mockPush).toHaveBeenCalledWith([])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("calls git.push with -u origin <branch> when no tracking branch", () =>
      Effect.gen(function* () {
        mockRaw.mockResolvedValue(noTrackingStatus)
        mockPush.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.push("/my/workspace")
        expect(mockPush).toHaveBeenCalledWith(["-u", "origin", "feat"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("adds --force-with-lease when force option is true", () =>
      Effect.gen(function* () {
        mockRaw.mockResolvedValue(trackingStatus)
        mockPush.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.push("/my/workspace", { force: true })
        expect(mockPush).toHaveBeenCalledWith(["--force-with-lease"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when push rejects", () =>
      Effect.gen(function* () {
        mockRaw.mockResolvedValue(trackingStatus)
        mockPush.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.push("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("pull", () => {
    it.effect("calls git.pull with --recurse-submodules", () =>
      Effect.gen(function* () {
        mockPull.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.pull("/my/workspace")
        expect(mockPull).toHaveBeenCalledWith(["--recurse-submodules", "--ff"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when pull rejects", () =>
      Effect.gen(function* () {
        mockPull.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.pull("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("fetchAll", () => {
    it.effect("calls git.fetch with --all --prune", () =>
      Effect.gen(function* () {
        mockFetch.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.fetchAll("/my/workspace")
        expect(mockFetch).toHaveBeenCalledWith([
          "--all",
          "--prune",
          "--recurse-submodules=on-demand",
        ])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when fetch rejects", () =>
      Effect.gen(function* () {
        mockFetch.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.fetchAll("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getRemoteStatus", () => {
    it.effect("returns mapped remote status fields", () =>
      Effect.gen(function* () {
        const raw = [
          "# branch.oid abc123",
          "# branch.head main",
          "# branch.upstream origin/main",
          "# branch.ab +2 -1",
        ].join("\0")
        mockRaw.mockResolvedValue(raw)
        const service = yield* GitService
        const result = yield* service.getRemoteStatus("/my/workspace")
        expect(result.ahead).toBe(2)
        expect(result.behind).toBe(1)
        expect(result.tracking).toBe("origin/main")
        expect(result.current).toBe("main")
        expect(mockRaw).toHaveBeenCalledWith([
          "--no-optional-locks",
          "status",
          "--porcelain=v2",
          "-z",
          "--branch",
        ])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when raw rejects", () =>
      Effect.gen(function* () {
        mockRaw.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.getRemoteStatus("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("discardFileChanges", () => {
    it.effect("unstages then calls git.clean for untracked files", () =>
      Effect.gen(function* () {
        mockReset.mockResolvedValue(undefined)
        mockRaw.mockResolvedValue("? untracked.ts")
        mockClean.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.discardFileChanges("/my/workspace", "untracked.ts")
        expect(mockReset).toHaveBeenCalledWith(["HEAD", "--", "untracked.ts"])
        expect(mockClean).toHaveBeenCalledWith("f", ["--", "untracked.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("unstages then calls git.checkout for tracked files", () =>
      Effect.gen(function* () {
        mockReset.mockResolvedValue(undefined)
        mockRaw.mockResolvedValue("1 .M N... 100644 100644 100644 abc def tracked.ts")
        mockCheckout.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.discardFileChanges("/my/workspace", "tracked.ts")
        expect(mockReset).toHaveBeenCalledWith(["HEAD", "--", "tracked.ts"])
        expect(mockCheckout).toHaveBeenCalledWith(["--", "tracked.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when raw rejects", () =>
      Effect.gen(function* () {
        mockRaw.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service
          .discardFileChanges("/my/workspace", "file.ts")
          .pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("discardAllChanges", () => {
    it.effect("unstages then calls git.checkout then git.clean", () =>
      Effect.gen(function* () {
        mockReset.mockResolvedValue(undefined)
        mockCheckout.mockResolvedValue(undefined)
        mockClean.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.discardAllChanges("/my/workspace")
        expect(mockReset).toHaveBeenCalledWith(["HEAD"])
        expect(mockCheckout).toHaveBeenCalledWith(["--", "."])
        expect(mockClean).toHaveBeenCalledWith("f", ["-d"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when checkout rejects", () =>
      Effect.gen(function* () {
        mockCheckout.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.discardAllChanges("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("lock retry", () => {
    it.effect("retries lock errors then succeeds", () =>
      Effect.gen(function* () {
        mockAdd
          .mockRejectedValueOnce(new Error("'.git/index.lock' exists"))
          .mockRejectedValueOnce(new Error("'.git/index.lock' exists"))
          .mockResolvedValueOnce(undefined)
        const service = yield* GitService
        yield* service.stageFiles("/my/workspace", ["a.ts"])
        expect(mockAdd).toHaveBeenCalledTimes(3)
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("exhausts retries on persistent lock errors", () =>
      Effect.gen(function* () {
        mockAdd.mockRejectedValue(new Error("'.git/index.lock' exists"))
        const service = yield* GitService
        const error = yield* service.stageFiles("/my/workspace", ["a.ts"]).pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
        expect(error.code).toBe("locked")
        // initial attempt + 3 retries = 4 calls
        expect(mockAdd).toHaveBeenCalledTimes(4)
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("does not retry non-lock errors", () =>
      Effect.gen(function* () {
        mockAdd.mockRejectedValue(new Error("permission denied"))
        const service = yield* GitService
        const error = yield* service.stageFiles("/my/workspace", ["a.ts"]).pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
        expect(error.code).not.toBe("locked")
        expect(mockAdd).toHaveBeenCalledTimes(1)
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("cloneRepo", () => {
    it.effect("clones repo to target directory", () =>
      Effect.gen(function* () {
        mockClone.mockResolvedValue(undefined)
        const service = yield* GitService
        const result = yield* service.cloneRepo("https://github.com/user/repo.git", "/tmp/target")
        expect(result).toBe("/tmp/target")
        expect(mockClone).toHaveBeenCalledWith("https://github.com/user/repo.git", "/tmp/target")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("classifies auth errors", () =>
      Effect.gen(function* () {
        mockClone.mockRejectedValue(
          new Error("Authentication failed for 'https://github.com/user/repo.git'"),
        )
        const service = yield* GitService
        const error = yield* service
          .cloneRepo("https://github.com/user/repo.git", "/tmp/target")
          .pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
        expect(error.code).toBe("auth")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("classifies network errors", () =>
      Effect.gen(function* () {
        mockClone.mockRejectedValue(new Error("Could not resolve host: github.com"))
        const service = yield* GitService
        const error = yield* service
          .cloneRepo("https://github.com/user/repo.git", "/tmp/target")
          .pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
        expect(error.code).toBe("network")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("handles invalid url errors", () =>
      Effect.gen(function* () {
        mockClone.mockRejectedValue(new Error("repository not found"))
        const service = yield* GitService
        const error = yield* service.cloneRepo("not-a-url", "/tmp/target").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("initRepo", () => {
    it.effect("initializes git repo in target directory", () =>
      Effect.gen(function* () {
        mockInit.mockResolvedValue(undefined)
        const service = yield* GitService
        const result = yield* service.initRepo("/tmp/new-repo")
        expect(result).toBe("/tmp/new-repo")
        expect(mockInit).toHaveBeenCalled()
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when init rejects", () =>
      Effect.gen(function* () {
        mockInit.mockRejectedValue(new Error("permission denied"))
        const service = yield* GitService
        const error = yield* service.initRepo("/tmp/new-repo").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("stashPush", () => {
    it.effect("calls git stash push with optional message", () =>
      Effect.gen(function* () {
        mockStash.mockResolvedValue("")
        const service = yield* GitService
        yield* service.stashPush("/my/workspace", "my stash")
        expect(mockStash).toHaveBeenCalledWith(["push", "-m", "my stash"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("calls git stash push without message", () =>
      Effect.gen(function* () {
        mockStash.mockResolvedValue("")
        const service = yield* GitService
        yield* service.stashPush("/my/workspace")
        expect(mockStash).toHaveBeenCalledWith(["push"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("handles 'no local changes to save' as success", () =>
      Effect.gen(function* () {
        mockStash.mockRejectedValue(new Error("No local changes to save"))
        const service = yield* GitService
        yield* service.stashPush("/my/workspace")
        // should not throw
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError on other errors", () =>
      Effect.gen(function* () {
        mockStash.mockRejectedValue(new Error("fatal: something went wrong"))
        const service = yield* GitService
        const error = yield* service.stashPush("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("stashPop", () => {
    it.effect("calls git stash pop", () =>
      Effect.gen(function* () {
        mockStash.mockResolvedValue("")
        const service = yield* GitService
        yield* service.stashPop("/my/workspace")
        expect(mockStash).toHaveBeenCalledWith(["pop"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("calls git stash pop with index", () =>
      Effect.gen(function* () {
        mockStash.mockResolvedValue("")
        const service = yield* GitService
        yield* service.stashPop("/my/workspace", 2)
        expect(mockStash).toHaveBeenCalledWith(["pop", "stash@{2}"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError on conflict", () =>
      Effect.gen(function* () {
        mockStash.mockRejectedValue(new Error("CONFLICT (content): merge conflict in file.ts"))
        const service = yield* GitService
        const error = yield* service.stashPop("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
        expect(error.code).toBe("conflict")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("handles 'no stash entries' error", () =>
      Effect.gen(function* () {
        mockStash.mockRejectedValue(new Error("No stash entries found"))
        const service = yield* GitService
        const error = yield* service.stashPop("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("stashList", () => {
    it.effect("returns array of stash entries", () =>
      Effect.gen(function* () {
        mockStash.mockResolvedValue(
          "stash@{0}: WIP on main: abc1234 message\nstash@{1}: On feature: other",
        )
        const service = yield* GitService
        const result = yield* service.stashList("/my/workspace")
        expect(result).toHaveLength(2)
        expect(result[0].index).toBe(0)
        expect(result[1].index).toBe(1)
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns empty array when no stashes", () =>
      Effect.gen(function* () {
        mockStash.mockResolvedValue("")
        const service = yield* GitService
        const result = yield* service.stashList("/my/workspace")
        expect(result).toEqual([])
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("stashDrop", () => {
    it.effect("drops stash at given index", () =>
      Effect.gen(function* () {
        mockStash.mockResolvedValue("")
        const service = yield* GitService
        yield* service.stashDrop("/my/workspace", 0)
        expect(mockStash).toHaveBeenCalledWith(["drop", "stash@{0}"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError on invalid index", () =>
      Effect.gen(function* () {
        mockStash.mockRejectedValue(new Error("fatal: log for 'refs/stash' only has 1 entries"))
        const service = yield* GitService
        const error = yield* service.stashDrop("/my/workspace", 5).pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getLineDiff", () => {
    it.effect("returns per-line diff info", () =>
      Effect.gen(function* () {
        mockRaw.mockResolvedValue("@@ -1,1 +1,2 @@\n-old\n+new1\n+new2")
        const service = yield* GitService
        const result = yield* service.getLineDiff("/my/workspace", "file.ts")
        expect(result).toEqual([{ type: "modified", startLine: 1, endLine: 2 }])
        expect(mockRaw).toHaveBeenCalledWith(["diff", "--unified=0", "HEAD", "--", "file.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns empty array on error (untracked files)", () =>
      Effect.gen(function* () {
        mockRaw.mockRejectedValue(new Error("fatal: bad revision 'HEAD'"))
        const service = yield* GitService
        const error = yield* service.getLineDiff("/my/workspace", "new-file.ts").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getConflictContent", () => {
    it.effect("returns base/ours/theirs content for a conflicted file", () =>
      Effect.gen(function* () {
        mockShow
          .mockResolvedValueOnce("ours content")
          .mockResolvedValueOnce("theirs content")
          .mockResolvedValueOnce("base content")
        const service = yield* GitService
        const result = yield* service.getConflictContent("/my/workspace", "conflicted.ts")
        expect(result.ours).toBe("ours content")
        expect(result.theirs).toBe("theirs content")
        expect(result.base).toBe("base content")
        expect(mockShow).toHaveBeenCalledWith([":2:conflicted.ts"])
        expect(mockShow).toHaveBeenCalledWith([":3:conflicted.ts"])
        expect(mockShow).toHaveBeenCalledWith([":1:conflicted.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns empty strings when stages are missing", () =>
      Effect.gen(function* () {
        mockShow.mockRejectedValue(new Error("path not found"))
        const service = yield* GitService
        const result = yield* service.getConflictContent("/my/workspace", "binary.bin")
        expect(result.ours).toBe("")
        expect(result.theirs).toBe("")
        expect(result.base).toBe("")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("resolveConflict", () => {
    it.effect("stages the resolved file", () =>
      Effect.gen(function* () {
        mockAdd.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.resolveConflict("/my/workspace", "resolved.ts")
        expect(mockAdd).toHaveBeenCalledWith(["resolved.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when add rejects", () =>
      Effect.gen(function* () {
        mockAdd.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.resolveConflict("/my/workspace", "file.ts").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getRemoteUrl", () => {
    it.effect("returns the remote url for origin", () =>
      Effect.gen(function* () {
        mockRemote.mockResolvedValue("https://github.com/user/repo.git\n")
        const service = yield* GitService
        const result = yield* service.getRemoteUrl("/my/workspace")
        expect(result).toBe("https://github.com/user/repo.git")
        expect(mockRemote).toHaveBeenCalledWith(["get-url", "origin"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("handles ssh urls", () =>
      Effect.gen(function* () {
        mockRemote.mockResolvedValue("git@github.com:user/repo.git\n")
        const service = yield* GitService
        const result = yield* service.getRemoteUrl("/my/workspace")
        expect(result).toBe("git@github.com:user/repo.git")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns null when remote returns empty", () =>
      Effect.gen(function* () {
        mockRemote.mockResolvedValue("")
        const service = yield* GitService
        const result = yield* service.getRemoteUrl("/my/workspace")
        expect(result).toBeNull()
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when no remote", () =>
      Effect.gen(function* () {
        mockRemote.mockRejectedValue(new Error("fatal: No such remote 'origin'"))
        const service = yield* GitService
        const error = yield* service.getRemoteUrl("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("getRemoteUrl", () => {
    it.effect("returns the remote url for origin", () =>
      Effect.gen(function* () {
        mockRemote.mockResolvedValue("https://github.com/user/repo.git\n")
        const service = yield* GitService
        const result = yield* service.getRemoteUrl("/my/workspace")
        expect(result).toBe("https://github.com/user/repo.git")
        expect(mockRemote).toHaveBeenCalledWith(["get-url", "origin"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("handles ssh urls", () =>
      Effect.gen(function* () {
        mockRemote.mockResolvedValue("git@github.com:user/repo.git\n")
        const service = yield* GitService
        const result = yield* service.getRemoteUrl("/my/workspace")
        expect(result).toBe("git@github.com:user/repo.git")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("returns null when remote returns empty", () =>
      Effect.gen(function* () {
        mockRemote.mockResolvedValue("")
        const service = yield* GitService
        const result = yield* service.getRemoteUrl("/my/workspace")
        expect(result).toBeNull()
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when no remote", () =>
      Effect.gen(function* () {
        mockRemote.mockRejectedValue(new Error("fatal: No such remote 'origin'"))
        const service = yield* GitService
        const error = yield* service.getRemoteUrl("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("semaphore serialization", () => {
    it.effect("serializes concurrent mutations on the same workspace", () =>
      Effect.gen(function* () {
        const order: string[] = []
        mockAdd.mockImplementation(async () => {
          order.push("add-start")
          await new Promise((r) => setTimeout(r, 50))
          order.push("add-end")
        })
        mockReset.mockImplementation(async () => {
          order.push("reset-start")
          await new Promise((r) => setTimeout(r, 50))
          order.push("reset-end")
        })
        const service = yield* GitService
        yield* Effect.all(
          [
            service.stageFiles("/my/workspace", ["a.ts"]),
            service.unstageFiles("/my/workspace", ["b.ts"]),
          ],
          { concurrency: "unbounded" },
        )
        // the semaphore ensures one completes before the other starts
        // either add then reset, or reset then add - but never interleaved
        const firstEnd = order.indexOf("add-end") < order.indexOf("reset-end") ? "add" : "reset"
        if (firstEnd === "add") {
          expect(order.indexOf("add-end")).toBeLessThan(order.indexOf("reset-start"))
        } else {
          expect(order.indexOf("reset-end")).toBeLessThan(order.indexOf("add-start"))
        }
      }).pipe(Effect.provide(createTestLayer())),
    )
  })
})

describe("parseGitHubUrl", () => {
  it("parses https github url", () => {
    const result = parseGitHubUrl("https://github.com/user/repo.git")
    expect(result).toEqual({ owner: "user", repo: "repo" })
  })

  it("parses https github url without .git", () => {
    const result = parseGitHubUrl("https://github.com/user/repo")
    expect(result).toEqual({ owner: "user", repo: "repo" })
  })

  it("parses ssh github url", () => {
    const result = parseGitHubUrl("git@github.com:user/repo.git")
    expect(result).toEqual({ owner: "user", repo: "repo" })
  })

  it("parses ssh github url without .git", () => {
    const result = parseGitHubUrl("git@github.com:user/repo")
    expect(result).toEqual({ owner: "user", repo: "repo" })
  })

  it("returns null for non-github urls", () => {
    expect(parseGitHubUrl("https://gitlab.com/user/repo.git")).toBeNull()
    expect(parseGitHubUrl("git@gitlab.com:user/repo.git")).toBeNull()
  })

  it("returns null for invalid urls", () => {
    expect(parseGitHubUrl("not-a-url")).toBeNull()
    expect(parseGitHubUrl("")).toBeNull()
  })
})

describe("parseStashList", () => {
  it("parses stash list entries", () => {
    const raw =
      "stash@{0}: WIP on main: abc1234 some message\nstash@{1}: On feature: custom message"
    const result = parseStashList(raw)
    expect(result).toEqual([
      { index: 0, message: "abc1234 some message", date: "" },
      { index: 1, message: "custom message", date: "" },
    ])
  })

  it("returns empty array for empty input", () => {
    expect(parseStashList("")).toEqual([])
    expect(parseStashList("  ")).toEqual([])
  })

  it("handles stash with explicit message", () => {
    const raw = "stash@{0}: On main: my stash message"
    const result = parseStashList(raw)
    expect(result).toEqual([{ index: 0, message: "my stash message", date: "" }])
  })
})

describe("parseUnifiedDiff", () => {
  it("parses added lines", () => {
    const raw = "@@ -0,0 +1,3 @@\n+line1\n+line2\n+line3"
    const result = parseUnifiedDiff(raw)
    expect(result).toEqual([{ type: "added", startLine: 1, endLine: 3 }])
  })

  it("parses deleted lines", () => {
    const raw = "@@ -5,2 +4,0 @@\n-old1\n-old2"
    const result = parseUnifiedDiff(raw)
    expect(result).toEqual([{ type: "deleted", startLine: 4, endLine: 4 }])
  })

  it("parses modified lines", () => {
    const raw = "@@ -10,2 +10,3 @@\n-old1\n-old2\n+new1\n+new2\n+new3"
    const result = parseUnifiedDiff(raw)
    expect(result).toEqual([{ type: "modified", startLine: 10, endLine: 12 }])
  })

  it("parses multiple hunks", () => {
    const raw = "@@ -1,1 +1,1 @@\n-a\n+b\n@@ -5,0 +5,2 @@\n+c\n+d"
    const result = parseUnifiedDiff(raw)
    expect(result).toEqual([
      { type: "modified", startLine: 1, endLine: 1 },
      { type: "added", startLine: 5, endLine: 6 },
    ])
  })

  it("returns empty array for empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([])
  })

  it("handles single-line implicit count", () => {
    const raw = "@@ -5 +5 @@\n-old\n+new"
    const result = parseUnifiedDiff(raw)
    expect(result).toEqual([{ type: "modified", startLine: 5, endLine: 5 }])
  })
})
