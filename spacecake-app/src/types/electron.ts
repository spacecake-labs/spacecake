import { FileSystemError } from "@/services/file-system"

import { type Either } from "@/types/adt"
import type { FileContent, FileTree, FileTreeEvent } from "@/types/workspace"

export interface ElectronAPI {
  showOpenDialog: (options: unknown) => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  readFile: (filePath: string) => Promise<Either<FileSystemError, FileContent>>

  createFolder: (
    folderPath: string
  ) => Promise<Either<FileSystemError, undefined>>
  rename: (
    path: string,
    newPath: string
  ) => Promise<Either<FileSystemError, undefined>>
  remove: (
    path: string,
    recursive?: boolean
  ) => Promise<Either<FileSystemError, undefined>>
  saveFile: (
    filePath: string,
    content: string
  ) => Promise<Either<FileSystemError, undefined>>
  readDirectory: (dirPath: string) => Promise<Either<FileSystemError, FileTree>>
  startWatcher: (path: string) => Promise<Either<FileSystemError, undefined>>
  stopWatcher: (
    workspacePath: string
  ) => Promise<Either<FileSystemError, undefined>>
  onFileEvent: (handler: (event: FileTreeEvent) => void) => () => void
  platform: string
  pathExists: (path: string) => Promise<Either<FileSystemError, boolean>>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
