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
  platform: process.platform,
});
