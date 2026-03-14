import type { DisplayStatusline } from "@/lib/statusline-parser"
import { FileSystemError, type IndexedFile } from "@/services/file-system"
import type { GitErrorCode } from "@/services/git"
import { type Either } from "@/types/adt"
import type { ClaudeTask, ClaudeTaskError } from "@/types/claude-task"
import type { PyBlock } from "@/types/parser"
import type { AbsolutePath, FileContent, FileTree, FileTreeEvent } from "@/types/workspace"

export type MenuAction = "new-file" | "open-folder" | "save" | "save-all"

export type SerializedGitError = {
  _tag: "GitError"
  description: string
  code?: GitErrorCode
  detail?: string
}

/** serialized PgliteError for IPC transport */
export type SerializedPgliteError = { _tag: "PgliteError"; cause: string }

import type { DatabaseMethodName } from "@/services/database"
import {
  AtMentionedPayload,
  ClaudeCodeStatus,
  OpenFilePayload,
  SelectionChangedPayload,
} from "@/types/claude-code"
import { TerminalError } from "@/types/terminal"

/** Status of the statusline configuration */
export interface StatuslineConfigStatus {
  /** Whether statusLine is configured at all */
  configured: boolean
  /** Whether the configured command points to our spacecake script */
  isSpacecake: boolean
  /** Old inline `bash -c '…spacecake.sock…'` config from pre-auto-setup versions */
  isInlineSpacecake: boolean
  /** The current command, if any */
  command?: string
}

export interface ElectronAPI {
  claude: {
    ensureServer: (workspaceFolders: string[]) => Promise<void>
    notifySelectionChanged: (payload: SelectionChangedPayload) => Promise<void>
    notifyAtMentioned: (payload: AtMentionedPayload) => Promise<void>
    onStatusChange: (handler: (status: ClaudeCodeStatus) => void) => () => void
    onOpenFile: (handler: (payload: OpenFilePayload) => void) => () => void
    onStatuslineUpdate: (handler: (statusline: DisplayStatusline) => void) => () => void
    onStatuslineCleared: (handler: (surfaceId?: string) => void) => () => void
    clearSurface: (surfaceId: string) => Promise<void>
    checkSurfaceAlive: (surfaceId: string) => Promise<void>
    tasks: {
      startWatching: (sessionId?: string) => Promise<Either<ClaudeTaskError, void>>
      list: (sessionId?: string) => Promise<Either<ClaudeTaskError, ClaudeTask[]>>
      stopWatching: () => Promise<Either<ClaudeTaskError, void>>
      onChange: (handler: () => void) => () => void
    }
    statusline: {
      /** Read the current statusline configuration */
      read: () => Promise<Either<FileSystemError, StatuslineConfigStatus>>
      /** Configure statusline to use spacecake's hook script */
      update: () => Promise<Either<FileSystemError, void>>
      /** Remove statusline configuration */
      remove: () => Promise<Either<FileSystemError, void>>
    }
  }
  showOpenDialog: (options: unknown) => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  openExternal: (url: string) => Promise<void>
  readFile: (filePath: AbsolutePath) => Promise<Either<FileSystemError, FileContent>>

  createFolder: (folderPath: AbsolutePath) => Promise<Either<FileSystemError, undefined>>
  rename: (path: AbsolutePath, newPath: AbsolutePath) => Promise<Either<FileSystemError, undefined>>
  remove: (path: AbsolutePath, recursive?: boolean) => Promise<Either<FileSystemError, undefined>>
  saveFile: (filePath: AbsolutePath, content: string) => Promise<Either<FileSystemError, undefined>>
  readDirectory: (
    workspacePath: string,
    dirPath?: string,
    options?: { recursive?: boolean },
  ) => Promise<Either<FileSystemError, FileTree>>
  listFiles: (workspacePath: string) => Promise<Either<FileSystemError, IndexedFile[]>>
  startWatcher: (path: AbsolutePath) => Promise<Either<FileSystemError, undefined>>
  stopWatcher: (workspacePath: AbsolutePath) => Promise<Either<FileSystemError, undefined>>
  onFileEvent: (handler: (event: FileTreeEvent) => void) => () => void
  ensurePlansDirectory: (workspacePath: string) => Promise<Either<FileSystemError, undefined>>
  notifyFileClosed: (filePath: string) => Promise<void>
  updateCliWorkspaces: (workspaceFolders: string[]) => Promise<void>
  setTitleBarOverlay: (dark: boolean) => Promise<void>
  /** platform-specific titlebar height in px (accounts for macOS version) */
  titlebarHeight: number
  popupMenu: (position: { x: number; y: number }) => Promise<void>
  onMenuAction: (handler: (action: MenuAction) => void) => () => void
  isPlaywright: boolean
  platform: string
  checkWatchmanInstalled: () => Promise<boolean>
  getHomeFolderPath: () => Promise<string>
  exists: (path: AbsolutePath) => Promise<Either<FileSystemError, boolean>>

