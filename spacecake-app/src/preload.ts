import { contextBridge, ipcRenderer } from "electron"

import type { FileContent, FileTreeEvent } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  showOpenDialog: (options: unknown) =>
    ipcRenderer.invoke("show-open-dialog", options),
  readDirectory: (dirPath: string) => {
    return ipcRenderer.invoke("read-directory", dirPath)
  },
  readFile: (filePath: AbsolutePath): Promise<FileContent> =>
    ipcRenderer.invoke("read-file", filePath),

  createFolder: (folderPath: string) =>
    ipcRenderer.invoke("create-folder", folderPath),
  rename: (path: string, newPath: string) =>
    ipcRenderer.invoke("rename", path, newPath),
  remove: (filePath: string, recursive?: boolean) =>
    ipcRenderer.invoke("remove", filePath, recursive),
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("save-file", filePath, content),
  platform: process.platform,
  startWatcher: (path: string) => ipcRenderer.invoke("start-watcher", path),
  stopWatcher: (workspacePath: string) =>
    ipcRenderer.invoke("stop-watcher", workspacePath),
  onFileEvent: (handler: (evt: FileTreeEvent) => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: FileTreeEvent
    ) => {
      handler(payload)
    }
    ipcRenderer.on("file-event", listener)
    return () => ipcRenderer.removeListener("file-event", listener)
  },
  exists: (path: string) => ipcRenderer.invoke("path-exists", path),
  createTerminal: (id: string, cols: number, rows: number, cwd?: string) =>
    ipcRenderer.invoke("terminal:create", id, cols, rows, cwd),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke("terminal:resize", id, cols, rows),
  writeTerminal: (id: string, data: string) =>
    ipcRenderer.invoke("terminal:write", id, data),
  killTerminal: (id: string) => ipcRenderer.invoke("terminal:kill", id),
  onTerminalOutput: (handler: (id: string, data: string) => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { id: string; data: string }
    ) => {
      handler(payload.id, payload.data)
    }
    ipcRenderer.on("terminal:output", listener)
    return () => ipcRenderer.removeListener("terminal:output", listener)
  },
})
