import type { ElectronAPI } from "@/types/electron"

export const createTerminal = (
  id: string,
  cols: number,
  rows: number,
  cwd?: string,
  surfaceId?: string,
  electronAPI: ElectronAPI = window.electronAPI,
) => electronAPI.createTerminal(id, cols, rows, cwd, surfaceId)

export const resizeTerminal = (
  id: string,
  cols: number,
  rows: number,
  electronAPI: ElectronAPI = window.electronAPI,
) => electronAPI.resizeTerminal(id, cols, rows)

export const writeTerminal = (
  id: string,
  data: string,
  electronAPI: ElectronAPI = window.electronAPI,
) => electronAPI.writeTerminal(id, data)

export const killTerminal = (id: string, electronAPI: ElectronAPI = window.electronAPI) =>
  electronAPI.killTerminal(id)

export const listTerminals = (electronAPI: ElectronAPI = window.electronAPI) =>
  electronAPI.listTerminals()

export const replayTerminal = (id: string, electronAPI: ElectronAPI = window.electronAPI) =>
  electronAPI.replayTerminal(id)

export const hasTerminal = (id: string, electronAPI: ElectronAPI = window.electronAPI) =>
  electronAPI.hasTerminal(id)

export const setTerminalTabState = (
  workspaceId: string,
  state: {
    tabs: Array<{ id: string; surfaceId: string; label: string; cwdPath: string }>
    activeId: string | null
  },
  electronAPI: ElectronAPI = window.electronAPI,
) => electronAPI.setTerminalTabState(workspaceId, state)

export const getTerminalTabState = (
  workspaceId: string,
  electronAPI: ElectronAPI = window.electronAPI,
) => electronAPI.getTerminalTabState(workspaceId)

export const onTerminalOutput = (
  handler: (id: string, data: string) => void,
  electronAPI: ElectronAPI = window.electronAPI,
) => electronAPI.onTerminalOutput(handler)
