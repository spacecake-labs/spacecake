import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import simpleGit, { type SimpleGit } from "simple-git"

import { FileSystem } from "@/services/file-system"
import { AbsolutePath } from "@/types/workspace"

// -- simpleGit factory with github desktop-aligned defaults --

const createGit = (workspacePath: string) =>
  simpleGit(workspacePath, {
    config: ["rebase.backend=merge"],
  }).env({ ...process.env, GIT_TERMINAL_PROMPT: "0" })

// -- error classification --

export type GitErrorCode =
  | "locked"
  | "auth"
  | "conflict"
  | "network"
  | "dirty_tree"
  | "not_merged"
  | "push_rejected"
  | "unknown"

export class GitError extends Data.TaggedError("GitError")<{
  readonly description: string
  readonly cause?: unknown
  readonly code?: GitErrorCode
}> {}

const LOCK_PATTERN = /(?:\.lock['"]?\s*(?:exists|is locked))|(?:unable to create\b.*\.lock)/i
const AUTH_PATTERNS = [/could not read.*username/i, /authentication failed/i, /permission denied/i]
const CONFLICT_PATTERN = /merge conflict|unmerged files|fix conflicts/i
const NETWORK_PATTERNS = [/could not resolve host/i, /connection refused/i, /timed out/i]
const DIRTY_TREE_PATTERN = /your local changes|please commit or stash/i
const NOT_MERGED_PATTERN = /not fully merged/i
const PUSH_REJECTED_PATTERN = /\[rejected\]|non-fast-forward|stale info/i

export const classifyGitError = (error: unknown): GitErrorCode => {
  const msg =
    error instanceof Error
      ? `${error.message}\n${(error as { stderr?: string }).stderr ?? ""}`
      : String(error)

  if (LOCK_PATTERN.test(msg)) return "locked"
  if (AUTH_PATTERNS.some((p) => p.test(msg))) return "auth"
  if (CONFLICT_PATTERN.test(msg)) return "conflict"
  if (NETWORK_PATTERNS.some((p) => p.test(msg))) return "network"
  if (DIRTY_TREE_PATTERN.test(msg)) return "dirty_tree"
  if (NOT_MERGED_PATTERN.test(msg)) return "not_merged"
  if (PUSH_REJECTED_PATTERN.test(msg)) return "push_rejected"
  return "unknown"
}

// -- types --

export type GitStatus = {
  modified: string[]
  staged: string[]
  untracked: string[]
  deleted: string[]
  conflicted: string[]
}

export type GitFileDiff = {
  oldContent: string
  newContent: string
}

export type GitCommit = {
  hash: string
  message: string
  author: string
  date: Date
  files: string[]
}

export type GitCommitResult = {
  hash: string
  branch: string
  summary: { changes: number; insertions: number; deletions: number }
}

export type GitBranchList = {
  current: string
  all: string[]
  branches: Record<string, { name: string; commit: string; current: boolean; label: string }>
}

export type GitRemoteStatus = {
  ahead: number
  behind: number
  tracking: string | null
  current: string | null
}

export type GitRemoteInfo = {
  name: string
  refs: { fetch: string; push: string }
}

// -- porcelain v2 status parser --

type PorcelainStatus = GitStatus & {
  ahead: number
  behind: number
  tracking: string | null
  current: string | null
}

const parsePorcelainV2 = (raw: string): PorcelainStatus => {
  const result: PorcelainStatus = {
    modified: [],
    staged: [],
    untracked: [],
    deleted: [],
    conflicted: [],
    ahead: 0,
    behind: 0,
    tracking: null,
    current: null,
  }

  // split on NUL — porcelain v2 -z uses NUL as record terminator
  const entries = raw.split("\0").filter(Boolean)

  let i = 0
  while (i < entries.length) {
    const entry = entries[i]

    // branch headers
    if (entry.startsWith("# branch.head ")) {
      result.current = entry.slice("# branch.head ".length)
      i++
      continue
    }
    if (entry.startsWith("# branch.upstream ")) {
      result.tracking = entry.slice("# branch.upstream ".length)
      i++
      continue
    }
    if (entry.startsWith("# branch.ab ")) {
      const match = entry.match(/\+(\d+) -(\d+)/)
      if (match) {
        result.ahead = Number(match[1])
        result.behind = Number(match[2])
      }
      i++
      continue
    }
    if (entry.startsWith("#")) {
      i++
      continue
    }

    // untracked
    if (entry.startsWith("? ")) {
      result.untracked.push(entry.slice(2))
      i++
      continue
    }

    // ignored
    if (entry.startsWith("! ")) {
      i++
      continue
    }

    // unmerged (conflicted)
    if (entry.startsWith("u ")) {
      const path = entry.split("\t")[0].split(" ").pop()!
      result.conflicted.push(path)
      i++
      continue
    }

    // ordinary change: "1 XY ..."
    if (entry.startsWith("1 ")) {
      const xy = entry.substring(2, 4)
      const path = entry.split("\t")[0].split(" ").pop()!
      classifyXY(xy, path, result)
      i++
      continue
    }

    // rename/copy: "2 XY ..." — next NUL-separated entry is the original path
    if (entry.startsWith("2 ")) {
      const xy = entry.substring(2, 4)
      const path = entry.split("\t")[0].split(" ").pop()!
      classifyXY(xy, path, result)
      i += 2 // skip the origPath entry
      continue
    }

    i++
  }

  return result
}

const classifyXY = (xy: string, path: string, result: PorcelainStatus) => {
  const [x, y] = xy

  // index (staged) changes
  if (x === "A" || x === "M" || x === "R" || x === "C") result.staged.push(path)
  if (x === "D") {
    result.staged.push(path)
    result.deleted.push(path)
  }

  // worktree changes
  if (y === "M") result.modified.push(path)
  if (y === "D") result.deleted.push(path)
}

// -- lock retry helpers --

const withLockRetry = <A>(effect: Effect.Effect<A, GitError>) =>
  Effect.retry(effect, { times: 3, while: (e) => e.code === "locked" })

// -- workspace state --

type WorkspaceState = {
  git: SimpleGit
  semaphore: Effect.Semaphore
}

const makeGitService = Effect.gen(function* () {
  const fs = yield* FileSystem
  const workspaces = new Map<string, WorkspaceState>()
  const dedup = new Map<string, Promise<unknown>>()

  const getWorkspace = (workspacePath: string): WorkspaceState => {
    if (!workspaces.has(workspacePath)) {
      workspaces.set(workspacePath, {
        git: createGit(workspacePath),
        semaphore: Effect.unsafeMakeSemaphore(1),
      })
    }
    return workspaces.get(workspacePath)!
  }

  const getGit = (workspacePath: string) => getWorkspace(workspacePath).git

  // -- operation serialization --

  const withMutex = <A>(workspacePath: string, effect: Effect.Effect<A, GitError>) => {
    const { semaphore } = getWorkspace(workspacePath)
    return semaphore.withPermits(1)(effect)
  }

  // -- dedup throttle for reads --

  const deduplicated = <A>(
    key: string,
    effect: Effect.Effect<A, GitError>,
  ): Effect.Effect<A, GitError> =>
    Effect.suspend(() => {
      const inflight = dedup.get(key)
      if (inflight) {
        return Effect.tryPromise({
          try: () => inflight as Promise<A>,
          catch: (e) => new GitError({ description: String(e), code: classifyGitError(e) }),
        })
      }

      const promise = Effect.runPromise(
        effect.pipe(
          Effect.tapBoth({
            onFailure: () => Effect.sync(() => dedup.delete(key)),
            onSuccess: () => Effect.sync(() => dedup.delete(key)),
          }),
        ),
      )
      dedup.set(key, promise)

      return Effect.tryPromise({
        try: () => promise,
        catch: (e) => new GitError({ description: String(e), code: classifyGitError(e) }),
      })
    })

  // -- git error helper --

  const gitError = (description: string, e: unknown) =>
    new GitError({ description, cause: e, code: classifyGitError(e) })

  // -- read operations --

  const getCurrentBranch = (workspacePath: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const result = await git.branchLocal()
        return result.current
      },
      catch: (e) => gitError("failed to get branch", e),
    })

  const isGitRepo = (workspacePath: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        return await git.checkIsRepo()
      },
      catch: () => false,
    }).pipe(Effect.catchAll(() => Effect.succeed(false)))

  const _getStatus = (workspacePath: string): Effect.Effect<GitStatus, GitError> =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const raw = await git.raw([
          "--no-optional-locks",
          "status",
          "--porcelain=v2",
          "-z",
          "--branch",
          "--untracked-files=all",
        ])
        const parsed = parsePorcelainV2(raw)
        return {
          modified: parsed.modified,
          staged: parsed.staged,
          untracked: parsed.untracked,
          deleted: parsed.deleted,
          conflicted: parsed.conflicted,
        }
      },
      catch: (e) => {
        console.error("Git status error for path:", workspacePath, e)
        return gitError("failed to get git status", e)
      },
    })

  const getStatus = (workspacePath: string): Effect.Effect<GitStatus, GitError> =>
    deduplicated(`status:${workspacePath}`, _getStatus(workspacePath))

  const getFileDiff = (
    workspacePath: string,
    filePath: string,
    baseRef?: string,
    targetRef?: string,
  ): Effect.Effect<GitFileDiff, GitError> =>
    Effect.gen(function* () {
      const git = getGit(workspacePath)

      // get old content (from baseRef, default HEAD)
      const ref = baseRef ?? "HEAD"
      const oldContent = yield* Effect.tryPromise(() => git.show([`${ref}:${filePath}`])).pipe(
        Effect.catchAll(() => Effect.succeed("")),
      )

      // get new content (from targetRef, default working directory)
      let newContent: string
      if (targetRef) {
        newContent = yield* Effect.tryPromise(() => git.show([`${targetRef}:${filePath}`])).pipe(
          Effect.catchAll(() => Effect.succeed("")),
        )
      } else {
        const fullPath = AbsolutePath(`${workspacePath}/${filePath}`)
        const file = yield* fs.readTextFile(fullPath)
        newContent = file.content
      }

      return { oldContent, newContent }
    }).pipe(
      Effect.mapError((e) => gitError("failed to get file diff", e)),
      Effect.withSpan("GitService.getFileDiff"),
    )

  const _getCommitLog = (workspacePath: string, limit = 50): Effect.Effect<GitCommit[], GitError> =>
    Effect.gen(function* () {
      const git = getGit(workspacePath)

      // guard: if HEAD doesn't resolve (no commits yet), return empty
      const headExists = yield* Effect.tryPromise(() => git.revparse(["HEAD"])).pipe(
        Effect.map(() => true),
        Effect.catchAll(() => Effect.succeed(false)),
      )
      if (!headExists) return []

      return yield* Effect.tryPromise({
        try: () =>
          git
            .log({ maxCount: limit, "--name-only": null, "--no-show-signature": null })
            .then((log) =>
              log.all.map((commit) => ({
                hash: commit.hash,
                message: commit.message,
                author: commit.author_name,
                date: new Date(commit.date),
                files: (commit.diff?.files ?? []).map((f) => f.file),
              })),
            ),
        catch: (e) => {
          console.error("git log error for path:", workspacePath, e)
          return gitError(
            `Failed to get commit log: ${e instanceof Error ? e.message : String(e)}`,
            e,
          )
        },
      })
    })

  const getCommitLog = (workspacePath: string, limit = 50): Effect.Effect<GitCommit[], GitError> =>
    deduplicated(`log:${workspacePath}`, _getCommitLog(workspacePath, limit))

  const listBranches = (workspacePath: string): Effect.Effect<GitBranchList, GitError> =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const result = await git.branchLocal()
        return {
          current: result.current,
          all: result.all,
          branches: result.branches as GitBranchList["branches"],
        }
      },
      catch: (e) => gitError("failed to list branches", e),
    }).pipe(Effect.withSpan("GitService.listBranches"))

  const getRemoteStatus = (workspacePath: string): Effect.Effect<GitRemoteStatus, GitError> =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const raw = await git.raw([
          "--no-optional-locks",
          "status",
          "--porcelain=v2",
          "-z",
          "--branch",
        ])
        const parsed = parsePorcelainV2(raw)
        return {
          ahead: parsed.ahead,
          behind: parsed.behind,
          tracking: parsed.tracking,
          current: parsed.current,
        }
      },
      catch: (e) => gitError("failed to get remote status", e),
    }).pipe(Effect.withSpan("GitService.getRemoteStatus"))

  const _fetchAll = (workspacePath: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        await git.fetch(["--all", "--prune", "--recurse-submodules=on-demand"])
      },
      catch: (e) => gitError("failed to fetch", e),
    }).pipe(Effect.withSpan("GitService.fetchAll"))

  const fetchAll = (workspacePath: string) =>
    deduplicated(`fetch:${workspacePath}`, _fetchAll(workspacePath))

  // -- mutating operations (serialized + lock-retried) --

  const stageFiles = (workspacePath: string, files: string[]) =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            await git.add(files)
          },
          catch: (e) => gitError("failed to stage files", e),
        }).pipe(Effect.withSpan("GitService.stageFiles")),
      ),
    )

  const unstageFiles = (workspacePath: string, files: string[]) =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            await git.reset(["HEAD", "--", ...files])
          },
          catch: (e) => gitError("failed to unstage files", e),
        }).pipe(Effect.withSpan("GitService.unstageFiles")),
      ),
    )

  const commit = (
    workspacePath: string,
    message: string,
    opts?: { amend?: boolean; files?: string[] },
  ): Effect.Effect<GitCommitResult, GitError> =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            // github desktop pattern: unstage all → stage selected → commit
            if (opts?.files) {
              await git.reset(["--", "."])
              await git.add(opts.files)
            }
            const options: Record<string, string | null> = {}
            if (opts?.amend) {
              options["--amend"] = null
              if (!message) options["--no-edit"] = null
            }
            const result = await git.commit(message || [], undefined, options)
            return {
              hash: result.commit || "",
              branch: result.branch || "",
              summary: {
                changes: result.summary.changes,
                insertions: result.summary.insertions,
                deletions: result.summary.deletions,
              },
            }
          },
          catch: (e) => gitError("failed to commit", e),
        }).pipe(Effect.withSpan("GitService.commit")),
      ),
    )

  const createBranch = (workspacePath: string, name: string) =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            await git.checkoutLocalBranch(name)
          },
          catch: (e) => gitError("failed to create branch", e),
        }).pipe(Effect.withSpan("GitService.createBranch")),
      ),
    )

  const switchBranch = (workspacePath: string, name: string) =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            await git.checkout(name)
          },
          catch: (e) => gitError("failed to switch branch", e),
        }).pipe(Effect.withSpan("GitService.switchBranch")),
      ),
    )

  const deleteBranch = (workspacePath: string, name: string, force?: boolean) =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            await git.deleteLocalBranch(name, force)
          },
          catch: (e) => gitError("failed to delete branch", e),
        }).pipe(Effect.withSpan("GitService.deleteBranch")),
      ),
    )

  const push = (workspacePath: string, opts?: { force?: boolean }): Effect.Effect<void, GitError> =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            const raw = await git.raw([
              "--no-optional-locks",
              "status",
              "--porcelain=v2",
              "-z",
              "--branch",
            ])
            const parsed = parsePorcelainV2(raw)
            const args: string[] = []
            if (opts?.force) args.push("--force-with-lease")
            if (!parsed.tracking) {
              args.push("-u", "origin", parsed.current!)
            }
            await git.push(args)
          },
          catch: (e) => gitError("failed to push", e),
        }).pipe(Effect.withSpan("GitService.push")),
      ),
    )

  const pull = (workspacePath: string) =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            await git.pull(["--recurse-submodules", "--ff"])
          },
          catch: (e) => gitError("failed to pull", e),
        }).pipe(Effect.withSpan("GitService.pull")),
      ),
    )

  const discardFileChanges = (workspacePath: string, file: string) =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            // unstage first so checkout restores from HEAD, not the index
            await git.reset(["HEAD", "--", file]).catch(() => {})
            const raw = await git.raw(["status", "--porcelain=v2", "-z", "--untracked-files=all"])
            const parsed = parsePorcelainV2(raw)
            const isUntracked = parsed.untracked.includes(file)
            if (isUntracked) {
              await git.clean("f", ["--", file])
            } else {
              await git.checkout(["--", file])
            }
          },
          catch: (e) => gitError("failed to discard file changes", e),
        }).pipe(Effect.withSpan("GitService.discardFileChanges")),
      ),
    )

  const discardAllChanges = (workspacePath: string) =>
    withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            // unstage everything first so checkout restores from HEAD
            await git.reset(["HEAD"]).catch(() => {})
            await git.checkout(["--", "."])
            await git.clean("f", ["-d"])
          },
          catch: (e) => gitError("failed to discard all changes", e),
        }).pipe(Effect.withSpan("GitService.discardAllChanges")),
      ),
    )

  return {
    getCurrentBranch,
    isGitRepo,
    getStatus,
    getFileDiff,
    getCommitLog,
    stageFiles,
    unstageFiles,
    commit,
    listBranches,
    createBranch,
    switchBranch,
    deleteBranch,
    push,
    pull,
    fetchAll,
    getRemoteStatus,
    discardFileChanges,
    discardAllChanges,
  } as const
})

/**
 * Git service for interacting with git repositories.
 *
 * Use `GitService.Default` for production (includes FileSystem.Default).
 * Use `GitService.DefaultWithoutDependencies` for tests (provide mock FileSystem).
 */
export class GitService extends Effect.Service<GitService>()("service/git", {
  effect: makeGitService,
  dependencies: [FileSystem.Default],
}) {}
