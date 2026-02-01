import { Effect, Layer } from "effect"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { GitIgnore, GitIgnoreConfig } from "@/services/git-ignore-parser"

describe("GitIgnore", () => {
  let projectRoot: string

  const GitIgnoreTest = Layer.provide(
    GitIgnore.Default,
    Layer.succeed(GitIgnoreConfig, { extraPatterns: [] }),
  )

  async function createTestFile(filePath: string, content = "") {
    const fullPath = path.join(projectRoot, filePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content)
  }

  async function setupGitRepo() {
    await fs.mkdir(path.join(projectRoot, ".git"), { recursive: true })
  }

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gitignore-test-"))
  })

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true })
  })

  describe("Basic ignore behaviors", () => {
    beforeEach(async () => {
      await setupGitRepo()
    })

    it("should not ignore files when no .gitignore exists", async () => {
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        return yield* gitIgnore.isIgnored(projectRoot, "file.txt")
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result).toBe(false)
    })

    it("should ignore files based on a root .gitignore", async () => {
      const gitignoreContent = `
# Comment
node_modules/
*.log
/dist
.env
`
      await createTestFile(".gitignore", gitignoreContent)

      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        const ignored1 = yield* gitIgnore.isIgnored(
          projectRoot,
          path.join("node_modules", "some-lib"),
        )
        const ignored2 = yield* gitIgnore.isIgnored(projectRoot, path.join("src", "app.log"))
        const ignored3 = yield* gitIgnore.isIgnored(projectRoot, path.join("dist", "index.js"))
        const ignored4 = yield* gitIgnore.isIgnored(projectRoot, ".env")
        const ignored5 = yield* gitIgnore.isIgnored(projectRoot, "src/index.js")

        return { ignored1, ignored2, ignored3, ignored4, ignored5 }
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result.ignored1).toBe(true)
      expect(result.ignored2).toBe(true)
      expect(result.ignored3).toBe(true)
      expect(result.ignored4).toBe(true)
      expect(result.ignored5).toBe(false)
    })

    it("should handle git exclude file", async () => {
      await createTestFile(path.join(".git", "info", "exclude"), "temp/\n*.tmp")

      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        const ignored1 = yield* gitIgnore.isIgnored(projectRoot, path.join("temp", "file.txt"))
        const ignored2 = yield* gitIgnore.isIgnored(projectRoot, path.join("src", "file.tmp"))
        const ignored3 = yield* gitIgnore.isIgnored(projectRoot, "src/file.js")

        return { ignored1, ignored2, ignored3 }
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result.ignored1).toBe(true)
      expect(result.ignored2).toBe(true)
      expect(result.ignored3).toBe(false)
    })
  })

  describe("isIgnored path handling", () => {
    beforeEach(async () => {
      await setupGitRepo()
      const gitignoreContent = `
node_modules/
*.log
/dist
/.env
src/*.tmp
!src/important.tmp
`
      await createTestFile(".gitignore", gitignoreContent)
    })

    it("should always ignore .git directory", async () => {
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        const ignored1 = yield* gitIgnore.isIgnored(projectRoot, ".git")
        const ignored2 = yield* gitIgnore.isIgnored(projectRoot, path.join(".git", "config"))
        const ignored3 = yield* gitIgnore.isIgnored(
          projectRoot,
          path.join(projectRoot, ".git", "HEAD"),
        )

        return { ignored1, ignored2, ignored3 }
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result.ignored1).toBe(true)
      expect(result.ignored2).toBe(true)
      expect(result.ignored3).toBe(true)
    })

    it("should ignore files matching patterns", async () => {
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        const ignored1 = yield* gitIgnore.isIgnored(
          projectRoot,
          path.join("node_modules", "package", "index.js"),
        )
        const ignored2 = yield* gitIgnore.isIgnored(projectRoot, "app.log")
        const ignored3 = yield* gitIgnore.isIgnored(projectRoot, path.join("logs", "app.log"))
        const ignored4 = yield* gitIgnore.isIgnored(projectRoot, path.join("dist", "bundle.js"))
        const ignored5 = yield* gitIgnore.isIgnored(projectRoot, ".env")
        const ignored6 = yield* gitIgnore.isIgnored(projectRoot, path.join("config", ".env"))

        return { ignored1, ignored2, ignored3, ignored4, ignored5, ignored6 }
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result.ignored1).toBe(true)
      expect(result.ignored2).toBe(true)
      expect(result.ignored3).toBe(true)
      expect(result.ignored4).toBe(true)
      expect(result.ignored5).toBe(true)
      expect(result.ignored6).toBe(false) // .env is anchored to root in setup
    })

    it("should ignore files with path-specific patterns", async () => {
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        const ignored1 = yield* gitIgnore.isIgnored(projectRoot, path.join("src", "temp.tmp"))
        const ignored2 = yield* gitIgnore.isIgnored(projectRoot, path.join("other", "temp.tmp"))

        return { ignored1, ignored2 }
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result.ignored1).toBe(true)
      expect(result.ignored2).toBe(false)
    })

    it("should handle negation patterns", async () => {
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        return yield* gitIgnore.isIgnored(projectRoot, path.join("src", "important.tmp"))
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result).toBe(false)
    })

    it("should not ignore files that do not match patterns", async () => {
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        const ignored1 = yield* gitIgnore.isIgnored(projectRoot, path.join("src", "index.ts"))
        const ignored2 = yield* gitIgnore.isIgnored(projectRoot, "README.md")

        return { ignored1, ignored2 }
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result.ignored1).toBe(false)
      expect(result.ignored2).toBe(false)
    })

    it("should handle absolute paths correctly", async () => {
      const absolutePath = path.join(projectRoot, "node_modules", "lib")
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        return yield* gitIgnore.isIgnored(projectRoot, absolutePath)
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result).toBe(true)
    })

    it("should handle paths outside project root by not ignoring them", async () => {
      const outsidePath = path.resolve(projectRoot, "..", "other", "file.txt")
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        return yield* gitIgnore.isIgnored(projectRoot, outsidePath)
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result).toBe(false)
    })

    it("should handle relative paths correctly", async () => {
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        const ignored1 = yield* gitIgnore.isIgnored(
          projectRoot,
          path.join("node_modules", "some-package"),
        )
        const ignored2 = yield* gitIgnore.isIgnored(
          projectRoot,
          path.join("..", "some", "other", "file.txt"),
        )

        return { ignored1, ignored2 }
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result.ignored1).toBe(true)
      expect(result.ignored2).toBe(false)
    })

    it('should handle root path "/" without throwing error', async () => {
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        return yield* gitIgnore.isIgnored(projectRoot, "/")
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result).toBe(false)
    })
  })

  describe("nested .gitignore files", () => {
    beforeEach(async () => {
      await setupGitRepo()
      // Root .gitignore
      await createTestFile(".gitignore", "root-ignored.txt")
      // Nested .gitignore 1
      await createTestFile("a/.gitignore", "/b\nc")
      // Nested .gitignore 2
      await createTestFile("a/d/.gitignore", "e.txt\nf/g")
    })

    it("should handle nested .gitignore files correctly", async () => {
      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        // From root .gitignore
        const ignored1 = yield* gitIgnore.isIgnored(root, "root-ignored.txt")
        const ignored2 = yield* gitIgnore.isIgnored(root, "a/root-ignored.txt")

        // From a/.gitignore: /b
        const ignored3 = yield* gitIgnore.isIgnored(root, "a/b")
        const ignored4 = yield* gitIgnore.isIgnored(root, "b")
        const ignored5 = yield* gitIgnore.isIgnored(root, "a/x/b")

        // From a/.gitignore: c
        const ignored6 = yield* gitIgnore.isIgnored(root, "a/c")
        const ignored7 = yield* gitIgnore.isIgnored(root, "a/x/y/c")
        const ignored8 = yield* gitIgnore.isIgnored(root, "c")

        // From a/d/.gitignore: e.txt
        const ignored9 = yield* gitIgnore.isIgnored(root, "a/d/e.txt")
        const ignored10 = yield* gitIgnore.isIgnored(root, "a/d/x/e.txt")
        const ignored11 = yield* gitIgnore.isIgnored(root, "a/e.txt")

        // From a/d/.gitignore: f/g
        const ignored12 = yield* gitIgnore.isIgnored(root, "a/d/f/g")
        const ignored13 = yield* gitIgnore.isIgnored(root, "a/f/g")

        return {
          ignored1,
          ignored2,
          ignored3,
          ignored4,
          ignored5,
          ignored6,
          ignored7,
          ignored8,
          ignored9,
          ignored10,
          ignored11,
          ignored12,
          ignored13,
        }
      })

      const root = projectRoot
      const result = await Effect.runPromise(
        program.pipe(Effect.provide(GitIgnoreTest), Effect.orDie),
      )

      expect(result.ignored1).toBe(true)
      expect(result.ignored2).toBe(true)
      expect(result.ignored3).toBe(true)
      expect(result.ignored4).toBe(false)
      expect(result.ignored5).toBe(false)
      expect(result.ignored6).toBe(true)
      expect(result.ignored7).toBe(true)
      expect(result.ignored8).toBe(false)
      expect(result.ignored9).toBe(true)
      expect(result.ignored10).toBe(true)
      expect(result.ignored11).toBe(false)
      expect(result.ignored12).toBe(true)
      expect(result.ignored13).toBe(false)
    })
  })

  describe("precedence rules", () => {
    beforeEach(async () => {
      await setupGitRepo()
    })

    it("should prioritize nested .gitignore over root .gitignore", async () => {
      await createTestFile(".gitignore", "*.log")
      await createTestFile("a/b/.gitignore", "!special.log")

      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        const ignored1 = yield* gitIgnore.isIgnored(projectRoot, "a/b/any.log")
        const ignored2 = yield* gitIgnore.isIgnored(projectRoot, "a/b/special.log")
        return { ignored1, ignored2 }
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result.ignored1).toBe(true)
      expect(result.ignored2).toBe(false)
    })

    it("should prioritize .gitignore over .git/info/exclude", async () => {
      // Exclude all .log files
      await createTestFile(path.join(".git", "info", "exclude"), "*.log")
      // But make an exception in the root .gitignore
      await createTestFile(".gitignore", "!important.log")

      const program = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        const ignored1 = yield* gitIgnore.isIgnored(projectRoot, "some.log")
        const ignored2 = yield* gitIgnore.isIgnored(projectRoot, "important.log")
        const ignored3 = yield* gitIgnore.isIgnored(projectRoot, path.join("subdir", "some.log"))
        const ignored4 = yield* gitIgnore.isIgnored(
          projectRoot,
          path.join("subdir", "important.log"),
        )
        return { ignored1, ignored2, ignored3, ignored4 }
      }).pipe(Effect.provide(GitIgnoreTest))

      const result = await Effect.runPromise(program.pipe(Effect.orDie))
      expect(result.ignored1).toBe(true)
      expect(result.ignored2).toBe(false)
      expect(result.ignored3).toBe(true)
      expect(result.ignored4).toBe(false)
    })
  })

  describe("retrieveIgnorePatterns", () => {
    beforeEach(async () => {
      await setupGitRepo()
    })

    it("should retrieve patterns from root .gitignore", async () => {
      await createTestFile(".gitignore", "node_modules/\n*.log")

      const program: Effect.Effect<string[], never, never> = Effect.gen(function* () {
        const gitIgnore = yield* GitIgnore
        return yield* gitIgnore.retrieveIgnorePatterns(projectRoot)
      }).pipe(Effect.provide(GitIgnoreTest), Effect.orDie)

      const patterns = await Effect.runPromise(program)
      expect(patterns).toContain("node_modules/")
      expect(patterns).toContain("*.log")
    })
  })
})