  createTerminal: (
    id: string,
    cols: number,
    rows: number,
    cwd?: string,
    surfaceId?: string,
  ) => Promise<Either<TerminalError, void>>
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<Either<TerminalError, void>>
  writeTerminal: (id: string, data: string) => Promise<Either<TerminalError, void>>
  killTerminal: (id: string) => Promise<Either<TerminalError, void>>
  onTerminalOutput: (handler: (id: string, data: string) => void) => () => void
  onIdeDisconnected: (handler: () => void) => () => void

  db: {
    invoke: (
      method: DatabaseMethodName,
      ...args: unknown[]
    ) => Promise<Either<SerializedPgliteError, unknown>>
    onInvalidate: (handler: (method: string) => void) => () => void
  }

  parser: {
    parseBlocks: (code: string, filePath?: string) => Promise<PyBlock[]>
  }

  git: {
    getCurrentBranch: (workspacePath: string) => Promise<string | null>
    isGitRepo: (workspacePath: string) => Promise<boolean>
    getStatus: (workspacePath: string) => Promise<
      Either<
        SerializedGitError,
        {
          modified: string[]
          staged: string[]
          untracked: string[]
          deleted: string[]
          conflicted: string[]
        }
      >
    >
    getFileDiff: (
      workspacePath: string,
      filePath: string,
      baseRef?: string,
      targetRef?: string,
    ) => Promise<Either<SerializedGitError, { oldContent: string; newContent: string }>>
    getCommitLog: (
      workspacePath: string,
      limit?: number,
    ) => Promise<
      Either<
        SerializedGitError,
        Array<{ hash: string; message: string; author: string; date: Date; files: string[] }>
      >
    >
    stage: (workspacePath: string, files: string[]) => Promise<Either<SerializedGitError, void>>
    unstage: (workspacePath: string, files: string[]) => Promise<Either<SerializedGitError, void>>
    commit: (
      workspacePath: string,
      message: string,
      opts?: { amend?: boolean; files?: string[] },
    ) => Promise<
      Either<
        SerializedGitError,
        {
          hash: string
          branch: string
          summary: { changes: number; insertions: number; deletions: number }
        }
      >
    >
    listBranches: (workspacePath: string) => Promise<
      Either<
        SerializedGitError,
        {
          current: string
          all: string[]
          branches: Record<
            string,
            { name: string; commit: string; current: boolean; label: string }
          >
        }
      >
    >
    createBranch: (workspacePath: string, name: string) => Promise<Either<SerializedGitError, void>>
    switchBranch: (workspacePath: string, name: string) => Promise<Either<SerializedGitError, void>>
    deleteBranch: (
      workspacePath: string,
      name: string,
      force?: boolean,
    ) => Promise<Either<SerializedGitError, void>>
    push: (workspacePath: string) => Promise<Either<SerializedGitError, void>>
    pull: (workspacePath: string) => Promise<Either<SerializedGitError, void>>
    fetch: (workspacePath: string) => Promise<Either<SerializedGitError, void>>
    getRemoteStatus: (
      workspacePath: string,
    ) => Promise<
      Either<
        SerializedGitError,
        { ahead: number; behind: number; tracking: string | null; current: string | null }
      >
    >
    discardFile: (workspacePath: string, file: string) => Promise<Either<SerializedGitError, void>>
    discardAll: (workspacePath: string) => Promise<Either<SerializedGitError, void>>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    __terminalAPI?: import("@/hooks/use-ghostty-engine").TerminalAPI
  }
}
