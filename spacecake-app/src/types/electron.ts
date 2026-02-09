import type { DisplayStatusline } from "@/lib/statusline-parser"
import type { ClaudeTask, ClaudeTaskError } from "@/types/claude-task"
import type { AbsolutePath, FileContent, FileTree, FileTreeEvent } from "@/types/workspace"

import { FileSystemError } from "@/services/file-system"
import { type Either } from "@/types/adt"
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
    onStatuslineCleared: (handler: () => void) => () => void
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
  readDirectory: (dirPath: AbsolutePath) => Promise<Either<FileSystemError, FileTree>>
  startWatcher: (path: AbsolutePath) => Promise<Either<FileSystemError, undefined>>
  stopWatcher: (workspacePath: AbsolutePath) => Promise<Either<FileSystemError, undefined>>
  onFileEvent: (handler: (event: FileTreeEvent) => void) => () => void
  ensurePlansDirectory: (workspacePath: string) => Promise<Either<FileSystemError, undefined>>
  notifyFileClosed: (filePath: string) => Promise<void>
  updateCliWorkspaces: (workspaceFolders: string[]) => Promise<void>
  isPlaywright: boolean
  platform: string
  getHomeFolderPath: () => Promise<string>
  exists: (path: AbsolutePath) => Promise<Either<FileSystemError, boolean>>

  createTerminal: (
    id: string,
    cols: number,
    rows: number,
    cwd?: string,
  ) => Promise<Either<TerminalError, void>>
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<Either<TerminalError, void>>
  writeTerminal: (id: string, data: string) => Promise<Either<TerminalError, void>>
  killTerminal: (id: string) => Promise<Either<TerminalError, void>>
  onTerminalOutput: (handler: (id: string, data: string) => void) => () => void
  onIdeDisconnected: (handler: () => void) => () => void

  git: {
    getCurrentBranch: (workspacePath: string) => Promise<string | null>
    isGitRepo: (workspacePath: string) => Promise<boolean>
    startWatching: (
      workspacePath: string,
    ) => Promise<Either<{ _tag: "GitError"; description: string }, void>>
    stopWatching: (
      workspacePath: string,
    ) => Promise<Either<{ _tag: "GitError"; description: string }, void>>
    onBranchChange: (callback: (data: { path: string }) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    __terminalAPI?: import("@/hooks/use-ghostty-engine").TerminalAPI
  }
}
