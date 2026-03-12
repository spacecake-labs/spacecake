import { execFile } from "child_process"
import fsNode from "fs/promises"
import path from "path"
import { promisify } from "util"

import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { BrowserWindow, dialog, ipcMain, shell } from "electron"

import { MUTATION_METHOD_NAMES } from "@/lib/db/mutation-methods"
import { normalizePath } from "@/lib/utils"
import { ClaudeSettingsFile, type StatuslineConfigStatus } from "@/services/claude-settings-file"
import { ClaudeTaskListService } from "@/services/claude-task-list"
import { Database, type DatabaseMethodName } from "@/services/database"
import { FileSystem, type FileSystemError, type IndexedFile } from "@/services/file-system"
import { GitCommit, GitError, GitFileDiff, GitService, GitStatus } from "@/services/git"
import { SpacecakeHome } from "@/services/spacecake-home"
import { Terminal } from "@/services/terminal"
import { left, right, type Either } from "@/types/adt"
import { ClaudeTaskError } from "@/types/claude-task"
import { AbsolutePath, FileContent } from "@/types/workspace"

// Plain object representation of FileSystemError for IPC serialization
// (Error instances lose custom properties like _tag during structured clone)
type SerializedFileSystemError = {
  _tag: FileSystemError["_tag"]
  path: string | undefined
  description: string
}

const serializeError = (error: FileSystemError): SerializedFileSystemError => ({
  _tag: error._tag,
  path: error.path,
  description: error.description,
})

// Plain object representation of ClaudeTaskError for IPC serialization
type SerializedClaudeTaskError = {
  _tag: "ClaudeTaskError"
  description: string
  path: string | undefined
}

const serializeTaskError = (error: ClaudeTaskError): SerializedClaudeTaskError => ({
  _tag: error._tag,
  description: error.description,
  path: error.path,
})

