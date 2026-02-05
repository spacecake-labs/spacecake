import { Data, Effect } from "effect"
import simpleGit, { type SimpleGit } from "simple-git"

import { FileSystem } from "@/services/file-system"
import { AbsolutePath } from "@/types/workspace"

export class GitError extends Data.TaggedError("GitError")<{
  readonly description: string
  readonly cause?: unknown
}> {}

export class GitService extends Effect.Service<GitService>()("service/git", {
  effect: Effect.gen(function* () {
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

    const startWatching = (workspacePath: string) => {
      const gitHeadPath = AbsolutePath(`${workspacePath}/.git/HEAD`)
      return fs
        .startFileWatcher(gitHeadPath, "git:branch:changed")
        .pipe(
          Effect.mapError(
            (e) => new GitError({ description: "Failed to watch git HEAD", cause: e }),
          ),
        )
    }

    const stopWatching = (workspacePath: string) => {
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
  }),
  dependencies: [FileSystem.Default],
}) {}
