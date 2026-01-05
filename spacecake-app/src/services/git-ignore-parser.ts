import * as fs from "node:fs/promises"
import * as Path from "node:path"

import { Context, Effect, Layer } from "effect"
import ignore from "ignore"

import { DEFAULT_FILE_EXCLUDES } from "@/lib/ignore-patterns"

export interface GitIgnoreConfig {
  readonly extraPatterns: readonly string[]
}

export const GitIgnoreConfig =
  Context.GenericTag<GitIgnoreConfig>("GitIgnoreConfig")

export class GitIgnore extends Effect.Service<GitIgnore>()("GitIgnore", {
  effect: Effect.gen(function* () {
    const { extraPatterns } = yield* GitIgnoreConfig

    // Cache: Directory Path -> List of patterns
    const cache = new Map<string, string[]>()
    // Cache: Root Path -> Global patterns (.git/info/exclude)
    const globalPatternsCache = new Map<string, string[]>()

    const processPatterns = (
      rawPatterns: string[],
      relativeBaseDir: string
    ): string[] => {
      return rawPatterns
        .map((p) => p.trimStart())
        .filter((p) => p !== "" && !p.startsWith("#"))
        .map((p) => {
          let pattern = p
          const isNegative = pattern.startsWith("!")
          if (isNegative) {
            pattern = pattern.substring(1)
          }

          const isAnchoredInFile = pattern.startsWith("/")
          if (isAnchoredInFile) {
            pattern = pattern.substring(1)
          }

          if (pattern === "") {
            return ""
          }

          let newPattern = pattern
          if (relativeBaseDir && relativeBaseDir !== ".") {
            if (!isAnchoredInFile && !pattern.includes("/")) {
              newPattern = Path.posix.join("**", pattern)
            }

            newPattern = Path.posix.join(relativeBaseDir, newPattern)

            if (!newPattern.startsWith("/")) {
              newPattern = "/" + newPattern
            }
          }

          if (isAnchoredInFile && !newPattern.startsWith("/")) {
            newPattern = "/" + newPattern
          }

          if (isNegative) {
            newPattern = "!" + newPattern
          }

          return newPattern
        })
        .filter((p) => p !== "")
    }

    const processedExtraPatterns = processPatterns([...extraPatterns], ".")

    const loadPatternsForFile = (root: string, patternsFilePath: string) =>
      Effect.gen(function* () {
        const content = yield* Effect.tryPromise({
          try: () => fs.readFile(patternsFilePath, "utf-8"),
          catch: () => null,
        })

        if (!content) return []

        const isExcludeFile = patternsFilePath.endsWith(
          Path.join(".git", "info", "exclude")
        )

        const relativeBaseDir = isExcludeFile
          ? "."
          : Path.dirname(Path.relative(root, patternsFilePath))
              .split(Path.sep)
              .join(Path.posix.sep)

        const rawPatterns = content.split("\n")
        return processPatterns(rawPatterns, relativeBaseDir)
      })

    const isIgnored = (root: string, filePath: string) =>
      Effect.gen(function* () {
        if (!filePath || typeof filePath !== "string") {
          return false
        }

        const absoluteFilePath = Path.resolve(root, filePath)
        if (!absoluteFilePath.startsWith(root)) {
          return false
        }

        const resolved = Path.resolve(root, filePath)
        const relativePath = Path.relative(root, resolved)

        if (relativePath === "" || relativePath.startsWith("..")) {
          return false
        }

        const normalizedPath = relativePath.replace(/\\/g, "/")
        if (normalizedPath.startsWith("/") || normalizedPath === "") {
          return false
        }

        const ig = ignore()
        ig.add(".git")

        // Load global patterns from .git/info/exclude
        let globalPatterns = globalPatternsCache.get(root)
        if (globalPatterns === undefined) {
          const excludeFile = Path.join(root, ".git", "info", "exclude")
          const exists = yield* Effect.tryPromise({
            try: async () => {
              try {
                await fs.access(excludeFile)
                return true
              } catch {
                return false
              }
            },
            catch: () => false,
          })

          if (exists) {
            globalPatterns = yield* loadPatternsForFile(root, excludeFile)
          } else {
            globalPatterns = []
          }
          globalPatternsCache.set(root, globalPatterns)
        }
        ig.add(globalPatterns)

        const pathParts = relativePath.split(Path.sep)
        const dirsToVisit = [root]
        let currentAbsDir = root

        for (let i = 0; i < pathParts.length - 1; i++) {
          currentAbsDir = Path.join(currentAbsDir, pathParts[i])
          dirsToVisit.push(currentAbsDir)
        }

        for (const dir of dirsToVisit) {
          const relativeDir = Path.relative(root, dir)
          if (relativeDir) {
            const normalizedRelativeDir = relativeDir.replace(/\\/g, "/")
            const igPlusExtras = ignore().add(ig).add(processedExtraPatterns)
            if (igPlusExtras.ignores(normalizedRelativeDir)) {
              // This directory is ignored by an ancestor's .gitignore.
              break
            }
          }

          if (cache.has(dir)) {
            const patterns = cache.get(dir)
            if (patterns) {
              ig.add(patterns)
            }
          } else {
            const gitignorePath = Path.join(dir, ".gitignore")
            const exists = yield* Effect.tryPromise({
              try: async () => {
                try {
                  await fs.access(gitignorePath)
                  return true
                } catch {
                  return false
                }
              },
              catch: () => false,
            })

            if (exists) {
              const patterns = yield* loadPatternsForFile(root, gitignorePath)
              cache.set(dir, patterns)
              ig.add(patterns)
            } else {
              cache.set(dir, [])
            }
          }
        }

        // Apply extra patterns (e.g. DEFAULT_FILE_EXCLUDES)
        if (processedExtraPatterns.length > 0) {
          ig.add(processedExtraPatterns)
        }

        return ig.ignores(normalizedPath)
      })

    const retrieveIgnorePatterns = (root: string) =>
      Effect.gen(function* () {
        // Always include default exclude patterns
        const patterns = [...processedExtraPatterns]

        // Try to read root .gitignore
        const gitignorePath = Path.join(root, ".gitignore")
        const exists = yield* Effect.tryPromise({
          try: async () => {
            try {
              await fs.access(gitignorePath)
              return true
            } catch {
              return false
            }
          },
          catch: () => false,
        })

        if (exists) {
          const gitIgnorePatterns = yield* loadPatternsForFile(
            root,
            gitignorePath
          )
          patterns.push(...gitIgnorePatterns)
        }

        // Clean up patterns for glob usage (strip leading slash)
        return patterns.map((p) => (p.startsWith("/") ? p.slice(1) : p))
      })

    return { isIgnored, retrieveIgnorePatterns } as const
  }),
  dependencies: [],
}) {}

export const GitIgnoreLive = Layer.provide(
  GitIgnore.Default,
  Layer.succeed(GitIgnoreConfig, { extraPatterns: DEFAULT_FILE_EXCLUDES })
)
