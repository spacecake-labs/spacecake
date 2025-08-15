import { contextBridge, ipcRenderer } from "electron";

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  showOpenDialog: (options: unknown) =>
    ipcRenderer.invoke("show-open-dialog", options),
  showSaveDialog: (options: unknown) =>
    ipcRenderer.invoke("show-save-dialog", options),
  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke("read-directory", dirPath),
  readWorkspace: (dirPath: string) =>
    ipcRenderer.invoke("read-workspace", dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke("read-file", filePath),
  createFile: (filePath: string, content?: string) =>
    ipcRenderer.invoke("create-file", filePath, content),
  createFolder: (folderPath: string) =>
    ipcRenderer.invoke("create-folder", folderPath),
  renameFile: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke("rename-file", oldPath, newPath),
  deleteFile: (filePath: string) => ipcRenderer.invoke("delete-file", filePath),
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("save-file", filePath, content),
  platform: process.platform,
  watchWorkspace: (workspacePath: string) =>
    ipcRenderer.invoke("watch-workspace", workspacePath),
  onFileEvent: (
    handler: (evt: {
      type: string;
      path: string;
      etag?: { mtimeMs: number; size: number } | null;
    }) => void
  ) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: {
        type: string;
        path: string;
        etag?: { mtimeMs: number; size: number } | null;
      }
    ) => handler(payload);
    ipcRenderer.on("file-event", listener);
    return () => ipcRenderer.removeListener("file-event", listener);
  },
});
