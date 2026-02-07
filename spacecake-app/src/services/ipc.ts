import { Effect } from "effect"
import { BrowserWindow, dialog, ipcMain, shell } from "electron"
import fsNode from "fs/promises"
import path from "path"

import { normalizePath } from "@/lib/utils"
import { ClaudeSettingsFile, type StatuslineConfigStatus } from "@/services/claude-settings-file"
import { ClaudeTaskListService } from "@/services/claude-task-list"
import { FileSystem, type FileSystemError } from "@/services/file-system"
import { GitError, GitService } from "@/services/git"
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
    ipcMain.handle("read-directory", (_, path: string) =>
      Effect.runPromise(
        Effect.match(fs.readDirectory(normalizePath(path)), {
          onFailure: (error) => left(serializeError(error)),
          onSuccess: (tree) => right(tree),
        }),
      ),
    )
    ipcMain.handle("start-watcher", (_, path: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.startWatcher(path), {
          onFailure: (error) => left(serializeError(error)),
          onSuccess: () => right(undefined),
        }),
      ),
    )
    ipcMain.handle("stop-watcher", (_, path: AbsolutePath) =>
      Effect.runPromise(
        Effect.match(fs.stopWatcher(path), {
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

    ipcMain.handle("get-home-folder-path", () => home.homeDir)

    // Terminal IPC handlers
    ipcMain.handle("terminal:create", (_, id: string, cols: number, rows: number, cwd?: string) =>
      Effect.runPromise(
        Effect.match(terminal.create(id, cols, rows, cwd), {
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

    ipcMain.handle("git:start-watching", (_, workspacePath: string) =>
      Effect.runPromise(
        Effect.match(git.startWatching(workspacePath), {
          onFailure: (error) =>
            left({ _tag: "GitError" as const, description: (error as GitError).description }),
          onSuccess: () => right(undefined),
        }),
      ),
    )

    ipcMain.handle("git:stop-watching", (_, workspacePath: string) =>
      Effect.runPromise(
        Effect.match(git.stopWatching(workspacePath), {
          onFailure: (error) =>
            left({ _tag: "GitError" as const, description: (error as GitError).description }),
          onSuccess: () => right(undefined),
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
