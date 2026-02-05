import { Data, Effect } from "effect"
import simpleGit, { type SimpleGit } from "simple-git"

import { FileSystem } from "@/services/file-system"
import { AbsolutePath } from "@/types/workspace"

export class GitError extends Data.TaggedError("GitError")<{
  readonly description: string
  readonly cause?: unknown
}> {}

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

  const startWatching = (workspacePath: string) =>
    Effect.gen(function* () {
      const isRepo = yield* isGitRepo(workspacePath)
      if (!isRepo) {
        // Not a git repo - silently succeed without starting a watcher
        return
      }
      const gitHeadPath = AbsolutePath(`${workspacePath}/.git/HEAD`)
      yield* fs.startFileWatcher(gitHeadPath, "git:branch:changed")
    }).pipe(
      Effect.mapError((e) => new GitError({ description: "Failed to watch git HEAD", cause: e })),
    )

  const stopWatching = (workspacePath: string) => {
    // Always attempt to stop - don't check isGitRepo because:
    // 1. The repo state may have changed since startWatching was called
    // 2. The watcher service handles "no watcher found" gracefully
    const gitHeadPath = AbsolutePath(`${workspacePath}/.git/HEAD`)
    return fs
      .stopFileWatcher(gitHeadPath)
      .pipe(
        Effect.mapError(
          (e) => new GitError({ description: "Failed to stop git watcher", cause: e }),
        ),
      )
  }

  return {
    getCurrentBranch,
    isGitRepo,
    startWatching,
    stopWatching,
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
