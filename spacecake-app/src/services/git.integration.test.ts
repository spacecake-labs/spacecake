import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import simpleGit from "simple-git"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FileSystem } from "@/services/file-system"
import { GitService } from "@/services/git"

// integration tests that run against a real git repo in a temp directory

// mock filesystem for getFileDiff — returns file content from disk
const mockFileSystem = {
  readTextFile: (filePath: string) =>
    Effect.try(() => ({ content: fs.readFileSync(filePath, "utf-8") })),
} as unknown as FileSystem
const fileSystemLayer = Layer.succeed(FileSystem, mockFileSystem)

// stub filesystem — discard/commit operations use simple-git directly
const stubFileSystem = Layer.succeed(FileSystem, {} as unknown as FileSystem)
const testLayer = GitService.DefaultWithoutDependencies.pipe(Layer.provide(stubFileSystem))
const testLayerWithFs = GitService.DefaultWithoutDependencies.pipe(Layer.provide(fileSystemLayer))

describe("git service integration", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spacecake-git-test-"))
    const git = simpleGit(tmpDir)
    await git.init()
    await git.addConfig("user.email", "test@test.com")
    await git.addConfig("user.name", "test")

    // create initial commit so HEAD exists
    fs.writeFileSync(path.join(tmpDir, "initial.txt"), "initial content")
    await git.add("initial.txt")
    await git.commit("initial commit")
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const runEffect = <A>(effect: Effect.Effect<A, unknown, GitService>) =>
    Effect.runPromise(effect.pipe(Effect.provide(testLayer)))

  describe("discardFileChanges", () => {
    it("restores a modified tracked file to its committed state", async () => {
      const filePath = path.join(tmpDir, "initial.txt")
      fs.writeFileSync(filePath, "modified content")

      await runEffect(
        Effect.gen(function* () {
          const git = yield* GitService
          yield* git.discardFileChanges(tmpDir, "initial.txt")
        }),
      )

      expect(fs.readFileSync(filePath, "utf-8")).toBe("initial content")
    })

    it("restores a staged modified file to its committed state", async () => {
      const filePath = path.join(tmpDir, "initial.txt")
      fs.writeFileSync(filePath, "staged modification")
      const git = simpleGit(tmpDir)
      await git.add("initial.txt")

      await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          yield* svc.discardFileChanges(tmpDir, "initial.txt")
        }),
      )

      expect(fs.readFileSync(filePath, "utf-8")).toBe("initial content")

      // file should no longer appear in status
      const status = await git.status()
      expect(status.staged).not.toContain("initial.txt")
      expect(status.modified).not.toContain("initial.txt")
    })

    it("removes an untracked file", async () => {
      const filePath = path.join(tmpDir, "new-file.txt")
      fs.writeFileSync(filePath, "new content")

      await runEffect(
        Effect.gen(function* () {
          const git = yield* GitService
          yield* git.discardFileChanges(tmpDir, "new-file.txt")
        }),
      )

      expect(fs.existsSync(filePath)).toBe(false)
    })

    it("removes a staged new file", async () => {
      const filePath = path.join(tmpDir, "staged-new.txt")
      fs.writeFileSync(filePath, "staged new content")
      const git = simpleGit(tmpDir)
      await git.add("staged-new.txt")

      await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          yield* svc.discardFileChanges(tmpDir, "staged-new.txt")
        }),
      )

      expect(fs.existsSync(filePath)).toBe(false)
    })
  })

  describe("discardAllChanges", () => {
    it("restores all modified files and removes untracked files", async () => {
      const trackedPath = path.join(tmpDir, "initial.txt")
      const untrackedPath = path.join(tmpDir, "untracked.txt")

      fs.writeFileSync(trackedPath, "modified")
      fs.writeFileSync(untrackedPath, "new file")

      await runEffect(
        Effect.gen(function* () {
          const git = yield* GitService
          yield* git.discardAllChanges(tmpDir)
        }),
      )

      expect(fs.readFileSync(trackedPath, "utf-8")).toBe("initial content")
      expect(fs.existsSync(untrackedPath)).toBe(false)
    })

    it("restores staged files and removes staged new files", async () => {
      const trackedPath = path.join(tmpDir, "initial.txt")
      const newPath = path.join(tmpDir, "staged-new.txt")
      const git = simpleGit(tmpDir)

      fs.writeFileSync(trackedPath, "staged change")
      fs.writeFileSync(newPath, "staged new content")
      await git.add(["initial.txt", "staged-new.txt"])

      await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          yield* svc.discardAllChanges(tmpDir)
        }),
      )

      expect(fs.readFileSync(trackedPath, "utf-8")).toBe("initial content")
      expect(fs.existsSync(newPath)).toBe(false)

      const status = await git.status()
      expect(status.staged.length).toBe(0)
      expect(status.modified.length).toBe(0)
      expect(status.not_added.length).toBe(0)
    })
  })

  describe("getStatus", () => {
    it("returns modified, untracked, staged, and deleted files", async () => {
      const git = simpleGit(tmpDir)

      // create various file states
      fs.writeFileSync(path.join(tmpDir, "initial.txt"), "modified content")
      fs.writeFileSync(path.join(tmpDir, "untracked.txt"), "new file")
      fs.writeFileSync(path.join(tmpDir, "staged.txt"), "staged content")
      await git.add("staged.txt")

      const status = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getStatus(tmpDir)
        }),
      )

      expect(status.modified).toContain("initial.txt")
      expect(status.untracked).toContain("untracked.txt")
      expect(status.staged).toContain("staged.txt")
    })

    it("returns empty arrays for clean repo", async () => {
      const status = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getStatus(tmpDir)
        }),
      )

      expect(status.modified).toEqual([])
      expect(status.staged).toEqual([])
      expect(status.untracked).toEqual([])
      expect(status.deleted).toEqual([])
      expect(status.conflicted).toEqual([])
    })

    it("detects deleted files", async () => {
      fs.unlinkSync(path.join(tmpDir, "initial.txt"))

      const status = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getStatus(tmpDir)
        }),
      )

      expect(status.deleted).toContain("initial.txt")
    })
  })

  describe("getCommitLog", () => {
    it("returns commits with files", async () => {
      const commits = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getCommitLog(tmpDir)
        }),
      )

      expect(commits.length).toBe(1)
      expect(commits[0].message).toBe("initial commit")
      expect(commits[0].hash).toBeTruthy()
      expect(commits[0].date).toBeInstanceOf(Date)

      // files are now fetched separately via getCommitFiles
      const files = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getCommitFiles(tmpDir, commits[0].hash)
        }),
      )
      expect(files).toContain("initial.txt")
    })

    it("respects limit parameter", async () => {
      const git = simpleGit(tmpDir)
      fs.writeFileSync(path.join(tmpDir, "second.txt"), "second")
      await git.add("second.txt")
      await git.commit("second commit")

      const commits = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getCommitLog(tmpDir, 1)
        }),
      )

      expect(commits.length).toBe(1)
      expect(commits[0].message).toBe("second commit")
    })

    it("returns empty array for repo with no commits", async () => {
      // create a fresh repo with no commits
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "spacecake-git-empty-"))
      const git = simpleGit(emptyDir)
      await git.init()

      const commits = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getCommitLog(emptyDir)
        }),
      )

      expect(commits).toEqual([])
      fs.rmSync(emptyDir, { recursive: true, force: true })
    })
  })

  describe("getFileDiff", () => {
    const runWithFs = <A>(effect: Effect.Effect<A, unknown, GitService>) =>
      Effect.runPromise(effect.pipe(Effect.provide(testLayerWithFs)))

    it("returns old and new content for a modified file", async () => {
      fs.writeFileSync(path.join(tmpDir, "initial.txt"), "modified content")

      const diff = await runWithFs(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getFileDiff(tmpDir, "initial.txt")
        }),
      )

      expect(diff.oldContent).toBe("initial content")
      expect(diff.newContent).toBe("modified content")
    })

    it("returns empty old content for a new file", async () => {
      fs.writeFileSync(path.join(tmpDir, "brand-new.txt"), "brand new")

      const diff = await runWithFs(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getFileDiff(tmpDir, "brand-new.txt")
        }),
      )

      expect(diff.oldContent).toBe("")
      expect(diff.newContent).toBe("brand new")
    })

    it("compares between two refs when both provided", async () => {
      const git = simpleGit(tmpDir)

      // make a second commit with modified content
      fs.writeFileSync(path.join(tmpDir, "initial.txt"), "second version")
      await git.add("initial.txt")
      await git.commit("second commit")

      const log = await git.log({ maxCount: 2 })
      const oldHash = log.all[1].hash
      const newHash = log.all[0].hash

      const diff = await runWithFs(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getFileDiff(tmpDir, "initial.txt", oldHash, newHash)
        }),
      )

      expect(diff.oldContent).toBe("initial content")
      expect(diff.newContent).toBe("second version")
    })
  })

  describe("branch operations", () => {
    let defaultBranch: string

    beforeEach(async () => {
      const git = simpleGit(tmpDir)
      defaultBranch = (await git.branchLocal()).current
    })

    it("creates and lists branches", async () => {
      await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          yield* svc.createBranch(tmpDir, "feature-branch")
          const branches = yield* svc.listBranches(tmpDir)
          expect(branches.all).toContain("feature-branch")
          expect(branches.current).toBe("feature-branch")
        }),
      )
    })

    it("switches between branches", async () => {
      await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          yield* svc.createBranch(tmpDir, "other-branch")

          // createBranch also switches to it — switch back to default
          yield* svc.switchBranch(tmpDir, defaultBranch)

          const branch = yield* svc.getCurrentBranch(tmpDir)
          expect(branch).toBe(defaultBranch)
        }),
      )
    })

    it("deletes a branch", async () => {
      await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          yield* svc.createBranch(tmpDir, "to-delete")

          // switch away first (can't delete current branch)
          yield* svc.switchBranch(tmpDir, defaultBranch)
          yield* svc.deleteBranch(tmpDir, "to-delete")

          const branches = yield* svc.listBranches(tmpDir)
          expect(branches.all).not.toContain("to-delete")
        }),
      )
    })

    it("getCurrentBranch returns current branch name", async () => {
      const branch = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getCurrentBranch(tmpDir)
        }),
      )

      expect(branch).toBe(defaultBranch)
    })
  })

  describe("isGitRepo", () => {
    it("returns true for a git repo", async () => {
      const result = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.isGitRepo(tmpDir)
        }),
      )

      expect(result).toBe(true)
    })

    it("returns false for a non-git directory", async () => {
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "spacecake-nongit-"))

      const result = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.isGitRepo(nonGitDir)
        }),
      )

      expect(result).toBe(false)
      fs.rmSync(nonGitDir, { recursive: true, force: true })
    })
  })

  describe("stageFiles and unstageFiles", () => {
    it("stages files and shows them in status", async () => {
      fs.writeFileSync(path.join(tmpDir, "to-stage.txt"), "stage me")

      await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          yield* svc.stageFiles(tmpDir, ["to-stage.txt"])
          const status = yield* svc.getStatus(tmpDir)
          expect(status.staged).toContain("to-stage.txt")
        }),
      )
    })

    it("unstages files and removes them from staged", async () => {
      fs.writeFileSync(path.join(tmpDir, "staged.txt"), "staged content")
      const git = simpleGit(tmpDir)
      await git.add("staged.txt")

      await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          yield* svc.unstageFiles(tmpDir, ["staged.txt"])
          const status = yield* svc.getStatus(tmpDir)
          expect(status.staged).not.toContain("staged.txt")
          expect(status.untracked).toContain("staged.txt")
        }),
      )
    })
  })

  describe("getRemoteStatus", () => {
    it("returns zero ahead/behind for local-only repo", async () => {
      const status = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.getRemoteStatus(tmpDir)
        }),
      )

      expect(status.ahead).toBe(0)
      expect(status.behind).toBe(0)
      expect(status.tracking).toBeNull()
    })
  })

  describe("commit with files", () => {
    it("only commits selected files", async () => {
      const git = simpleGit(tmpDir)

      fs.writeFileSync(path.join(tmpDir, "a.txt"), "file a")
      fs.writeFileSync(path.join(tmpDir, "b.txt"), "file b")

      const result = await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          return yield* svc.commit(tmpDir, "selective commit", { files: ["a.txt"] })
        }),
      )

      expect(result.hash).toBeTruthy()

      // a.txt should be committed, b.txt should remain as untracked
      const status = await git.status()
      expect(status.not_added).toContain("b.txt")
      expect(status.not_added).not.toContain("a.txt")

      // verify the commit contains only a.txt
      const log = await git.log({ maxCount: 1, "--name-only": null })
      const committedFiles = log.latest!.diff?.files.map((f) => f.file) ?? []
      expect(committedFiles).toEqual(["a.txt"])
    })

    it("does not commit excluded files even if they were previously staged", async () => {
      const git = simpleGit(tmpDir)

      fs.writeFileSync(path.join(tmpDir, "included.txt"), "included")
      fs.writeFileSync(path.join(tmpDir, "excluded.txt"), "excluded")

      // stage both files externally (simulating another tool or previous state)
      await git.add(["included.txt", "excluded.txt"])

      await runEffect(
        Effect.gen(function* () {
          const svc = yield* GitService
          yield* svc.commit(tmpDir, "partial commit", { files: ["included.txt"] })
        }),
      )

      // excluded.txt should not be in the commit
      const status = await git.status()
      expect(status.not_added).toContain("excluded.txt")

      const log = await git.log({ maxCount: 1, "--name-only": null })
      const committedFiles = log.latest!.diff?.files.map((f) => f.file) ?? []
      expect(committedFiles).toEqual(["included.txt"])
      expect(committedFiles).not.toContain("excluded.txt")
    })
  })
})
