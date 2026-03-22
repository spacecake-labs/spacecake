import * as Data from "effect/Data"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import simpleGit, { type SimpleGit } from "simple-git"

import { FileSystem } from "@/services/file-system"
import { type BlameResult, parseBlameOutput } from "@/services/git-blame-parser"
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

export type ConflictContent = {
  ours: string
  theirs: string
  base: string
}

export type GitCommit = {
  hash: string
  message: string
  author: string
  date: Date
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

export type GitHubRepoInfo = {
  owner: string
  repo: string
}

export type StashEntry = {
  index: number
  message: string
  date: string
}

export type LineDiff = {
  type: "added" | "modified" | "deleted"
  startLine: number
  endLine: number
}

export const parseStashList = (raw: string): StashEntry[] => {
  if (!raw.trim()) return []
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^stash@\{(\d+)\}:\s*(?:(?:WIP )?[Oo]n\s+\S+:\s*)?(.*)$/)
      if (!match) return null
      return {
        index: Number(match[1]),
        message: match[2] || "(no message)",
        date: "",
      }
    })
    .filter((entry): entry is StashEntry => entry !== null)
}

export const parseUnifiedDiff = (raw: string): LineDiff[] => {
  const diffs: LineDiff[] = []
  const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm
  let match: RegExpExecArray | null
  while ((match = hunkPattern.exec(raw)) !== null) {
    const _oldStart = Number(match[1])
    const oldCount = match[2] !== undefined ? Number(match[2]) : 1
    const newStart = Number(match[3])
    const newCount = match[4] !== undefined ? Number(match[4]) : 1

    if (oldCount === 0 && newCount > 0) {
      // pure addition
      diffs.push({ type: "added", startLine: newStart, endLine: newStart + newCount - 1 })
    } else if (newCount === 0 && oldCount > 0) {
      // pure deletion - mark at the line where content was removed
      diffs.push({ type: "deleted", startLine: newStart, endLine: newStart })
    } else {
      // modification
      diffs.push({ type: "modified", startLine: newStart, endLine: newStart + newCount - 1 })
    }
  }
  return diffs
}

// -- github url parser --

export const parseGitHubUrl = (url: string): GitHubRepoInfo | null => {
  // ssh format: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }

  // https format: https://github.com/owner/repo.git
  const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }

  return null
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

  // split on NUL - porcelain v2 -z uses NUL as record terminator
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

    // rename/copy: "2 XY ..." - next NUL-separated entry is the original path
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

const WORKSPACE_CACHE_MAX = 10

