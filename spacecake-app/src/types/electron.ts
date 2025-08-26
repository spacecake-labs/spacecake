import type { FileContent, FileTreeEvent } from "@/types/workspace"

export interface ElectronAPI {
  showOpenDialog: (options: unknown) => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  showSaveDialog: (options: unknown) => Promise<{
    canceled: boolean
    filePath?: string
  }>
  readFile: (filePath: string) => Promise<{
    success: boolean
    file?: FileContent
    error?: string
  }>
  createFile: (
    filePath: string,
    content?: string
  ) => Promise<{
    success: boolean
    error?: string
  }>
  createFolder: (folderPath: string) => Promise<{
    success: boolean
    error?: string
  }>
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
  ) => Promise<{
    success: boolean
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
