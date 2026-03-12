import { contextBridge, ipcRenderer } from "electron"

import type { DisplayStatusline } from "@/lib/statusline-parser"
import {
  AtMentionedPayload,
  ClaudeCodeStatus,
  OpenFilePayload,
  SelectionChangedPayload,
} from "@/types/claude-code"
import type { FileContent, FileTreeEvent } from "@/types/workspace"
import { AbsolutePath } from "@/types/workspace"

// titlebar height is passed from the main process via additionalArguments
// (preload sandbox cannot import node:os for version detection)
const titlebarHeightArg = process.argv.find((arg) => arg.startsWith("--titlebar-height="))
const titlebarHeight = titlebarHeightArg ? parseInt(titlebarHeightArg.split("=")[1], 10) : 35

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  claude: {
    ensureServer: (workspaceFolders: string[]) =>
      ipcRenderer.invoke("claude:ensure-server", workspaceFolders),
    notifySelectionChanged: (payload: SelectionChangedPayload) =>
      ipcRenderer.invoke("claude:selection-changed", payload),
    notifyAtMentioned: (payload: AtMentionedPayload) =>
      ipcRenderer.invoke("claude:at-mentioned", payload),
    onStatusChange: (handler: (status: ClaudeCodeStatus) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, status: ClaudeCodeStatus) => {
        handler(status)
      }
      ipcRenderer.on("claude-code-status", listener)
      return () => ipcRenderer.removeListener("claude-code-status", listener)
    },
    onOpenFile: (handler: (payload: OpenFilePayload) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: OpenFilePayload) => {
        handler(payload)
      }
      ipcRenderer.on("claude:open-file", listener)
      return () => ipcRenderer.removeListener("claude:open-file", listener)
    },
    onStatuslineUpdate: (handler: (statusline: DisplayStatusline) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, statusline: DisplayStatusline) => {
        handler(statusline)
      }
      ipcRenderer.on("statusline-update", listener)
      return () => ipcRenderer.removeListener("statusline-update", listener)
    },
    onStatuslineCleared: (handler: (surfaceId?: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, surfaceId?: string) => handler(surfaceId)
      ipcRenderer.on("statusline-cleared", listener)
      return () => ipcRenderer.removeListener("statusline-cleared", listener)
    },
    clearSurface: (surfaceId: string) => ipcRenderer.invoke("statusline:clear-surface", surfaceId),
    tasks: {
      startWatching: (sessionId?: string) =>
        ipcRenderer.invoke("claude:tasks:start-watching", sessionId),
      list: (sessionId?: string) => ipcRenderer.invoke("claude:tasks:list", sessionId),
      stopWatching: () => ipcRenderer.invoke("claude:tasks:stop-watching"),
      onChange: (handler: () => void) => {
        const listener = () => handler()
        ipcRenderer.on("claude:tasks:changed", listener)
        return () => ipcRenderer.removeListener("claude:tasks:changed", listener)
      },
    },
    statusline: {
      read: () => ipcRenderer.invoke("claude:statusline:read"),
      update: () => ipcRenderer.invoke("claude:statusline:update"),
      remove: () => ipcRenderer.invoke("claude:statusline:remove"),
    },
  },
  showOpenDialog: (options: unknown) => ipcRenderer.invoke("show-open-dialog", options),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  readDirectory: (workspacePath: string, dirPath?: string, options?: { recursive?: boolean }) => {
    return ipcRenderer.invoke("read-directory", workspacePath, dirPath, options)
  },
  listFiles: (workspacePath: string) => ipcRenderer.invoke("list-files", workspacePath),
  readFile: (filePath: AbsolutePath): Promise<FileContent> =>
    ipcRenderer.invoke("read-file", filePath),

  createFolder: (folderPath: string) => ipcRenderer.invoke("create-folder", folderPath),
  rename: (path: string, newPath: string) => ipcRenderer.invoke("rename", path, newPath),
  remove: (filePath: string, recursive?: boolean) =>
    ipcRenderer.invoke("remove", filePath, recursive),
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("save-file", filePath, content),
  setTitleBarOverlay: (dark: boolean) => ipcRenderer.invoke("set-title-bar-overlay", dark),
  titlebarHeight,
  platform: process.platform,
  checkWatchmanInstalled: (): Promise<boolean> => ipcRenderer.invoke("check-watchman-installed"),
  getHomeFolderPath: (): Promise<string> => ipcRenderer.invoke("get-home-folder-path"),
  startWatcher: (path: string) => ipcRenderer.invoke("start-watcher", path),
  stopWatcher: (workspacePath: string) => ipcRenderer.invoke("stop-watcher", workspacePath),
  onFileEvent: (handler: (evt: FileTreeEvent) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: FileTreeEvent) => {
      handler(payload)
    }
    ipcRenderer.on("file-event", listener)
    return () => ipcRenderer.removeListener("file-event", listener)
  },
  // Project-level Claude settings
  ensurePlansDirectory: (workspacePath: string) =>
    ipcRenderer.invoke("claude:project-settings:ensure-plans-dir", workspacePath),
  // CLI integration
  notifyFileClosed: (filePath: string) => ipcRenderer.invoke("cli:file-closed", filePath),
  updateCliWorkspaces: (workspaceFolders: string[]) =>
    ipcRenderer.invoke("cli:update-workspaces", workspaceFolders),
  popupMenu: (position: { x: number; y: number }) => ipcRenderer.invoke("menu:popup", position),
  onMenuAction: (handler: (action: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, action: string) => handler(action)
    ipcRenderer.on("menu:action", listener)
    return () => ipcRenderer.removeListener("menu:action", listener)
  },
  isPlaywright: process.env.IS_PLAYWRIGHT === "true",
  // Database IPC
  db: {
    invoke: (method: string, ...args: unknown[]) =>
      ipcRenderer.invoke("db:invoke", method, ...args),
    onInvalidate: (handler: (method: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, method: string) => {
        handler(method)
      }
      ipcRenderer.on("db:invalidate", listener)
      return () => ipcRenderer.removeListener("db:invalidate", listener)
    },
  },
  // Parser — tree-sitter runs in main process
  parser: {
    parseBlocks: (code: string, filePath?: string) =>
      ipcRenderer.invoke("parser:parse-blocks", code, filePath),
  },
  // Git integration
  git: {
    getCurrentBranch: (workspacePath: string): Promise<string | null> =>
      ipcRenderer.invoke("git:branch:current", workspacePath),
    isGitRepo: (workspacePath: string): Promise<boolean> =>
      ipcRenderer.invoke("git:is-repo", workspacePath),
    getStatus: (workspacePath: string) => ipcRenderer.invoke("git:status", workspacePath),
    getFileDiff: (workspacePath: string, filePath: string, baseRef?: string, targetRef?: string) =>
      ipcRenderer.invoke("git:file-diff", workspacePath, filePath, baseRef, targetRef),
    getCommitLog: (workspacePath: string, limit?: number) =>
      ipcRenderer.invoke("git:commit-log", workspacePath, limit),
  },
  exists: (path: string) => ipcRenderer.invoke("path-exists", path),
  createTerminal: (id: string, cols: number, rows: number, cwd?: string, surfaceId?: string) =>
    ipcRenderer.invoke("terminal:create", id, cols, rows, cwd, surfaceId),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke("terminal:resize", id, cols, rows),
  writeTerminal: (id: string, data: string) => ipcRenderer.invoke("terminal:write", id, data),
  killTerminal: (id: string) => ipcRenderer.invoke("terminal:kill", id),
  onTerminalOutput: (handler: (id: string, data: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { id: string; data: string }) => {
      handler(payload.id, payload.data)
    }
    ipcRenderer.on("terminal:output", listener)
    return () => ipcRenderer.removeListener("terminal:output", listener)
  },
  onIdeDisconnected: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on("terminal:ide-disconnected", listener)
    return () => ipcRenderer.removeListener("terminal:ide-disconnected", listener)
  },
})