export class Ipc extends Effect.Service<Ipc>()("Ipc", {
  effect: Effect.gen(function* (_) {
    const fs = yield* FileSystem
    const terminal = yield* Terminal
    const taskList = yield* ClaudeTaskListService
    const settingsFile = yield* ClaudeSettingsFile
    const home = yield* SpacecakeHome
    const git = yield* GitService
    const db = yield* Database

    // ---------------------------------------------------------------------------
    // Database IPC — routes method calls from renderer to main-process PGlite
    // ---------------------------------------------------------------------------

    // non-callable properties that must not be dispatched via IPC
    const NON_CALLABLE = new Set<string>(["client", "orm", "query"])

    // mutation methods that trigger invalidation — single source of truth in invalidation.ts

    ipcMain.handle("db:invoke", async (event, method: string, ...args: unknown[]) => {
      if (NON_CALLABLE.has(method)) {
        return left({ _tag: "PgliteError" as const, cause: `${method} is not callable via IPC` })
      }

      const fn = db[method as DatabaseMethodName]
      if (typeof fn !== "function") {
        return left({ _tag: "PgliteError" as const, cause: `unknown db method: ${method}` })
      }

      // single contained cast — args are untyped at the IPC boundary
      const handler = fn as (...a: unknown[]) => Effect.Effect<unknown, unknown>
      const exit = await Effect.runPromiseExit(handler(...args))

      if (Exit.isFailure(exit)) {
        const squashed = Cause.squash(exit.cause)
        console.error("[main:db] ERROR in", method, ":", squashed)
        return left({
          _tag: "PgliteError" as const,
          cause: squashed instanceof Error ? squashed.message : String(squashed),
        })
      }

      // notify renderer of data changes after mutations
      if (MUTATION_METHOD_NAMES.has(method)) {
        BrowserWindow.fromWebContents(event.sender)?.webContents.send("db:invalidate", method)
      }

      return right(exit.value)
    })

    ipcMain.handle(
      "read-file",
      (_, filePath: AbsolutePath): Promise<Either<SerializedFileSystemError, FileContent>> =>
        Effect.runPromise(
          Effect.match(fs.readTextFile(filePath), {
            onFailure: (error) => left(serializeError(error)),
            onSuccess: (file) => right(file),
          }),
        ),
    )
    ipcMain.handle("save-file", (_, path, content) =>
      Effect.runPromise(
        Effect.match(fs.writeTextFile(path, content), {
          onFailure: (error) => left(serializeError(error)),
          onSuccess: () => right(undefined),
        }),
      ),
    )
    ipcMain.handle("create-folder", (_, folderPath: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.createFolder(folderPath), {
          onFailure: (error) => left(serializeError(error)),
          onSuccess: () => right(undefined),
        }),
      ),
    )
    ipcMain.handle("remove", (_, path: AbsolutePath, recursive?: boolean) =>
      Effect.runPromise(
        Effect.match(fs.remove(path, recursive), {
          onFailure: (error) => left(serializeError(error)),
          onSuccess: () => right(undefined),
        }),
      ),
    )
    ipcMain.handle("rename", (_, path: AbsolutePath, newPath: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.rename(path, newPath), {
          onFailure: (error) => left(serializeError(error)),
          onSuccess: () => right(undefined),
        }),
      ),
    )
    ipcMain.handle("path-exists", (_, path: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.exists(path), {
          onFailure: (error) => left(serializeError(error)),
          onSuccess: (exists) => right(exists),
        }),
      ),
    )
    ipcMain.handle(
      "read-directory",
      (_, workspacePath: string, dirPath?: string, options?: { recursive?: boolean }) =>
        Effect.runPromise(
          Effect.match(
            fs.readDirectory(
              normalizePath(workspacePath),
              dirPath ? normalizePath(dirPath) : undefined,
              options,
            ),
            {
              onFailure: (error) => left(serializeError(error)),
              onSuccess: (tree) => right(tree),
            },
          ),
        ),
    )
    ipcMain.handle(
      "list-files",
      (_, workspacePath: string): Promise<Either<SerializedFileSystemError, IndexedFile[]>> =>
        Effect.runPromise(
          Effect.match(fs.listFiles(normalizePath(workspacePath)), {
            onFailure: (error) => left(serializeError(error)),
            onSuccess: (files) => right(files),
          }),
        ),
    )
    ipcMain.handle("start-watcher", (_, watchPath: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.startWatcher(AbsolutePath(normalizePath(watchPath))), {
          onFailure: (error) => left(serializeError(error)),
          onSuccess: () => right(undefined),
        }),
      ),
    )
    ipcMain.handle("stop-watcher", (_, watchPath: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.stopWatcher(AbsolutePath(normalizePath(watchPath))), {
          onFailure: (error) => left(serializeError(error)),
          onSuccess: () => right(undefined),
        }),
      ),
    )
    ipcMain.handle("show-open-dialog", async (event, options) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      // Normalize paths to forward slashes for cross-platform consistency
      return {
        ...result,
        filePaths: result.filePaths.map(normalizePath),
      }
    })

    ipcMain.handle("open-external", (_, url: string) => shell.openExternal(url))

    // watchman detection — mirrors jest's execFile pattern
    ipcMain.handle("check-watchman-installed", async () => {
      try {
        await promisify(execFile)("watchman", ["--version"])
        return true
      } catch {
        return false
      }
    })

    ipcMain.handle("get-home-folder-path", () => home.homeDir)

    // Terminal IPC handlers
    ipcMain.handle(
      "terminal:create",
      (_, id: string, cols: number, rows: number, cwd?: string, surfaceId?: string) =>
        Effect.runPromise(
          Effect.match(terminal.create(id, cols, rows, cwd, surfaceId), {
            onFailure: (error) => left(error),
            onSuccess: () => right(undefined),
          }),
        ),
    )

    ipcMain.handle("terminal:resize", (_, id: string, cols: number, rows: number) =>
      Effect.runPromise(
        Effect.match(terminal.resize(id, cols, rows), {
          onFailure: (error) => left(error),
          onSuccess: () => right(undefined),
        }),
      ),
    )

    ipcMain.handle("terminal:write", (_, id: string, data: string) =>
      Effect.runPromise(
        Effect.match(terminal.write(id, data), {
          onFailure: (error) => left(error),
          onSuccess: () => right(undefined),
        }),
      ),
    )

    ipcMain.handle("terminal:kill", (_, id: string) =>
      Effect.runPromise(
        Effect.match(terminal.kill(id), {
          onFailure: (error) => left(error),
          onSuccess: () => right(undefined),
        }),
      ),
    )

    // Claude Tasks IPC handlers
    ipcMain.handle("claude:tasks:start-watching", (_, sessionId?: string) =>
      Effect.runPromise(
        Effect.match(taskList.startWatching(sessionId), {
          onFailure: (error) => left(serializeTaskError(error)),
          onSuccess: () => right(undefined),
        }),
      ),
    )

    ipcMain.handle("claude:tasks:list", (_, sessionId?: string) => {
      try {
        const tasks = taskList.listTasks(sessionId)
        return right(tasks)
      } catch (error) {
        return left(
          serializeTaskError(
            error instanceof ClaudeTaskError
              ? error
              : new ClaudeTaskError({ description: String(error) }),
          ),
        )
      }
    })

    ipcMain.handle("claude:tasks:stop-watching", () =>
      Effect.runPromise(
        Effect.match(taskList.stopWatching(), {
          onFailure: (error) => left(serializeTaskError(error)),
          onSuccess: () => right(undefined),
        }),
      ),
    )

    // Claude Statusline IPC handlers
    ipcMain.handle(
      "claude:statusline:read",
      (): Promise<Either<SerializedFileSystemError, StatuslineConfigStatus>> =>
        Effect.runPromise(
          Effect.match(settingsFile.getStatuslineStatus(), {
            onFailure: (error) => left(serializeError(error)),
            onSuccess: (status) => right(status),
          }),
        ),
    )

    ipcMain.handle(
      "claude:statusline:update",
      (): Promise<Either<SerializedFileSystemError, void>> =>
        Effect.runPromise(
          Effect.match(settingsFile.configureForSpacecake(), {
            onFailure: (error) => left(serializeError(error)),
            onSuccess: () => right(undefined),
          }),
        ),
    )

    ipcMain.handle(
      "claude:statusline:remove",
      (): Promise<Either<SerializedFileSystemError, void>> =>
        Effect.runPromise(
          Effect.match(settingsFile.updateStatusline(null), {
            onFailure: (error) => left(serializeError(error)),
            onSuccess: () => right(undefined),
          }),
        ),
    )

    // Ensure plansDirectory is set in project-level .claude/settings.json
    ipcMain.handle("claude:project-settings:ensure-plans-dir", async (_, workspacePath: string) => {
      try {
        const claudeDir = path.join(workspacePath, ".claude")
        const settingsPath = path.join(claudeDir, "settings.json")

        // Ensure .claude/ directory exists
        await fsNode.mkdir(claudeDir, { recursive: true })

        // Read existing settings or start with empty object
        let settings: Record<string, unknown> = {}
        try {
          const content = await fsNode.readFile(settingsPath, "utf-8")
          settings = JSON.parse(content)
        } catch {
          // File doesn't exist or invalid JSON — start fresh
        }

        // Only write if plansDirectory is not already configured
        if (!settings.plansDirectory) {
          settings.plansDirectory = ".claude/plans"
          await fsNode.writeFile(settingsPath, JSON.stringify(settings, null, 2))
        }

        return right(undefined)
      } catch (error) {
        return left({
          _tag: "UnknownFSError" as const,
          path: workspacePath,
          description: String(error),
        })
      }
    })

    // Parser IPC handler — tree-sitter runs in main process (native module)
    let _parseBlocksForFile: typeof import("@/lib/parser/python/blocks").parseBlocksForFile | null =
      null
    ipcMain.handle("parser:parse-blocks", async (_, code: string, filePath?: string) => {
      _parseBlocksForFile ??= (await import("@/lib/parser/python/blocks")).parseBlocksForFile
      return _parseBlocksForFile(code, filePath)
    })

    // Git IPC handlers
    ipcMain.handle("git:branch:current", (_, workspacePath: string) =>
      Effect.runPromise(
        Effect.match(git.getCurrentBranch(workspacePath), {
          onFailure: () => null,
          onSuccess: (branch) => branch,
        }),
      ),
    )

    ipcMain.handle("git:is-repo", (_, workspacePath: string) =>
      Effect.runPromise(git.isGitRepo(workspacePath)),
    )

    // Plain object representation of GitError for IPC serialization
    type SerializedGitError = {
      _tag: "GitError"
      description: string
    }

    const serializeGitError = (error: GitError): SerializedGitError => ({
      _tag: "GitError",
      description: error.description,
    })

    ipcMain.handle(
      "git:status",
      (_, workspacePath: string): Promise<Either<SerializedGitError, GitStatus>> =>
        Effect.runPromise(
          Effect.match(git.getStatus(workspacePath), {
            onFailure: (error) => left(serializeGitError(error)),
            onSuccess: (status) => right(status),
          }),
        ),
    )

    ipcMain.handle(
      "git:file-diff",
      (
        _,
        workspacePath: string,
        filePath: string,
        baseRef?: string,
        targetRef?: string,
      ): Promise<Either<SerializedGitError, GitFileDiff>> =>
        Effect.runPromise(
          Effect.match(git.getFileDiff(workspacePath, filePath, baseRef, targetRef), {
            onFailure: (error) => left(serializeGitError(error)),
            onSuccess: (diff) => right(diff),
          }),
        ),
    )

    ipcMain.handle(
      "git:commit-log",
      (
        _,
        workspacePath: string,
        limit?: number,
      ): Promise<Either<SerializedGitError, GitCommit[]>> =>
        Effect.runPromise(
          Effect.match(git.getCommitLog(workspacePath, limit), {
            onFailure: (error) => left(serializeGitError(error)),
            onSuccess: (commits) => right(commits),
          }),
        ),
    )

    return {}
  }),
  dependencies: [
    FileSystem.Default,
    Terminal.Default,
    ClaudeTaskListService.Default,
    ClaudeSettingsFile.Default,
    GitService.Default,
  ],
}) {}
