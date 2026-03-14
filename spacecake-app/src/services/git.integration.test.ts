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

// stub filesystem — discard/commit operations use simple-git directly
const stubFileSystem = Layer.succeed(FileSystem, {} as unknown as FileSystem)
const testLayer = GitService.DefaultWithoutDependencies.pipe(Layer.provide(stubFileSystem))

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
