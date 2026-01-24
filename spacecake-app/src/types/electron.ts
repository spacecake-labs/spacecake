import { FileSystemError } from "@/services/file-system"

import { type Either } from "@/types/adt"
import {
  AtMentionedPayload,
  ClaudeCodeStatus,
  OpenFilePayload,
  SelectionChangedPayload,
} from "@/types/claude-code"
import type {
  ClaudeTask,
  ClaudeTaskError,
  ClaudeTaskEvent,
} from "@/types/claude-task"
import { TerminalError } from "@/types/terminal"
import type {
  AbsolutePath,
  FileContent,
  FileTree,
  FileTreeEvent,
} from "@/types/workspace"
import type { DisplayStatusline } from "@/lib/statusline-parser"

export interface ElectronAPI {
  claude: {
    ensureServer: (workspaceFolders: string[]) => Promise<void>
    notifySelectionChanged: (payload: SelectionChangedPayload) => Promise<void>
    notifyAtMentioned: (payload: AtMentionedPayload) => Promise<void>
    onStatusChange: (handler: (status: ClaudeCodeStatus) => void) => () => void
    onOpenFile: (handler: (payload: OpenFilePayload) => void) => () => void
    onStatuslineUpdate: (
      handler: (statusline: DisplayStatusline) => void
    ) => () => void
    tasks: {
      startWatching: (
        sessionId?: string
      ) => Promise<Either<ClaudeTaskError, void>>
      list: (
        sessionId?: string
      ) => Promise<Either<ClaudeTaskError, ClaudeTask[]>>
      stopWatching: () => Promise<Either<ClaudeTaskError, void>>
      onEvent: (handler: (event: ClaudeTaskEvent) => void) => () => void
    }
  }
  showOpenDialog: (options: unknown) => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  readFile: (
    filePath: AbsolutePath
  ) => Promise<Either<FileSystemError, FileContent>>

  createFolder: (
    folderPath: AbsolutePath
  ) => Promise<Either<FileSystemError, undefined>>
  rename: (
    path: AbsolutePath,
    newPath: AbsolutePath
  ) => Promise<Either<FileSystemError, undefined>>
  remove: (
    path: AbsolutePath,
    recursive?: boolean
  ) => Promise<Either<FileSystemError, undefined>>
  saveFile: (
    filePath: AbsolutePath,
    content: string
  ) => Promise<Either<FileSystemError, undefined>>
  readDirectory: (
    dirPath: AbsolutePath
  ) => Promise<Either<FileSystemError, FileTree>>
  startWatcher: (
    path: AbsolutePath
  ) => Promise<Either<FileSystemError, undefined>>
  stopWatcher: (
    workspacePath: AbsolutePath
  ) => Promise<Either<FileSystemError, undefined>>
  onFileEvent: (handler: (event: FileTreeEvent) => void) => () => void
  platform: string
  getHomeFolderPath: () => Promise<string>
  exists: (path: AbsolutePath) => Promise<Either<FileSystemError, boolean>>

  createTerminal: (
    id: string,
    cols: number,
    rows: number,
    cwd?: string
  ) => Promise<Either<TerminalError, void>>
  resizeTerminal: (
    id: string,
    cols: number,
    rows: number
  ) => Promise<Either<TerminalError, void>>
  writeTerminal: (
    id: string,
    data: string
  ) => Promise<Either<TerminalError, void>>
  killTerminal: (id: string) => Promise<Either<TerminalError, void>>
  onTerminalOutput: (handler: (id: string, data: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    __terminalAPI?: import("@/hooks/use-ghostty-engine").TerminalAPI
  }
}
