import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { describe, expect, vi, beforeEach } from "vitest"

import { FileSystem } from "@/services/file-system"
import { classifyGitError, GitError, GitService } from "@/services/git"

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
vi.mock("simple-git", () => ({
  default: () => ({
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
  }),
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
    it.effect("returns mapped status fields including conflicted", () =>
      Effect.gen(function* () {
        mockStatus.mockResolvedValue({
          modified: ["a.ts"],
          not_added: ["b.ts"],
          staged: ["c.ts"],
          deleted: ["d.ts"],
          conflicted: ["e.ts"],
        })
        const service = yield* GitService
        const result = yield* service.getStatus("/my/workspace")
        expect(result.modified).toEqual(["a.ts"])
        expect(result.untracked).toEqual(["b.ts"])
        expect(result.staged).toEqual(["c.ts"])
        expect(result.deleted).toEqual(["d.ts"])
        expect(result.conflicted).toEqual(["e.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when status rejects", () =>
      Effect.gen(function* () {
        vi.spyOn(console, "error").mockImplementation(() => {})
        mockStatus.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.getStatus("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("deduplicates concurrent calls", () =>
      Effect.gen(function* () {
        let callCount = 0
        mockStatus.mockImplementation(async () => {
          callCount++
          await new Promise((r) => setTimeout(r, 50))
          return {
            modified: [],
            not_added: [],
            staged: [],
            deleted: [],
            conflicted: [],
          }
        })
        const service = yield* GitService
        // fire two concurrent getStatus calls
        const [r1, r2] = yield* Effect.all(
          [service.getStatus("/my/workspace"), service.getStatus("/my/workspace")],
          { concurrency: "unbounded" },
        )
        expect(r1).toEqual(r2)
        // only one actual git.status() call should have been made
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
    it.effect("calls git.push() directly when tracking branch exists", () =>
      Effect.gen(function* () {
        mockStatus.mockResolvedValue({ tracking: "origin/main", current: "main" })
        mockPush.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.push("/my/workspace")
        expect(mockPush).toHaveBeenCalledWith()
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("calls git.push with -u origin <branch> when no tracking branch", () =>
      Effect.gen(function* () {
        mockStatus.mockResolvedValue({ tracking: null, current: "feat" })
        mockPush.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.push("/my/workspace")
        expect(mockPush).toHaveBeenCalledWith(["-u", "origin", "feat"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when push rejects", () =>
      Effect.gen(function* () {
        mockStatus.mockResolvedValue({ tracking: "origin/main", current: "main" })
        mockPush.mockRejectedValue(new Error("boom"))
        const service = yield* GitService
        const error = yield* service.push("/my/workspace").pipe(Effect.flip)
        expect(error._tag).toBe("GitError")
      }).pipe(Effect.provide(createTestLayer())),
    )
  })

  describe("pull", () => {
    it.effect("calls git.pull()", () =>
      Effect.gen(function* () {
        mockPull.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.pull("/my/workspace")
        expect(mockPull).toHaveBeenCalled()
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
    it.effect("calls git.fetch with --all", () =>
      Effect.gen(function* () {
        mockFetch.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.fetchAll("/my/workspace")
        expect(mockFetch).toHaveBeenCalledWith(["--all"])
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
        mockStatus.mockResolvedValue({
          ahead: 2,
          behind: 1,
          tracking: "origin/main",
          current: "main",
        })
        const service = yield* GitService
        const result = yield* service.getRemoteStatus("/my/workspace")
        expect(result.ahead).toBe(2)
        expect(result.behind).toBe(1)
        expect(result.tracking).toBe("origin/main")
        expect(result.current).toBe("main")
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when status rejects", () =>
      Effect.gen(function* () {
        mockStatus.mockRejectedValue(new Error("boom"))
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
        mockStatus.mockResolvedValue({ not_added: ["untracked.ts"], modified: [] })
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
        mockStatus.mockResolvedValue({ not_added: [], modified: ["tracked.ts"] })
        mockCheckout.mockResolvedValue(undefined)
        const service = yield* GitService
        yield* service.discardFileChanges("/my/workspace", "tracked.ts")
        expect(mockReset).toHaveBeenCalledWith(["HEAD", "--", "tracked.ts"])
        expect(mockCheckout).toHaveBeenCalledWith(["--", "tracked.ts"])
      }).pipe(Effect.provide(createTestLayer())),
    )

    it.effect("fails with GitError when status rejects", () =>
      Effect.gen(function* () {
        mockStatus.mockRejectedValue(new Error("boom"))
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
        // either add then reset, or reset then add — but never interleaved
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