const makeGitService = Effect.gen(function* () {
  const fs = yield* FileSystem
  const workspaces = new Map<string, WorkspaceState>()
  const dedup = new Map<string, Deferred.Deferred<unknown, GitError>>()

  const getWorkspace = (workspacePath: string): WorkspaceState => {
    if (!workspaces.has(workspacePath)) {
      // evict oldest entry if cache is full (lru-style safety net)
      if (workspaces.size >= WORKSPACE_CACHE_MAX) {
        const oldest = workspaces.keys().next().value
        if (oldest !== undefined) workspaces.delete(oldest)
      }
      workspaces.set(workspacePath, {
        git: createGit(workspacePath),
        semaphore: Effect.unsafeMakeSemaphore(1),
      })
    }
    return workspaces.get(workspacePath)!
  }

  const removeWorkspace = (workspacePath: string) =>
    Effect.sync(() => {
      workspaces.delete(workspacePath)
      for (const key of dedup.keys()) {
        if (key.startsWith(workspacePath)) {
          dedup.delete(key)
        }
      }
    })

  const getGit = (workspacePath: string) => getWorkspace(workspacePath).git

  // -- operation serialization --

  const withMutex = <A>(workspacePath: string, effect: Effect.Effect<A, GitError>) => {
    const { semaphore } = getWorkspace(workspacePath)
    return semaphore.withPermits(1)(effect)
  }

  // -- dedup using Effect Deferred (stays in fiber context) --

  const deduplicated = <A>(
    key: string,
    effect: Effect.Effect<A, GitError>,
  ): Effect.Effect<A, GitError> =>
    Effect.suspend(() => {
      const existing = dedup.get(key)
      if (existing) {
        return Deferred.await(existing) as Effect.Effect<A, GitError>
      }

      return Effect.gen(function* () {
        const d = yield* Deferred.make<unknown, GitError>()
        dedup.set(key, d)
        return yield* effect.pipe(
          Effect.tap((a) => Deferred.succeed(d, a)),
          Effect.tapError((e) => Deferred.fail(d, e)),
          Effect.ensuring(Effect.sync(() => dedup.delete(key))),
        )
      }) as Effect.Effect<A, GitError>
    })

  // -- git error helper --

  const gitError = (description: string, e: unknown) =>
    new GitError({ description, cause: e, code: classifyGitError(e) })

  // -- read operations --

  const getCurrentBranch = Effect.fn("GitService.getCurrentBranch")(function* (
    workspacePath: string,
  ) {
    const git = getGit(workspacePath)
    // use symbolic-ref instead of branchLocal() so we can detect the
    // branch name even in repos with no commits yet
    const ref = yield* Effect.tryPromise({
      try: () => git.raw(["symbolic-ref", "--short", "HEAD"]),
      catch: (e) => gitError("failed to get branch", e),
    })
    return ref.trim()
  })

  const isGitRepo = (workspacePath: string) =>
    Effect.tryPromise(() => getGit(workspacePath).checkIsRepo()).pipe(
      Effect.catchAll(() => Effect.succeed(false)),
      Effect.withSpan("GitService.isGitRepo"),
    )

  const _getStatus = Effect.fn("GitService.getStatus")(function* (workspacePath: string) {
    const git = getGit(workspacePath)
    const raw = yield* Effect.tryPromise({
      try: () =>
        git.raw([
          "--no-optional-locks",
          "status",
          "--porcelain=v2",
          "-z",
          "--branch",
          "--untracked-files=all",
        ]),
      catch: (e) => {
        Effect.runSync(Effect.logError("git status error", { workspacePath, error: e }))
        return gitError("failed to get git status", e)
      },
    })
    const parsed = parsePorcelainV2(raw)
    return {
      modified: parsed.modified,
      staged: parsed.staged,
      untracked: parsed.untracked,
      deleted: parsed.deleted,
      conflicted: parsed.conflicted,
    }
  })

  const getStatus = (workspacePath: string): Effect.Effect<GitStatus, GitError> =>
    deduplicated(`status:${workspacePath}`, _getStatus(workspacePath))

  const getFileDiff = Effect.fn("GitService.getFileDiff")(
    function* (workspacePath: string, filePath: string, baseRef?: string, targetRef?: string) {
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

      return { oldContent, newContent } as GitFileDiff
    },
    Effect.mapError((e) => gitError("failed to get file diff", e)),
  )

  const _getCommitLog = Effect.fn("GitService.getCommitLog")(function* (
    workspacePath: string,
    limit = 50,
  ) {
    const git = getGit(workspacePath)

    // guard: if HEAD doesn't resolve (no commits yet), return empty
    const headExists = yield* Effect.tryPromise(() => git.revparse(["HEAD"])).pipe(
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false)),
    )
    if (!headExists) return [] as GitCommit[]

    return yield* Effect.tryPromise({
      try: () =>
        git.log({ maxCount: limit, "--no-show-signature": null }).then((log) =>
          log.all.map((commit) => ({
            hash: commit.hash,
            message: commit.message,
            author: commit.author_name,
            date: new Date(commit.date),
          })),
        ),
      catch: (e) => {
        Effect.runSync(Effect.logError("git log error", { workspacePath, error: e }))
        return gitError(
          `Failed to get commit log: ${e instanceof Error ? e.message : String(e)}`,
          e,
        )
      },
    })
  })

  const getCommitLog = (workspacePath: string, limit = 50): Effect.Effect<GitCommit[], GitError> =>
    deduplicated(`log:${workspacePath}`, _getCommitLog(workspacePath, limit))

  const getCommitFiles = Effect.fn("GitService.getCommitFiles")(function* (
    workspacePath: string,
    commitHash: string,
  ) {
    const git = getGit(workspacePath)
    const raw = yield* Effect.tryPromise({
      try: () =>
        git.raw(["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", commitHash]),
      catch: (e) => gitError("failed to get commit files", e),
    })
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  })

  const _getBlame = Effect.fn("GitService.getBlame")(function* (
    workspacePath: string,
    filePath: string,
  ) {
    const git = getGit(workspacePath)
    const raw = yield* Effect.tryPromise({
      try: () => git.raw(["blame", "--porcelain", filePath]),
      catch: (e) => gitError("failed to get blame", e),
    })
    return parseBlameOutput(raw)
  })

  const getBlame = (
    workspacePath: string,
    filePath: string,
  ): Effect.Effect<BlameResult, GitError> =>
    deduplicated(`blame:${workspacePath}:${filePath}`, _getBlame(workspacePath, filePath))

  const _getLineDiff = Effect.fn("GitService.getLineDiff")(function* (
    workspacePath: string,
    filePath: string,
  ) {
    const git = getGit(workspacePath)
    const raw = yield* Effect.tryPromise({
      try: () => git.raw(["diff", "--unified=0", "HEAD", "--", filePath]),
      catch: (e) => gitError("failed to get line diff", e),
    })
    return parseUnifiedDiff(raw)
  })

  const getLineDiff = (
    workspacePath: string,
    filePath: string,
  ): Effect.Effect<LineDiff[], GitError> =>
    deduplicated(`linediff:${workspacePath}:${filePath}`, _getLineDiff(workspacePath, filePath))

  const listBranches = Effect.fn("GitService.listBranches")(function* (workspacePath: string) {
    const git = getGit(workspacePath)
    const result = yield* Effect.tryPromise({
      try: () => git.branchLocal(),
      catch: (e) => gitError("failed to list branches", e),
    })
    return {
      current: result.current,
      all: result.all,
      branches: result.branches as GitBranchList["branches"],
    }
  })

  const getRemoteStatus = Effect.fn("GitService.getRemoteStatus")(function* (
    workspacePath: string,
  ) {
    const git = getGit(workspacePath)
    const raw = yield* Effect.tryPromise({
      try: () => git.raw(["--no-optional-locks", "status", "--porcelain=v2", "-z", "--branch"]),
      catch: (e) => gitError("failed to get remote status", e),
    })
    const parsed = parsePorcelainV2(raw)
    return {
      ahead: parsed.ahead,
      behind: parsed.behind,
      tracking: parsed.tracking,
      current: parsed.current,
    } as GitRemoteStatus
  })

  const _fetchAll = Effect.fn("GitService.fetchAll")(function* (workspacePath: string) {
    const git = getGit(workspacePath)
    yield* Effect.tryPromise({
      try: () => git.fetch(["--all", "--prune", "--recurse-submodules=on-demand"]),
      catch: (e) => gitError("failed to fetch", e),
    })
  })

  const fetchAll = (workspacePath: string) =>
    deduplicated(`fetch:${workspacePath}`, _fetchAll(workspacePath))

  const _getRemoteUrl = Effect.fn("GitService.getRemoteUrl")(function* (workspacePath: string) {
    const git = getGit(workspacePath)
    const url = yield* Effect.tryPromise({
      try: () => git.remote(["get-url", "origin"]),
      catch: (e) => gitError("failed to get remote url", e),
    })
    return url ? url.trim() : null
  })

  const getRemoteUrl = (workspacePath: string): Effect.Effect<string | null, GitError> =>
    deduplicated(`remoteurl:${workspacePath}`, _getRemoteUrl(workspacePath))

  // -- mutating operations (serialized + lock-retried) --

  const stageFiles = Effect.fn("GitService.stageFiles")(function* (
    workspacePath: string,
    files: string[],
  ) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: () => getGit(workspacePath).add(files),
          catch: (e) => gitError("failed to stage files", e),
        }),
      ),
    )
  })

  const unstageFiles = Effect.fn("GitService.unstageFiles")(function* (
    workspacePath: string,
    files: string[],
  ) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: () => getGit(workspacePath).reset(["HEAD", "--", ...files]),
          catch: (e) => gitError("failed to unstage files", e),
        }),
      ),
    )
  })

  const commit = Effect.fn("GitService.commit")(function* (
    workspacePath: string,
    message: string,
    opts?: { amend?: boolean; files?: string[] },
  ) {
    return yield* withMutex(
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
            } as GitCommitResult
          },
          catch: (e) => gitError("failed to commit", e),
        }),
      ),
    )
  })

  const createBranch = Effect.fn("GitService.createBranch")(function* (
    workspacePath: string,
    name: string,
  ) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: () => getGit(workspacePath).checkoutLocalBranch(name),
          catch: (e) => gitError("failed to create branch", e),
        }),
      ),
    )
  })

  const switchBranch = Effect.fn("GitService.switchBranch")(function* (
    workspacePath: string,
    name: string,
  ) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: () => getGit(workspacePath).checkout(name),
          catch: (e) => gitError("failed to switch branch", e),
        }),
      ),
    )
  })

  const deleteBranch = Effect.fn("GitService.deleteBranch")(function* (
    workspacePath: string,
    name: string,
    force?: boolean,
  ) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: () => getGit(workspacePath).deleteLocalBranch(name, force),
          catch: (e) => gitError("failed to delete branch", e),
        }),
      ),
    )
  })

  const push = Effect.fn("GitService.push")(function* (
    workspacePath: string,
    opts?: { force?: boolean },
  ) {
    yield* withMutex(
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
        }),
      ),
    )
  })

  const pull = Effect.fn("GitService.pull")(function* (workspacePath: string) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: () => getGit(workspacePath).pull(["--recurse-submodules", "--ff"]),
          catch: (e) => gitError("failed to pull", e),
        }),
      ),
    )
  })

  const discardFileChanges = Effect.fn("GitService.discardFileChanges")(function* (
    workspacePath: string,
    file: string,
  ) {
    yield* withMutex(
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
        }),
      ),
    )
  })

  const discardAllChanges = Effect.fn("GitService.discardAllChanges")(function* (
    workspacePath: string,
  ) {
    yield* withMutex(
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
        }),
      ),
    )
  })

  const cloneRepo = Effect.fn("GitService.cloneRepo")(function* (url: string, targetPath: string) {
    yield* Effect.tryPromise({
      try: () => simpleGit().clone(url, targetPath),
      catch: (e) => gitError("failed to clone repository", e),
    })
    return targetPath
  })

  const initRepo = Effect.fn("GitService.initRepo")(function* (targetPath: string) {
    yield* Effect.tryPromise({
      try: () => simpleGit(targetPath).init(),
      catch: (e) => gitError("failed to initialize repository", e),
    })
    return targetPath
  })

  const stashPush = Effect.fn("GitService.stashPush")(function* (
    workspacePath: string,
    message?: string,
  ) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: async () => {
            const git = getGit(workspacePath)
            const args = ["push"]
            if (message) args.push("-m", message)
            try {
              await git.stash(args)
            } catch (e) {
              // "no local changes to save" is not an error
              const msg = e instanceof Error ? e.message : String(e)
              if (/no local changes to save/i.test(msg)) return
              throw e
            }
          },
          catch: (e) => gitError("failed to stash changes", e),
        }),
      ),
    )
  })

  const stashPop = Effect.fn("GitService.stashPop")(function* (
    workspacePath: string,
    index?: number,
  ) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: () => {
            const git = getGit(workspacePath)
            const args = ["pop"]
            if (index !== undefined) args.push(`stash@{${index}}`)
            return git.stash(args)
          },
          catch: (e) => gitError("failed to pop stash", e),
        }),
      ),
    )
  })

  const _stashList = Effect.fn("GitService.stashList")(function* (workspacePath: string) {
    const git = getGit(workspacePath)
    const raw = yield* Effect.tryPromise({
      try: () => git.stash(["list"]),
      catch: (e) => gitError("failed to list stashes", e),
    })
    return parseStashList(raw)
  })

  const stashList = (workspacePath: string): Effect.Effect<StashEntry[], GitError> =>
    deduplicated(`stashlist:${workspacePath}`, _stashList(workspacePath))

  const stashDrop = Effect.fn("GitService.stashDrop")(function* (
    workspacePath: string,
    index: number,
  ) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: () => getGit(workspacePath).stash(["drop", `stash@{${index}}`]),
          catch: (e) => gitError("failed to drop stash", e),
        }),
      ),
    )
  })

  const getConflictContent = Effect.fn("GitService.getConflictContent")(function* (
    workspacePath: string,
    filePath: string,
  ) {
    const git = getGit(workspacePath)
    // git merge stages: 1=base, 2=ours, 3=theirs
    const [ours, theirs, base] = yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          git.show([`:2:${filePath}`]).catch(() => ""),
          git.show([`:3:${filePath}`]).catch(() => ""),
          git.show([`:1:${filePath}`]).catch(() => ""),
        ]),
      catch: (e) => gitError("failed to get conflict content", e),
    })
    return { ours, theirs, base } as ConflictContent
  })

  const resolveConflict = Effect.fn("GitService.resolveConflict")(function* (
    workspacePath: string,
    filePath: string,
  ) {
    yield* withMutex(
      workspacePath,
      withLockRetry(
        Effect.tryPromise({
          try: () => getGit(workspacePath).add([filePath]),
          catch: (e) => gitError("failed to resolve conflict", e),
        }),
      ),
    )
  })

  return {
    getCurrentBranch,
    isGitRepo,
    getStatus,
    getFileDiff,
    getCommitLog,
    getCommitFiles,
    getBlame,
    getLineDiff,
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
    getRemoteUrl,
    getRemoteStatus,
    discardFileChanges,
    discardAllChanges,
    cloneRepo,
    initRepo,
    stashPush,
    stashPop,
    stashList,
    stashDrop,
    getConflictContent,
    resolveConflict,
    removeWorkspace,
  } as const
})

/**
 * git service for interacting with git repositories.
 *
 * use `GitService.Default` for production (includes FileSystem.Default).
 * use `GitService.DefaultWithoutDependencies` for tests (provide mock FileSystem).
 */
export class GitService extends Effect.Service<GitService>()("service/git", {
  scoped: makeGitService,
  dependencies: [FileSystem.Default],
}) {}
