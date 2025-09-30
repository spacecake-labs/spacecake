import { FileSystemError } from "@/services/file-system"

import { type Either } from "@/types/adt"
import type { FileContent, FileTree, FileTreeEvent } from "@/types/workspace"

export interface ElectronAPI {
  showOpenDialog: (options: unknown) => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  showSaveDialog: (options: unknown) => Promise<{
    canceled: boolean
    filePath?: string
  }>
  readFile: (filePath: string) => Promise<Either<FileSystemError, FileContent>>

  createFolder: (
    folderPath: string
  ) => Promise<Either<FileSystemError, undefined>>
  renameFile: (
    oldPath: string,
    newPath: string
  ) => Promise<{
    success: boolean
    error?: string
  }>
  deleteFile: (filePath: string) => Promise<{
    success: boolean
    error?: string
  }>
  saveFile: (
    filePath: string,
    content: string
  ) => Promise<Either<FileSystemError, undefined>>
  readWorkspace: (dirPath: string) => Promise<{
    success: boolean
    tree?: FileTree
    error?: string
  }>
  watchWorkspace: (workspacePath: string) => Promise<{
    success: boolean
    error?: string
  }>
  stopWatching: (workspacePath: string) => Promise<{
    success: boolean
    error?: string
  }>
  onFileEvent: (handler: (event: FileTreeEvent) => void) => () => void
  platform: string
  pathExists: (path: string) => Promise<Either<FileSystemError, boolean>>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
