import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import simpleGit, { type SimpleGit } from "simple-git"

import { FileSystem } from "@/services/file-system"
import { AbsolutePath } from "@/types/workspace"

export class GitError extends Data.TaggedError("GitError")<{
  readonly description: string
  readonly cause?: unknown
}> {}

export type GitStatus = {
  modified: string[]
  staged: string[]
  untracked: string[]
  deleted: string[]
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

const makeGitService = Effect.gen(function* () {
  const fs = yield* FileSystem
  const instances = new Map<string, SimpleGit>()

  const getGit = (workspacePath: string) => {
    if (!instances.has(workspacePath)) {
      instances.set(workspacePath, simpleGit(workspacePath))
    }
    return instances.get(workspacePath)!
  }

  const getCurrentBranch = (workspacePath: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const result = await git.branchLocal()
        return result.current
      },
      catch: (e) => new GitError({ description: "Failed to get branch", cause: e }),
    })

  const isGitRepo = (workspacePath: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        return await git.checkIsRepo()
      },
      catch: () => false,
    }).pipe(Effect.catchAll(() => Effect.succeed(false)))

  const getStatus = (workspacePath: string): Effect.Effect<GitStatus, GitError> =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const status = await git.status()
        return {
          modified: status.modified,
          staged: status.staged,
          untracked: status.not_added,
          deleted: status.deleted,
        }
      },
      catch: (e) => {
        console.error("Git status error for path:", workspacePath, e)
        return new GitError({
          description: `Failed to get git status: ${e instanceof Error ? e.message : String(e)}`,
          cause: e,
        })
      },
    })

  const getFileDiff = (
    workspacePath: string,
    filePath: string,
    baseRef?: string,
    targetRef?: string,
  ): Effect.Effect<GitFileDiff, GitError> =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)

        // Get old content (from baseRef, default HEAD)
        let oldContent = ""
        try {
          const ref = baseRef ?? "HEAD"
          oldContent = await git.show([`${ref}:${filePath}`])
        } catch {
          // File doesn't exist in base ref (new file)
          oldContent = ""
        }

        // Get new content (from targetRef, default working directory)
        let newContent = ""
        if (targetRef) {
          try {
            newContent = await git.show([`${targetRef}:${filePath}`])
          } catch {
            newContent = ""
          }
        } else {
          // Read from working directory
          const fullPath = AbsolutePath(`${workspacePath}/${filePath}`)
          const file = await Effect.runPromise(fs.readTextFile(fullPath))
          newContent = file.content
        }

        return { oldContent, newContent }
      },
      catch: (e) => new GitError({ description: "Failed to get file diff", cause: e }),
    })

  const getCommitLog = (workspacePath: string, limit = 50): Effect.Effect<GitCommit[], GitError> =>
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
          git.log({ maxCount: limit, "--name-only": null }).then((log) =>
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
          return new GitError({
            description: `Failed to get commit log: ${e instanceof Error ? e.message : String(e)}`,
            cause: e,
          })
        },
      })
    })

  const stageFiles = (workspacePath: string, files: string[]) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        await git.add(files)
      },
      catch: (e) => new GitError({ description: "failed to stage files", cause: e }),
    })

  const unstageFiles = (workspacePath: string, files: string[]) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        await git.reset(["HEAD", "--", ...files])
      },
      catch: (e) => new GitError({ description: "failed to unstage files", cause: e }),
    })

  const commit = (
    workspacePath: string,
    message: string,
    opts?: { amend?: boolean },
  ): Effect.Effect<GitCommitResult, GitError> =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
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
      catch: (e) => new GitError({ description: "failed to commit", cause: e }),
    })

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
      catch: (e) => new GitError({ description: "failed to list branches", cause: e }),
    })

  const createBranch = (workspacePath: string, name: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        await git.checkoutLocalBranch(name)
      },
      catch: (e) => new GitError({ description: "failed to create branch", cause: e }),
    })

  const switchBranch = (workspacePath: string, name: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        await git.checkout(name)
      },
      catch: (e) => new GitError({ description: "failed to switch branch", cause: e }),
    })

  const deleteBranch = (workspacePath: string, name: string, force?: boolean) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        await git.deleteLocalBranch(name, force)
      },
      catch: (e) => new GitError({ description: "failed to delete branch", cause: e }),
    })

  const push = (workspacePath: string): Effect.Effect<void, GitError> =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const status = await git.status()
        if (!status.tracking) {
          await git.push(["-u", "origin", status.current!])
        } else {
          await git.push()
        }
      },
      catch: (e) => new GitError({ description: "failed to push", cause: e }),
    })

  const pull = (workspacePath: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        await git.pull()
      },
      catch: (e) => new GitError({ description: "failed to pull", cause: e }),
    })

  const fetchAll = (workspacePath: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        await git.fetch(["--all"])
      },
      catch: (e) => new GitError({ description: "failed to fetch", cause: e }),
    })

  const getRemoteStatus = (workspacePath: string): Effect.Effect<GitRemoteStatus, GitError> =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const status = await git.status()
        return {
          ahead: status.ahead,
          behind: status.behind,
          tracking: status.tracking,
          current: status.current,
        }
      },
      catch: (e) => new GitError({ description: "failed to get remote status", cause: e }),
    })

  const discardFileChanges = (workspacePath: string, file: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const status = await git.status()
        const isUntracked = status.not_added.includes(file)
        if (isUntracked) {
          await git.clean("f", ["--", file])
        } else {
          await git.checkout(["--", file])
        }
      },
      catch: (e) => new GitError({ description: "failed to discard file changes", cause: e }),
    })

  const discardAllChanges = (workspacePath: string) =>
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        await git.checkout(["--", "."])
        await git.clean("f", ["-d"])
      },
      catch: (e) => new GitError({ description: "failed to discard all changes", cause: e }),
    })

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
