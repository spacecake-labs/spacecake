import { contextBridge, ipcRenderer } from "electron"

import type { FileContent, FileTreeEvent } from "@/types/workspace"

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  showOpenDialog: (options: unknown) =>
    ipcRenderer.invoke("show-open-dialog", options),
  readWorkspace: (dirPath: string) => {
    return ipcRenderer.invoke("read-workspace", dirPath)
  },
  readFile: (filePath: string): Promise<FileContent> =>
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
  stopWatching: (workspacePath: string) =>
    ipcRenderer.invoke("stop-watching", workspacePath),
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
  pathExists: (path: string) => ipcRenderer.invoke("path-exists", path),
})
