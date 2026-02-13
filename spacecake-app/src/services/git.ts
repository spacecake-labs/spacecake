import { Data, Effect } from "effect"
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
    Effect.tryPromise({
      try: async () => {
        const git = getGit(workspacePath)
        const log = await git.log({
          maxCount: limit,
          "--name-only": null, // Include file names
        })

        return log.all.map((commit) => ({
          hash: commit.hash,
          message: commit.message,
          author: commit.author_name,
          date: new Date(commit.date),
          files: (commit.diff?.files ?? []).map((f) => f.file),
        }))
      },
      catch: (e) => {
        console.error("Git log error for path:", workspacePath, e)
        return new GitError({
          description: `Failed to get commit log: ${e instanceof Error ? e.message : String(e)}`,
          cause: e,
        })
      },
    })

  return {
    getCurrentBranch,
    isGitRepo,
    getStatus,
    getFileDiff,
    getCommitLog,
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
